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
        return run(channel, body, http, "OTA_VehLocSearch", "OTA_VehLocSearchRS", c -> {
            OtaBookingXml.Parsed p = body == null || body.isBlank() ? null : OtaBookingXml.parse(body, "OTA_VehLocSearchRQ");
            return OtaBookingXml.locations(p == null ? null : p.echoToken(), prod(c), core.locations(c.ctx()), c.ctx().channel().vendorCode());
        });
    }

    @PostMapping(value = "/OTA_VehAvailRate", consumes = {MediaType.APPLICATION_XML_VALUE, MediaType.TEXT_XML_VALUE, MediaType.ALL_VALUE})
    public ResponseEntity<String> availability(@PathVariable String channel, @RequestBody(required = false) String body, HttpServletRequest http) {
        return run(channel, body, http, "OTA_VehAvailRate", "OTA_VehAvailRateRS", c -> {
            OtaBookingXml.Parsed p = OtaBookingXml.parse(body, "OTA_VehAvailRateRQ");
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
        });
    }

    @PostMapping(value = "/OTA_VehRes", consumes = {MediaType.APPLICATION_XML_VALUE, MediaType.TEXT_XML_VALUE, MediaType.ALL_VALUE})
    public ResponseEntity<String> book(@PathVariable String channel, @RequestBody(required = false) String body,
                                       @RequestHeader(value = "Idempotency-Key", required = false) String idem, HttpServletRequest http) {
        return run(channel, body, http, "OTA_VehRes", "OTA_VehResRS", c -> {
            OtaBookingXml.Parsed p = OtaBookingXml.parse(body, "OTA_VehResRQ");
            Reservation r = core.create(c.ctx(), OtaBookingXml.booking(p.root(), c.ctx().rules(), idem));
            return OtaBookingXml.reservation("OTA_VehResRS", p.echoToken(), prod(c), r, c.ctx().channel().vendorCode());
        });
    }

    @PostMapping(value = {"/OTA_VehRetRes", "/OTA_VehResRetrieve"}, consumes = {MediaType.APPLICATION_XML_VALUE, MediaType.TEXT_XML_VALUE, MediaType.ALL_VALUE})
    public ResponseEntity<String> retrieve(@PathVariable String channel, @RequestBody(required = false) String body, HttpServletRequest http) {
        return run(channel, body, http, "OTA_VehRetRes", "OTA_VehRetResRS", c -> {
            OtaBookingXml.Parsed p = OtaBookingXml.parse(body, "OTA_VehRetResRQ");
            Reservation r = core.get(c.ctx(), OtaBookingXml.uniqueId(p.root()));
            checkSurname(p, r);
            return OtaBookingXml.reservation("OTA_VehRetResRS", p.echoToken(), prod(c), r, c.ctx().channel().vendorCode());
        });
    }

    @PostMapping(value = "/OTA_VehModify", consumes = {MediaType.APPLICATION_XML_VALUE, MediaType.TEXT_XML_VALUE, MediaType.ALL_VALUE})
    public ResponseEntity<String> modify(@PathVariable String channel, @RequestBody(required = false) String body, HttpServletRequest http) {
        return run(channel, body, http, "OTA_VehModify", "OTA_VehModifyRS", c -> {
            OtaBookingXml.Parsed p = OtaBookingXml.parse(body, "OTA_VehModifyRQ");
            Reservation r = core.modify(c.ctx(), OtaBookingXml.modify(p.root(), c.ctx().rules()));
            return OtaBookingXml.reservation("OTA_VehModifyRS", p.echoToken(), prod(c), r, c.ctx().channel().vendorCode());
        });
    }

    @PostMapping(value = "/OTA_VehCancel", consumes = {MediaType.APPLICATION_XML_VALUE, MediaType.TEXT_XML_VALUE, MediaType.ALL_VALUE})
    public ResponseEntity<String> cancel(@PathVariable String channel, @RequestBody(required = false) String body, HttpServletRequest http) {
        return run(channel, body, http, "OTA_VehCancel", "OTA_VehCancelRS", c -> {
            OtaBookingXml.Parsed p = OtaBookingXml.parse(body, "OTA_VehCancelRQ");
            String id = OtaBookingXml.uniqueId(p.root());
            checkSurname(p, core.get(c.ctx(), id));
            Reservation r = core.cancel(c.ctx(), id, OtaBookingXml.text(OtaBookingXml.first(OtaBookingXml.first(p.root(), "TPA_Extensions"), "Reason")));
            return OtaBookingXml.reservation("OTA_VehCancelRS", p.echoToken(), prod(c), r, c.ctx().channel().vendorCode());
        });
    }

    /** When the partner sends the surname (as OTA does), it must match the booking. */
    private static void checkSurname(OtaBookingXml.Parsed p, Reservation r) {
        String s = OtaBookingXml.surname(p.root());
        if (!s.isEmpty() && !s.equalsIgnoreCase(r.customer().lastName())) {
            throw ChannelError.RESERVATION_NOT_FOUND.ex("No reservation " + r.reservationId() + " for that surname");
        }
    }

    private ResponseEntity<String> run(String channel, String body, HttpServletRequest http, String type, String errorRoot,
                                       Function<ChannelGateway.Call, String> action) {
        String key = PartnerKeyVerifier.extractKey(http.getHeader("Authorization"), http.getHeader("X-Api-Key"));
        String echo = echo(body);
        return gateway.handle(channel, key, http, type, body == null ? 0 : body.length(), http.getHeader("X-Request-ID"),
            c -> new ChannelGateway.Rendered(action.apply(c), XML),
            (e, rid) -> new ChannelGateway.Rendered(OtaBookingXml.error(errorRoot, echo, true, e, rid), XML));
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
