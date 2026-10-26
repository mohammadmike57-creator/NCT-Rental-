package com.carrental.backend.ota;

import com.carrental.backend.ota.ChannelError.ChannelException;
import com.carrental.backend.ota.ChannelModels.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

/**
 * REST/JSON adapter of the channel gateway (snake_case JSON). Authenticated with the channel's
 * feed key (Authorization: Bearer <key> or X-Api-Key); writes accept an Idempotency-Key header.
 *
 *   GET   /partner/v1/{channel}/locations
 *   GET   /partner/v1/{channel}/vehicle-groups
 *   GET   /partner/v1/{channel}/extras
 *   POST  /partner/v1/{channel}/availability                  search → offers
 *   POST  /partner/v1/{channel}/quotes                        {"offer_id"} → re-validated offer, car held
 *   POST  /partner/v1/{channel}/reservations                  book
 *   GET   /partner/v1/{channel}/reservations/{id}             by our number or the broker reference
 *   PATCH /partner/v1/{channel}/reservations/{id}             amend
 *   POST  /partner/v1/{channel}/reservations/{id}/cancel      cancel
 */
@RestController
@RequestMapping("/partner/v1/{channel}")
public class PartnerRestController {

    static final ObjectMapper JSON = new ObjectMapper().registerModule(new JavaTimeModule())
        .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    private final ChannelGateway gateway;
    private final ChannelBookingService core;

    public PartnerRestController(ChannelGateway gateway, ChannelBookingService core) {
        this.gateway = gateway;
        this.core = core;
    }

    @GetMapping("/locations")
    public ResponseEntity<String> locations(@PathVariable String channel, HttpServletRequest http) {
        return run(channel, null, http, "REST locations", c -> envelope(c, "locations", core.locations(c.ctx())));
    }

    @GetMapping("/vehicle-groups")
    public ResponseEntity<String> groups(@PathVariable String channel, HttpServletRequest http) {
        return run(channel, null, http, "REST vehicle-groups", c -> envelope(c, "vehicle_groups", core.vehicleGroups(c.ctx())));
    }

    @GetMapping("/extras")
    public ResponseEntity<String> extras(@PathVariable String channel, HttpServletRequest http) {
        return run(channel, null, http, "REST extras", c -> envelope(c, "extras", core.extras(c.ctx())));
    }

    @PostMapping(value = "/availability", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<String> availability(@PathVariable String channel, @RequestBody(required = false) String body, HttpServletRequest http) {
        return run(channel, body, http, "REST availability", c -> {
            List<Offer> offers = core.search(c.ctx(), search(read(body), c.ctx().rules(), true));
            if (offers.stream().noneMatch(o -> "Available".equals(o.status()))) throw ChannelError.NO_AVAILABILITY.ex(null);
            return envelope(c, "offers", offers);
        });
    }

    @PostMapping(value = "/quotes", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<String> quote(@PathVariable String channel, @RequestBody(required = false) String body, HttpServletRequest http) {
        return run(channel, body, http, "REST quote", c -> envelope(c, "offer", core.quote(c.ctx(), read(body).path("offer_id").asText(""))));
    }

    @PostMapping(value = "/reservations", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<String> create(@PathVariable String channel, @RequestBody(required = false) String body,
                                         @RequestHeader(value = "Idempotency-Key", required = false) String idem, HttpServletRequest http) {
        return run(channel, body, http, "REST create", c -> {
            JsonNode b = read(body);
            JsonNode it = b.path("itinerary");
            BookingRequest req = new BookingRequest(text(b, "offer_id"), text(b, "broker_reference"),
                idem != null ? idem : text(b, "idempotency_key"), it.isObject() ? search(it, c.ctx().rules(), true) : null,
                customer(b.path("customer")), driver(b.path("driver")), decimal(b, "expected_total"), text(b, "comments"), text(b, "flight_number"));
            return envelope(c, "reservation", core.create(c.ctx(), req));
        });
    }

    @GetMapping("/reservations/{id}")
    public ResponseEntity<String> get(@PathVariable String channel, @PathVariable String id, HttpServletRequest http) {
        return run(channel, null, http, "REST retrieve", c -> envelope(c, "reservation", core.get(c.ctx(), id)));
    }

    @PatchMapping(value = "/reservations/{id}", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<String> modify(@PathVariable String channel, @PathVariable String id, @RequestBody(required = false) String body, HttpServletRequest http) {
        return run(channel, body, http, "REST modify", c -> {
            JsonNode b = read(body);
            JsonNode it = b.path("itinerary");
            ModifyRequest req = new ModifyRequest(id, it.isObject() ? search(it, c.ctx().rules(), false) : null,
                b.has("customer") ? customer(b.path("customer")) : null, b.has("driver") ? driver(b.path("driver")) : null,
                decimal(b, "expected_total"), text(b, "comments"));
            return envelope(c, "reservation", core.modify(c.ctx(), req));
        });
    }

    @PostMapping(value = "/reservations/{id}/cancel", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<String> cancel(@PathVariable String channel, @PathVariable String id, @RequestBody(required = false) String body, HttpServletRequest http) {
        return run(channel, body, http, "REST cancel", c -> envelope(c, "reservation", core.cancel(c.ctx(), id, body == null || body.isBlank() ? null : text(read(body), "reason"))));
    }

    // ------------------------------------------------------------

    private ResponseEntity<String> run(String channel, String body, HttpServletRequest http, String type, Function<ChannelGateway.Call, String> action) {
        String key = PartnerKeyVerifier.extractKey(http.getHeader("Authorization"), http.getHeader("X-Api-Key"));
        return gateway.handle(channel, key, http, type, body == null ? 0 : body.length(), http.getHeader("X-Request-ID"),
            c -> new ChannelGateway.Rendered(action.apply(c), MediaType.APPLICATION_JSON),
            (e, rid) -> new ChannelGateway.Rendered(error(e, rid), MediaType.APPLICATION_JSON));
    }

    private static String envelope(ChannelGateway.Call c, String field, Object value) {
        ObjectNode n = JSON.createObjectNode();
        n.put("status", "SUCCESS");
        n.put("request_id", c.requestId());
        n.put("environment", c.ctx().sandbox() ? "SANDBOX" : "PRODUCTION");
        n.put("timestamp", Instant.now().toString());
        n.set(field, JSON.valueToTree(value));
        return write(n);
    }

    static String error(ChannelException e, String rid) {
        ObjectNode n = JSON.createObjectNode();
        n.put("status", "ERROR");
        n.put("error_code", e.error.name());
        n.put("error_message", e.getMessage());
        n.put("request_id", rid);
        n.put("timestamp", Instant.now().toString());
        return write(n);
    }

    private static JsonNode read(String body) {
        if (body == null || body.isBlank()) throw ChannelError.INVALID_REQUEST.ex("Request body is empty");
        if (body.length() > OtaRequestParser.MAX_REQUEST_BYTES) throw ChannelError.INVALID_REQUEST.ex("Request body is too large");
        try { return JSON.readTree(body); } catch (Exception e) { throw ChannelError.INVALID_REQUEST.ex("Request is not valid JSON"); }
    }

    private static Search search(JsonNode it, ChannelRules rules, boolean required) {
        String pick = text(it, "pickup_location"), ret = text(it, "return_location");
        if (required && pick == null) pick = rules.locations().get(0).code();
        if (required && ret == null) ret = pick;
        String from = text(it, "pickup_at"), to = text(it, "return_at");
        List<ExtraRequest> extras = null;
        if (it.has("extras")) {
            extras = new ArrayList<>();
            for (JsonNode e : it.path("extras")) extras.add(new ExtraRequest(e.path("code").asText(""), e.path("quantity").asInt(1)));
        } else if (required) extras = List.of();
        return new Search(pick, ret, from == null ? null : OtaBookingXml.dateTime(from, "pickup_at"), to == null ? null : OtaBookingXml.dateTime(to, "return_at"),
            it.has("driver_age") ? it.path("driver_age").asInt() : null, text(it, "driver_country"),
            text(it, "vehicle_group") == null ? null : text(it, "vehicle_group").toUpperCase(), extras);
    }

    private static Customer customer(JsonNode c) {
        if (!c.isObject()) return null;
        return new Customer(text(c, "title"), text(c, "first_name"), text(c, "last_name"), text(c, "email"), text(c, "phone"), text(c, "country"));
    }

    private static Driver driver(JsonNode d) {
        if (!d.isObject()) return null;
        return new Driver(text(d, "first_name"), text(d, "last_name"), text(d, "date_of_birth"), text(d, "licence_number"), text(d, "licence_country"));
    }

    private static String text(JsonNode n, String f) {
        JsonNode v = n.path(f);
        return v.isMissingNode() || v.isNull() || v.asText().isBlank() ? null : v.asText().trim();
    }

    private static BigDecimal decimal(JsonNode n, String f) {
        JsonNode v = n.path(f);
        if (v.isMissingNode() || v.isNull()) return null;
        try { return new BigDecimal(v.asText()); } catch (Exception e) { throw ChannelError.INVALID_REQUEST.ex(f + " must be a number"); }
    }

    private static String write(Object o) {
        try { return JSON.writeValueAsString(o); } catch (Exception e) { throw new IllegalStateException(e); }
    }
}
