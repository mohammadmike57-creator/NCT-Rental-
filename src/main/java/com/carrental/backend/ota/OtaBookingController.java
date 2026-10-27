package com.carrental.backend.ota;

import com.carrental.backend.ota.ChannelError.ChannelException;
import com.carrental.backend.ota.ChannelModels.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.function.Function;

/**
 * OpenTravel XML adapter of the channel gateway. Authenticated with the channel's feed key
 * (Authorization: Bearer <key> or X-Api-Key). Writes accept an Idempotency-Key header.
 *
 *   POST /ota/v1/{channel}/OTA_VehLocSearch     OTA_VehLocSearchRQ → RS   stations sold on this channel
 *   POST /ota/v1/{channel}/OTA_VehAvailRate     OTA_VehAvailRateRQ → RS   live availability, prices and offer ids
 *   POST /ota/v1/{channel}/OTA_VehRes           OTA_VehResRQ       → RS   book (from an offer, or dates + SIPP)
 *   POST /ota/v1/{channel}/OTA_VehRetRes        OTA_VehRetResRQ    → RS   retrieve (also /OTA_VehResRetrieve)
 *   POST /ota/v1/{channel}/OTA_VehModify        OTA_VehModifyRQ    → RS   amend dates, car group, extras, driver
 *   POST /ota/v1/{channel}/OTA_VehCancel        OTA_VehCancelRQ    → RS   cancel, with fee and refund
 *   POST /ota/v1/{channel}/OTA_VehRateRule      OTA_VehRateRuleRQ  → RS   full terms of an offer before booking
 *   POST /ota/v1/{channel}/OTA_VehLocDetail     OTA_VehLocDetailRQ → RS   one station in full
 *   POST /ota/v1/{channel}/OTA_Ping             OTA_PingRQ         → RS   credentials and service check
 *
 * The same messages are accepted inside a SOAP 1.1 / 1.2 envelope at /ota/v1/{channel}/soap
 * (OtaSoapController). The key may also travel as POS/Source/RequestorID MessagePassword.
 */
@RestController
@RequestMapping("/ota/v1/{channel}")
public class OtaBookingController {

    private static final MediaType XML = new MediaType("application", "xml", StandardCharsets.UTF_8);
    private static final String[] CONSUMES = {MediaType.APPLICATION_XML_VALUE, MediaType.TEXT_XML_VALUE, MediaType.ALL_VALUE};

    private final ChannelGateway gateway;
    private final ChannelBookingService core;

    public OtaBookingController(ChannelGateway gateway, ChannelBookingService core) {
        this.gateway = gateway;
        this.core = core;
    }

    @PostMapping(value = "/OTA_VehLocSearch", consumes = {MediaType.APPLICATION_XML_VALUE, MediaType.TEXT_XML_VALUE, MediaType.ALL_VALUE})
    public ResponseEntity<String> locations(@PathVariable String channel, @RequestBody(required = false) String body, HttpServletRequest http) {
        return dispatch(channel, "OTA_VehLocSearchRQ", body, headerKey(http), http.getHeader("Idempotency-Key"), http);
    }

    @PostMapping(value = "/OTA_VehAvailRate", consumes = {MediaType.APPLICATION_XML_VALUE, MediaType.TEXT_XML_VALUE, MediaType.ALL_VALUE})
    public ResponseEntity<String> availability(@PathVariable String channel, @RequestBody(required = false) String body, HttpServletRequest http) {
        return dispatch(channel, "OTA_VehAvailRateRQ", body, headerKey(http), null, http);
    }

    @PostMapping(value = "/OTA_VehRes", consumes = {MediaType.APPLICATION_XML_VALUE, MediaType.TEXT_XML_VALUE, MediaType.ALL_VALUE})
    public ResponseEntity<String> book(@PathVariable String channel, @RequestBody(required = false) String body,
                                       @RequestHeader(value = "Idempotency-Key", required = false) String idem, HttpServletRequest http) {
        return dispatch(channel, "OTA_VehResRQ", body, headerKey(http), idem, http);
    }

    @PostMapping(value = {"/OTA_VehRetRes", "/OTA_VehResRetrieve"}, consumes = {MediaType.APPLICATION_XML_VALUE, MediaType.TEXT_XML_VALUE, MediaType.ALL_VALUE})
    public ResponseEntity<String> retrieve(@PathVariable String channel, @RequestBody(required = false) String body, HttpServletRequest http) {
        return dispatch(channel, "OTA_VehRetResRQ", body, headerKey(http), null, http);
    }

    @PostMapping(value = "/OTA_VehModify", consumes = {MediaType.APPLICATION_XML_VALUE, MediaType.TEXT_XML_VALUE, MediaType.ALL_VALUE})
    public ResponseEntity<String> modify(@PathVariable String channel, @RequestBody(required = false) String body, HttpServletRequest http) {
        return dispatch(channel, "OTA_VehModifyRQ", body, headerKey(http), null, http);
    }

    @PostMapping(value = "/OTA_VehCancel", consumes = {MediaType.APPLICATION_XML_VALUE, MediaType.TEXT_XML_VALUE, MediaType.ALL_VALUE})
    public ResponseEntity<String> cancel(@PathVariable String channel, @RequestBody(required = false) String body, HttpServletRequest http) {
        return dispatch(channel, "OTA_VehCancelRQ", body, headerKey(http), null, http);
    }

    @PostMapping(value = "/OTA_VehRateRule", consumes = {MediaType.APPLICATION_XML_VALUE, MediaType.TEXT_XML_VALUE, MediaType.ALL_VALUE})
    public ResponseEntity<String> rateRule(@PathVariable String channel, @RequestBody(required = false) String body, HttpServletRequest http) {
        return dispatch(channel, "OTA_VehRateRuleRQ", body, headerKey(http), null, http);
    }

    @PostMapping(value = "/OTA_VehLocDetail", consumes = {MediaType.APPLICATION_XML_VALUE, MediaType.TEXT_XML_VALUE, MediaType.ALL_VALUE})
    public ResponseEntity<String> locationDetail(@PathVariable String channel, @RequestBody(required = false) String body, HttpServletRequest http) {
        return dispatch(channel, "OTA_VehLocDetailRQ", body, headerKey(http), null, http);
    }

    @PostMapping(value = "/OTA_Ping", consumes = {MediaType.APPLICATION_XML_VALUE, MediaType.TEXT_XML_VALUE, MediaType.ALL_VALUE})
    public ResponseEntity<String> ping(@PathVariable String channel, @RequestBody(required = false) String body, HttpServletRequest http) {
        return dispatch(channel, "OTA_PingRQ", body, headerKey(http), null, http);
    }

    static final java.util.Set<String> MESSAGES = java.util.Set.of("OTA_VehLocSearchRQ", "OTA_VehAvailRateRQ", "OTA_VehResRQ",
        "OTA_VehRetResRQ", "OTA_VehModifyRQ", "OTA_VehCancelRQ", "OTA_VehRateRuleRQ", "OTA_VehLocDetailRQ", "OTA_PingRQ");

    /**
     * Runs one OTA message (also used by the SOAP endpoint). The key comes from the HTTP headers,
     * or else from POS/Source/RequestorID MessagePassword in the message itself.
     */
    ResponseEntity<String> dispatch(String channel, String rq, String body, String key, String idem, HttpServletRequest http) {
        String type = rq.substring(0, rq.length() - 2);
        String errorRoot = type + "RS";
        if (key == null || key.isBlank()) key = posPassword(body);
        Function<ChannelGateway.Call, String> action = switch (rq) {
            case "OTA_VehLocSearchRQ" -> c -> {
                OtaBookingXml.Parsed p = body == null || body.isBlank() ? null : OtaBookingXml.parse(body, rq);
                return OtaBookingXml.locations(p == null ? null : p.echoToken(), prod(c), core.locations(c.ctx()), c.ctx().channel().vendorCode());
            };
            case "OTA_VehAvailRateRQ" -> c -> {
                OtaBookingXml.Parsed p = OtaBookingXml.parse(body, rq);
                Search s = OtaBookingXml.search(p.root(), c.ctx().rules());
                List<Offer> offers;
                String warning = null;
                try {
                    offers = core.search(c.ctx(), s);
                    if (offers.stream().noneMatch(o -> "Available".equals(o.status()))) warning = "No vehicles available for these dates";
                } catch (ChannelException e) {
                    if (e.error != ChannelError.NO_AVAILABILITY) throw e;
                    offers = List.of();
                    warning = e.getMessage();
                }
                return OtaBookingXml.availability(p.echoToken(), prod(c), s, offers, c.ctx().channel().vendorCode(), warning);
            };
            case "OTA_VehResRQ" -> c -> {
                OtaBookingXml.Parsed p = OtaBookingXml.parse(body, rq);
                Reservation r = core.create(c.ctx(), OtaBookingXml.booking(p.root(), c.ctx().rules(), idem));
                return OtaBookingXml.reservation("OTA_VehResRS", p.echoToken(), prod(c), r, c.ctx().channel().vendorCode());
            };
            case "OTA_VehRetResRQ" -> c -> {
                OtaBookingXml.Parsed p = OtaBookingXml.parse(body, rq);
                Reservation r = core.get(c.ctx(), OtaBookingXml.uniqueId(p.root()));
                checkSurname(p, r);
                return OtaBookingXml.reservation("OTA_VehRetResRS", p.echoToken(), prod(c), r, c.ctx().channel().vendorCode());
            };
            case "OTA_VehModifyRQ" -> c -> {
                OtaBookingXml.Parsed p = OtaBookingXml.parse(body, rq);
                Reservation r = core.modify(c.ctx(), OtaBookingXml.modify(p.root(), c.ctx().rules()));
                return OtaBookingXml.reservation("OTA_VehModifyRS", p.echoToken(), prod(c), r, c.ctx().channel().vendorCode());
            };
            case "OTA_VehCancelRQ" -> c -> {
                OtaBookingXml.Parsed p = OtaBookingXml.parse(body, rq);
                String id = OtaBookingXml.uniqueId(p.root());
                checkSurname(p, core.get(c.ctx(), id));
                Reservation r = core.cancel(c.ctx(), id, OtaBookingXml.text(OtaBookingXml.first(OtaBookingXml.first(p.root(), "TPA_Extensions"), "Reason")));
                return OtaBookingXml.reservation("OTA_VehCancelRS", p.echoToken(), prod(c), r, c.ctx().channel().vendorCode());
            };
            case "OTA_VehRateRuleRQ" -> c -> {
                OtaBookingXml.Parsed p = OtaBookingXml.parse(body, rq);
                String offer = OtaBookingXml.offerReference(p.root());
                Search s = OtaBookingXml.first(p.root(), "VehRentalCore") == null ? null : OtaBookingXml.search(p.root(), c.ctx().rules());
                if (offer == null && s == null) throw ChannelError.INVALID_REQUEST.ex("Send Reference Type=\"16\" with the offer id, or VehRentalCore and VehPref");
                RateRule rr = core.rateRule(c.ctx(), offer, s);
                return OtaBookingXml.rateRule(p.echoToken(), prod(c), rr.search(), rr, c.ctx().channel().vendorCode());
            };
            case "OTA_VehLocDetailRQ" -> c -> {
                OtaBookingXml.Parsed p = OtaBookingXml.parse(body, rq);
                String code = OtaBookingXml.attr(OtaBookingXml.first(p.root(), "Location"), "LocationCode");
                if (code.isEmpty()) code = OtaBookingXml.attr(OtaBookingXml.first(p.root(), "LocationDetail"), "Code");
                if (code.isEmpty()) throw ChannelError.INVALID_REQUEST.ex("Location LocationCode is required");
                return OtaBookingXml.locationDetail(p.echoToken(), prod(c), core.location(c.ctx(), code), c.ctx().channel().vendorCode());
            };
            case "OTA_PingRQ" -> c -> {
                OtaBookingXml.Parsed p = body == null || body.isBlank() ? null : OtaBookingXml.parse(body, rq);
                return OtaBookingXml.ping(p == null ? null : p.echoToken(), prod(c), p == null ? null : OtaBookingXml.text(OtaBookingXml.first(p.root(), "EchoData")));
            };
            default -> throw new IllegalArgumentException(rq);
        };
        return run(channel, body, key, http, type, errorRoot, action);
    }

    /** When the partner sends the surname (as OTA does), it must match the booking. */
    private static void checkSurname(OtaBookingXml.Parsed p, Reservation r) {
        String s = OtaBookingXml.surname(p.root());
        if (!s.isEmpty() && !s.equalsIgnoreCase(r.customer().lastName())) {
            throw ChannelError.RESERVATION_NOT_FOUND.ex("No reservation " + r.reservationId() + " for that surname");
        }
    }

    private ResponseEntity<String> run(String channel, String body, String key, HttpServletRequest http, String type, String errorRoot,
                                       Function<ChannelGateway.Call, String> action) {
        String echo = echo(body);
        return gateway.handle(channel, key, http, type, body, http.getHeader("X-Request-ID"),
            c -> new ChannelGateway.Rendered(action.apply(c), XML),
            (e, rid) -> new ChannelGateway.Rendered(OtaBookingXml.error(errorRoot, echo, true, e, rid), XML));
    }

    private static String headerKey(HttpServletRequest http) {
        return PartnerKeyVerifier.extractKey(http.getHeader("Authorization"), http.getHeader("X-Api-Key"));
    }

    /** POS/Source/RequestorID MessagePassword, the OTA way of sending credentials inside the message. */
    static String posPassword(String body) {
        if (body == null || body.isBlank() || !body.contains("MessagePassword") || body.length() > OtaRequestParser.MAX_REQUEST_BYTES) return null;
        try {
            var b = OtaRequestParser.secureBuilder();
            b.setErrorHandler(null);
            var doc = b.parse(new org.xml.sax.InputSource(new java.io.StringReader(body)));
            String pw = OtaBookingXml.attr(OtaBookingXml.first(doc.getDocumentElement(), "RequestorID"), "MessagePassword");
            return pw.isEmpty() ? null : pw;
        } catch (Exception e) {
            return null;     // the message itself is rejected later with a proper error
        }
    }

    private static boolean prod(ChannelGateway.Call c) { return !c.ctx().sandbox(); }

    /** EchoToken from a body that may not even parse, so errors still echo it. */
    private static String echo(String body) {
        if (body == null) return null;
        int i = body.indexOf("EchoToken=\"");
        if (i < 0 || i > 2000) return null;
        int j = body.indexOf('"', i + 11);
        return j < 0 || j - i > 80 ? null : body.substring(i + 11, j);
    }
}
