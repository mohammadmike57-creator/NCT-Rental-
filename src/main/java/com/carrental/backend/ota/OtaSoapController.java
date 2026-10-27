package com.carrental.backend.ota;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.xml.sax.InputSource;

import javax.xml.transform.OutputKeys;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import java.io.StringReader;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;

/**
 * SOAP binding of the OTA adapter, for brokers whose systems only speak SOAP:
 *
 *   POST /ota/v1/{channel}/soap         SOAP 1.1 (text/xml) or 1.2 (application/soap+xml) envelope,
 *                                       Body = one OTA RQ message; answered with the RS in the same SOAP version
 *   GET  /ota/v1/{channel}/soap?wsdl    the WSDL (document/literal, SOAP 1.1 and 1.2 bindings)
 *
 * Credentials: WS-Security UsernameToken (Username = channel code, Password = API key), or
 * POS/Source/RequestorID MessagePassword in the OTA message, or the usual X-Api-Key header.
 * Business errors come back as the OTA RS with Errors (as OTA prescribes); a SOAP Fault is only
 * used when the envelope itself cannot be read.
 */
@RestController
@RequestMapping("/ota/v1/{channel}/soap")
public class OtaSoapController {

    static final String SOAP11 = "http://schemas.xmlsoap.org/soap/envelope/";
    static final String SOAP12 = "http://www.w3.org/2003/05/soap-envelope";
    private static final MediaType TEXT_XML = new MediaType("text", "xml", StandardCharsets.UTF_8);
    private static final MediaType SOAP12_TYPE = new MediaType("application", "soap+xml", StandardCharsets.UTF_8);

    private final OtaBookingController ota;

    public OtaSoapController(OtaBookingController ota) {
        this.ota = ota;
    }

    @GetMapping
    public ResponseEntity<String> wsdl(@PathVariable String channel, HttpServletRequest http) {
        String address = http.getRequestURL().toString();
        String proto = http.getHeader("X-Forwarded-Proto");
        if ("https".equalsIgnoreCase(proto) && address.startsWith("http:")) address = "https:" + address.substring(5);
        return ResponseEntity.ok().contentType(TEXT_XML).header("Cache-Control", "public, max-age=3600").body(ChannelSchemas.wsdl(address));
    }

    @PostMapping(consumes = MediaType.ALL_VALUE)
    public ResponseEntity<String> call(@PathVariable String channel, @RequestBody(required = false) String body,
                                       @RequestHeader(value = "Idempotency-Key", required = false) String idem, HttpServletRequest http) {
        String version = SOAP11;
        try {
            if (body == null || body.isBlank()) throw new IllegalArgumentException("Empty request");
            if (body.length() > OtaRequestParser.MAX_REQUEST_BYTES) throw new IllegalArgumentException("Request body is too large");
            var builder = OtaRequestParser.secureBuilder();
            builder.setErrorHandler(null);
            Document doc = builder.parse(new InputSource(new StringReader(body)));
            Element env = doc.getDocumentElement();
            if (!"Envelope".equals(env.getLocalName()) || !(SOAP11.equals(env.getNamespaceURI()) || SOAP12.equals(env.getNamespaceURI()))) {
                throw new IllegalArgumentException("Not a SOAP 1.1 or 1.2 Envelope");
            }
            version = env.getNamespaceURI();
            Element bodyEl = child(env, "Body");
            Element message = bodyEl == null ? null : firstElement(bodyEl);
            if (message == null) throw new IllegalArgumentException("SOAP Body is empty");
            String rq = message.getLocalName();
            if (!OtaBookingController.MESSAGES.contains(rq)) throw new IllegalArgumentException("Unsupported message " + rq);

            String key = PartnerKeyVerifier.extractKey(http.getHeader("Authorization"), http.getHeader("X-Api-Key"));
            String user = null;
            Element header = child(env, "Header");
            Element token = header == null ? null : OtaBookingXml.first(header, "UsernameToken");
            if (token != null) {
                if (key == null || key.isBlank()) key = OtaBookingXml.text(OtaBookingXml.first(token, "Password"));
                user = OtaBookingXml.text(OtaBookingXml.first(token, "Username"));
            }
            // The UsernameToken names the channel; when it disagrees with the URL, authentication must fail.
            if (user != null && !user.isBlank() && !user.equalsIgnoreCase(channel)) key = "";

            http.setAttribute(ChannelTrafficService.FORMAT_ATTR, "SOAP");
            http.setAttribute(ChannelTrafficService.RAW_BODY_ATTR, body);   // the log keeps the whole envelope
            ResponseEntity<String> rs = ota.dispatch(channel, rq, serialize(message), key, idem, http);
            String inner = rs.getBody() == null ? "" : rs.getBody().replaceFirst("^<\\?xml[^>]*\\?>\\s*", "");
            // OTA errors travel in the RS; the HTTP status stays 200 except for authentication and server errors.
            int status = rs.getStatusCode().value() == 401 || rs.getStatusCode().value() >= 500 ? rs.getStatusCode().value() : 200;
            return ResponseEntity.status(status).contentType(type(version)).headers(h -> {
                String rid = rs.getHeaders().getFirst("X-Request-ID");
                if (rid != null) h.set("X-Request-ID", rid);
                h.set("Cache-Control", "no-store");
            }).body(envelope(version, inner));
        } catch (Exception e) {
            String msg = e instanceof IllegalArgumentException ? e.getMessage() : "The SOAP envelope could not be read";
            return ResponseEntity.status(SOAP12.equals(version) ? 400 : 500).contentType(type(version)).body(fault(version, msg));
        }
    }

    static String envelope(String version, String inner) {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<soap:Envelope xmlns:soap=\"" + version + "\">\n  <soap:Header/>\n  <soap:Body>\n"
            + inner.indent(4) + "  </soap:Body>\n</soap:Envelope>";
    }

    static String fault(String version, String message) {
        String m = OtaXml.escape(message);
        String fault = SOAP12.equals(version)
            ? "<soap:Fault><soap:Code><soap:Value>soap:Sender</soap:Value></soap:Code><soap:Reason><soap:Text xml:lang=\"en\">" + m + "</soap:Text></soap:Reason></soap:Fault>"
            : "<soap:Fault><faultcode>soap:Client</faultcode><faultstring>" + m + "</faultstring></soap:Fault>";
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<soap:Envelope xmlns:soap=\"" + version + "\"><soap:Body>" + fault + "</soap:Body></soap:Envelope>";
    }

    private static MediaType type(String version) { return SOAP12.equals(version) ? SOAP12_TYPE : TEXT_XML; }

    private static Element child(Element parent, String local) {
        for (Node n = parent.getFirstChild(); n != null; n = n.getNextSibling()) {
            if (n instanceof Element e && local.equals(e.getLocalName())) return e;
        }
        return null;
    }

    private static Element firstElement(Element parent) {
        for (Node n = parent.getFirstChild(); n != null; n = n.getNextSibling()) if (n instanceof Element e) return e;
        return null;
    }

    /** The OTA message as a standalone document, keeping its namespace declarations. */
    private static String serialize(Element message) throws Exception {
        var t = TransformerFactory.newInstance();
        t.setAttribute(javax.xml.XMLConstants.ACCESS_EXTERNAL_DTD, "");
        t.setAttribute(javax.xml.XMLConstants.ACCESS_EXTERNAL_STYLESHEET, "");
        var tr = t.newTransformer();
        tr.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, "yes");
        StringWriter w = new StringWriter();
        tr.transform(new DOMSource(message), new StreamResult(w));
        return w.toString();
    }
}
