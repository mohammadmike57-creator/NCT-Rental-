package com.carrental.backend.ota;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.xml.sax.InputSource;

import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;

/**
 * Distribution platform v3, OTA layer: the same nine OTA messages under release-specific addresses,
 *   POST /ota/2018A/{channel}/{Message}   legacy OpenTravel brokers
 *   POST /ota/2024A/{channel}/{Message}   the default for new XML brokers
 * plus version-neutral utilities: /ota/{channel}/ping, /ota/{channel}/ratesheet, /ota/{channel}/soap (?wsdl).
 *
 * The release is chosen by the path. These addresses are strict: the body must be a single OTA message in the
 * OpenTravel namespace whose root matches the address, otherwise the broker gets OTA error 321 before anything
 * runs. Everything else (security, availability, pricing, booking, idempotency, logging) is the same core as
 * /ota/v1, which stays exactly as it is for the brokers already connected (HOG, AUE).
 */
@RestController
public class OtaVersionedController {

    static final MediaType XML = new MediaType("application", "xml", StandardCharsets.UTF_8);
    /** Address name -> OTA request root. */
    static final Map<String, String> MESSAGES = Map.ofEntries(
        Map.entry("OTA_Ping", "OTA_PingRQ"),
        Map.entry("OTA_VehLocSearch", "OTA_VehLocSearchRQ"),
        Map.entry("OTA_VehLocDetail", "OTA_VehLocDetailRQ"),
        Map.entry("OTA_VehAvailRate", "OTA_VehAvailRateRQ"),
        Map.entry("OTA_VehRateRule", "OTA_VehRateRuleRQ"),
        Map.entry("OTA_VehRes", "OTA_VehResRQ"),
        Map.entry("OTA_VehRetRes", "OTA_VehRetResRQ"),
        Map.entry("OTA_VehResRetrieve", "OTA_VehRetResRQ"),
        Map.entry("OTA_VehModify", "OTA_VehModifyRQ"),
        Map.entry("OTA_VehCancel", "OTA_VehCancelRQ"));

    private final OtaBookingController ota;
    private final OtaPartnerController partner;
    private final OtaSoapController soap;

    public OtaVersionedController(OtaBookingController ota, OtaPartnerController partner, OtaSoapController soap) {
        this.ota = ota;
        this.partner = partner;
        this.soap = soap;
    }

    @RequestMapping("/ota/{release:2018A|2024A}/{channel}/{message:OTA_[A-Za-z]+}")
    public ResponseEntity<String> message(@PathVariable String release, @PathVariable String channel, @PathVariable String message,
                                          @RequestBody(required = false) String body, HttpServletRequest http) {
        String rq = MESSAGES.get(message);
        if (rq == null) return error(message + "RS", HttpStatus.NOT_FOUND, http, ChannelError.INVALID_REQUEST.ex(
            "Unknown message " + message + ". Supported: " + String.join(", ", new java.util.TreeSet<>(MESSAGES.keySet()))));
        String rs = rq.substring(0, rq.length() - 2) + "RS";
        if (!"POST".equals(http.getMethod())) return error(rs, HttpStatus.METHOD_NOT_ALLOWED, http, ChannelError.INVALID_REQUEST.ex(message + " must be sent with HTTP POST"));
        String problem = schemaProblem(body, rq);
        if (problem != null) return error(rs, HttpStatus.BAD_REQUEST, http, ChannelError.INVALID_REQUEST.ex("OTA " + release + " schema check failed: " + problem));
        String key = PartnerKeyVerifier.extractKey(http.getHeader("Authorization"), http.getHeader("X-Api-Key"));
        ResponseEntity<String> out = ota.dispatch(channel, rq, body, key, http.getHeader("Idempotency-Key"), http);
        return ResponseEntity.status(out.getStatusCode()).headers(out.getHeaders()).header("X-OTA-Release", release).body(out.getBody());
    }

    @GetMapping("/ota/{channel}/ping")
    public ResponseEntity<String> ping(@PathVariable String channel, HttpServletRequest http) {
        return partner.ping(channel, http.getHeader("Authorization"), http.getHeader("X-Api-Key"), http);
    }

    @GetMapping("/ota/{channel}/ratesheet")
    public ResponseEntity<String> rateSheet(@PathVariable String channel, HttpServletRequest http) {
        return partner.rateSheet(channel, http.getHeader("Authorization"), http.getHeader("X-Api-Key"), http);
    }

    @GetMapping("/ota/{channel}/soap")
    public ResponseEntity<String> wsdl(@PathVariable String channel, HttpServletRequest http) {
        return soap.wsdl(channel, http);
    }

    @PostMapping(value = "/ota/{channel}/soap", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<String> soapCall(@PathVariable String channel, @RequestBody(required = false) String body,
                                           @RequestHeader(value = "Idempotency-Key", required = false) String idem, HttpServletRequest http) {
        return soap.call(channel, body, idem, http);
    }

    /** Null when the body is one well-formed OTA message with the expected root, else what is wrong (no request data echoed). */
    static String schemaProblem(String body, String expectedRoot) {
        if (body == null || body.isBlank()) return "empty request body";
        if (body.length() > OtaRequestParser.MAX_REQUEST_BYTES) return "request larger than " + (OtaRequestParser.MAX_REQUEST_BYTES / 1024) + " KB";
        Document doc;
        try {
            var b = OtaRequestParser.secureBuilder();
            b.setErrorHandler(null);
            doc = b.parse(new InputSource(new StringReader(body)));
        } catch (Exception e) {
            return "not well-formed XML";
        }
        Element root = doc.getDocumentElement();
        String name = root.getLocalName() == null ? root.getNodeName() : root.getLocalName();
        if (!expectedRoot.equals(name)) return "root element must be " + expectedRoot;
        if (!OtaXml.OTA_NAMESPACE.equals(root.getNamespaceURI())) return "root element must be in namespace " + OtaXml.OTA_NAMESPACE;
        return null;
    }

    private static ResponseEntity<String> error(String rs, HttpStatus status, HttpServletRequest http, ChannelError.ChannelException e) {
        String rid = http.getHeader("X-Request-ID");
        if (rid == null || rid.isBlank()) rid = UUID.randomUUID().toString();
        return ResponseEntity.status(status).contentType(XML).header("X-Request-ID", rid).body(OtaBookingXml.error(rs, null, true, e, rid));
    }
}
