package com.carrental.backend.ota;

import com.carrental.backend.ota.ChannelError.ChannelException;
import com.carrental.backend.ota.ChannelModels.*;
import com.carrental.backend.platform.CorrelationFilter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.function.Function;

/**
 * REST/JSON v3 (OpenAPI 3.1, camelCase). Authenticated with an OAuth 2.0 access token from /oauth/token; each
 * endpoint needs a scope. The channel and environment come from the token, not the URL. Every response is the
 * same envelope: status, requestId, correlationId, apiVersion, timestamp, then data or error. Prices,
 * availability and bookings are the same core as the XML and older REST adapters.
 */
@RestController
@RequestMapping("/api/v3")
public class ApiV3Controller {

    public static final String API_VERSION = "3.0.0";
    /** JSON with an explicit UTF-8 charset: a String body would otherwise be sent as ISO-8859-1 and break names and symbols. */
    static final MediaType JSON_UTF8 = new MediaType("application", "json", StandardCharsets.UTF_8);
    static final ObjectMapper JSON = new ObjectMapper().registerModule(new JavaTimeModule()).disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
        .enable(com.fasterxml.jackson.core.JsonGenerator.Feature.WRITE_BIGDECIMAL_AS_PLAIN);   // 150.00, never 1.5E+2

    private final ChannelGateway gateway;
    private final ChannelBookingService core;
    private final OAuthService oauth;
    private final WebhookV2Service webhooks;
    private final ChannelWebhookRepository deliveries;
    private final ChannelStateReader channels;

    public ApiV3Controller(ChannelGateway gateway, ChannelBookingService core, OAuthService oauth, WebhookV2Service webhooks,
                           ChannelWebhookRepository deliveries, ChannelStateReader channels) {
        this.webhooks = webhooks;
        this.deliveries = deliveries;
        this.channels = channels;
        this.gateway = gateway;
        this.core = core;
        this.oauth = oauth;
    }

    // ------------------------------------------------------------------ public

    @GetMapping("/health")
    public ResponseEntity<String> health(HttpServletRequest http) {
        ObjectNode d = JSON.createObjectNode().put("service", "UR-Drive Distribution API").put("timeZone", "Asia/Amman");
        return ResponseEntity.ok().contentType(JSON_UTF8).body(write(envelope("success", rid(http), http, d)));
    }

    /** The OpenAPI 3.1 description of this API (public). */
    @GetMapping(value = "/openapi.yaml", produces = "application/yaml")
    public ResponseEntity<String> openapi() throws java.io.IOException {
        try (var in = getClass().getResourceAsStream("/api/openapi-v3.yaml")) {
            if (in == null) return ResponseEntity.notFound().build();
            return ResponseEntity.ok().header("Cache-Control", "public, max-age=3600")
                .contentType(MediaType.parseMediaType("application/yaml")).body(new String(in.readAllBytes(), StandardCharsets.UTF_8));
        }
    }

    // ------------------------------------------------------------------ reference data (ETag)

    @GetMapping("/locations")
    public ResponseEntity<String> locations(HttpServletRequest http) {
        return reference(http, "locations:read", "v3 locations", c -> JSON.valueToTree(core.locations(c.ctx())));
    }

    @GetMapping("/locations/{code}")
    public ResponseEntity<String> location(@PathVariable String code, HttpServletRequest http) {
        return reference(http, "locations:read", "v3 location", c -> JSON.valueToTree(core.location(c.ctx(), code)));
    }

    @GetMapping("/fleet-groups")
    public ResponseEntity<String> fleetGroups(HttpServletRequest http) {
        return reference(http, "fleet:read", "v3 fleet-groups", c -> JSON.valueToTree(core.vehicleGroups(c.ctx())));
    }

    @GetMapping("/extras")
    public ResponseEntity<String> extras(HttpServletRequest http) {
        return reference(http, "fleet:read", "v3 extras", c -> JSON.valueToTree(core.extras(c.ctx())));
    }

    @GetMapping("/insurance-covers")
    public ResponseEntity<String> covers(HttpServletRequest http) {
        return reference(http, "fleet:read", "v3 insurance-covers", c -> JSON.valueToTree(core.coverages(c.ctx())));
    }

    // ------------------------------------------------------------------ availability and quotes

    @PostMapping(value = "/availability/search", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<String> search(@RequestBody(required = false) String body, HttpServletRequest http) {
        return run(http, "availability:read", "v3 availability", body, HttpStatus.OK, c -> {
            JsonNode b = snake(PartnerRestController.read(body));
            List<Offer> offers = core.search(c.ctx(), PartnerRestController.search(b, c.ctx().rules(), true));
            ObjectNode d = JSON.createObjectNode();
            ArrayNode list = d.putArray("offers");
            for (Offer o : offers) list.add(quoteView(o));
            return d;
        });
    }

    @GetMapping("/quotes/{quoteId}")
    public ResponseEntity<String> quote(@PathVariable String quoteId, HttpServletRequest http) {
        return run(http, "quotes:read", "v3 quote", null, HttpStatus.OK, c -> quoteView(core.quote(c.ctx(), quoteId)));
    }

    @GetMapping("/quotes/{quoteId}/rules")
    public ResponseEntity<String> rules(@PathVariable String quoteId, HttpServletRequest http) {
        return run(http, "quotes:read", "v3 quote rules", null, HttpStatus.OK, c -> JSON.valueToTree(core.rateRule(c.ctx(), quoteId, null)));
    }

    // ------------------------------------------------------------------ reservations

    @PostMapping(value = "/reservations", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<String> create(@RequestBody(required = false) String body, HttpServletRequest http) {
        String idem = http.getHeader("Idempotency-Key");
        return run(http, "reservations:write", "v3 create", body, HttpStatus.CREATED, c -> {
            requireIdempotency(idem);
            JsonNode b = snake(PartnerRestController.read(body));
            JsonNode it = b.path("itinerary").isObject() ? b.path("itinerary") : b;
            String quoteId = PartnerRestController.text(b, "quote_id");
            BookingRequest req = new BookingRequest(quoteId, PartnerRestController.text(b, "broker_reference"), idem,
                quoteId == null ? PartnerRestController.search(it, c.ctx().rules(), true) : null,
                PartnerRestController.customer(b.path("customer")), PartnerRestController.driver(b.path("driver")),
                PartnerRestController.decimal(b, "expected_total"), PartnerRestController.text(b, "comments"), PartnerRestController.text(b, "flight_number"));
            return JSON.valueToTree(core.create(c.ctx(), req));
        });
    }

    @GetMapping("/reservations/{reservationId}")
    public ResponseEntity<String> get(@PathVariable String reservationId, HttpServletRequest http) {
        return run(http, "reservations:read", "v3 retrieve", null, HttpStatus.OK, c -> JSON.valueToTree(core.retrieve(c.ctx(), reservationId)));
    }

    /** Reservations by pick-up date (Asia/Amman), cursor-paged: the cursor is the next page number, opaque to the broker. */
    @GetMapping("/reservations")
    public ResponseEntity<String> list(@RequestParam(required = false) String from, @RequestParam(required = false) String to,
                                       @RequestParam(required = false) String status, @RequestParam(defaultValue = "50") int limit,
                                       @RequestParam(required = false) String cursor, HttpServletRequest http) {
        return run(http, "reservations:read", "v3 reservations", null, HttpStatus.OK, c -> {
            LocalDate f, t;
            try {
                f = from == null ? c.ctx().rules().now().toLocalDate().minusDays(30) : LocalDate.parse(from);
                t = to == null ? f.plusDays(365) : LocalDate.parse(to);
            } catch (Exception e) { throw ChannelError.INVALID_DATE.ex("from and to must be YYYY-MM-DD"); }
            int page = 1;
            if (cursor != null && !cursor.isBlank()) {
                try { page = Integer.parseInt(new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8).replace("p", "")); }
                catch (Exception e) { throw ChannelError.INVALID_REQUEST.ex("Invalid cursor"); }
            }
            int size = Math.max(1, Math.min(200, limit));
            ReservationPage p = core.list(c.ctx(), f, t, status, page, size);
            ObjectNode d = JSON.createObjectNode();
            d.set("reservations", JSON.valueToTree(p.reservations()));
            boolean more = (long) page * size < p.total();
            d.putObject("page").put("limit", size).put("total", p.total())
                .put("nextCursor", more ? Base64.getUrlEncoder().withoutPadding().encodeToString(("p" + (page + 1)).getBytes(StandardCharsets.UTF_8)) : null);
            return d;
        });
    }

    @PatchMapping(value = "/reservations/{reservationId}", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<String> modify(@PathVariable String reservationId, @RequestBody(required = false) String body, HttpServletRequest http) {
        String idem = http.getHeader("Idempotency-Key");
        return run(http, "reservations:write", "v3 modify", body, HttpStatus.OK, c -> {
            requireIdempotency(idem);
            JsonNode b = snake(PartnerRestController.read(body));
            JsonNode it = b.path("itinerary");
            ModifyRequest req = new ModifyRequest(reservationId, it.isObject() ? PartnerRestController.search(it, c.ctx().rules(), false) : null,
                b.has("customer") ? PartnerRestController.customer(b.path("customer")) : null, b.has("driver") ? PartnerRestController.driver(b.path("driver")) : null,
                PartnerRestController.decimal(b, "expected_total"), PartnerRestController.text(b, "comments"));
            return JSON.valueToTree(core.modify(c.ctx(), req));
        });
    }

    @PostMapping(value = "/reservations/{reservationId}/cancellations", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<String> cancel(@PathVariable String reservationId, @RequestBody(required = false) String body, HttpServletRequest http) {
        String idem = http.getHeader("Idempotency-Key");
        return run(http, "reservations:write", "v3 cancel", body, HttpStatus.OK, c -> {
            requireIdempotency(idem);
            String reason = body == null || body.isBlank() ? null : PartnerRestController.text(snake(PartnerRestController.read(body)), "reason");
            return JSON.valueToTree(core.cancel(c.ctx(), reservationId, reason));
        });
    }

    @DeleteMapping("/reservations/{reservationId}")
    public ResponseEntity<String> delete(@PathVariable String reservationId, HttpServletRequest http) {
        return cancel(reservationId, null, http);
    }

    // ------------------------------------------------------------------ inventory

    @GetMapping("/inventory")
    public ResponseEntity<String> inventory(@RequestParam(required = false) Integer days, HttpServletRequest http) {
        return run(http, "inventory:read", "v3 inventory", null, HttpStatus.OK,
            c -> core.inventory(c.ctx(), days == null ? c.ctx().rules().inventoryPushDays() : Math.max(1, Math.min(365, days))));
    }

    // ------------------------------------------------------------------ webhooks v2

    @GetMapping("/webhooks/subscriptions")
    public ResponseEntity<String> subscriptions(HttpServletRequest http) {
        return manage(http, HttpStatus.OK, p -> {
            ArrayNode list = JSON.createArrayNode();
            for (WebhookSubscription s : webhooks.list(p.channelId(), p.sandbox())) list.add(subscriptionView(s));
            return JSON.createObjectNode().set("subscriptions", list);
        });
    }

    @PostMapping(value = "/webhooks/subscriptions", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<String> subscribe(@RequestBody(required = false) String body, HttpServletRequest http) {
        return manage(http, HttpStatus.CREATED, p -> {
            JsonNode b = PartnerRestController.read(body);
            WebhookV2Service.Created made = webhooks.create(p.channelId(), p.sandbox(), b.path("url").asText(null), events(b), p.clientId());
            ObjectNode n = subscriptionView(made.subscription());
            n.put("secret", made.secret());
            return n;
        });
    }

    @PatchMapping(value = "/webhooks/subscriptions/{subscriptionId}", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<String> updateSubscription(@PathVariable String subscriptionId, @RequestBody(required = false) String body, HttpServletRequest http) {
        return manage(http, HttpStatus.OK, p -> {
            JsonNode b = PartnerRestController.read(body);
            WebhookSubscription s = subscription(p, subscriptionId);
            return subscriptionView(webhooks.update(s, b.hasNonNull("url") ? b.path("url").asText() : null, b.has("events") ? events(b) : null,
                b.hasNonNull("status") ? b.path("status").asText() : null));
        });
    }

    @DeleteMapping("/webhooks/subscriptions/{subscriptionId}")
    public ResponseEntity<String> unsubscribe(@PathVariable String subscriptionId, HttpServletRequest http) {
        return manage(http, HttpStatus.OK, p -> {
            webhooks.delete(subscription(p, subscriptionId));
            return JSON.createObjectNode().put("deleted", subscriptionId);
        });
    }

    @PostMapping("/webhooks/subscriptions/{subscriptionId}/rotate-secret")
    public ResponseEntity<String> rotate(@PathVariable String subscriptionId, HttpServletRequest http) {
        return manage(http, HttpStatus.OK, p -> {
            WebhookSubscription s = subscription(p, subscriptionId);
            String secret = webhooks.rotate(s);
            return subscriptionView(s).put("secret", secret).put("previousSecretValidUntil", s.getPreviousSecretUntil().toString());
        });
    }

    /** Sends a webhook.test event now and returns the delivery result. */
    @PostMapping("/webhooks/subscriptions/{subscriptionId}/test")
    public ResponseEntity<String> testDelivery(@PathVariable String subscriptionId, HttpServletRequest http) {
        return manage(http, HttpStatus.OK, p -> {
            WebhookSubscription s = subscription(p, subscriptionId);
            String code = channels.find(p.channelId()).map(ChannelSnapshot::channelCode).orElse(p.channelId());
            ChannelWebhookDelivery d = webhooks.queue(s, code, "webhook.test", null, null, null, JSON.createObjectNode().put("message", "Test event from UR-Drive"));
            return deliveryView(webhooks.attempt(d));
        });
    }

    @GetMapping("/webhooks/deliveries")
    public ResponseEntity<String> deliveryLog(@RequestParam(defaultValue = "50") int limit, @RequestParam(required = false) String status, HttpServletRequest http) {
        return manage(http, HttpStatus.OK, p -> {
            List<Long> ids = webhooks.list(p.channelId(), p.sandbox()).stream().map(WebhookSubscription::getId).toList();
            ArrayNode list = JSON.createArrayNode();
            if (!ids.isEmpty()) for (ChannelWebhookDelivery d : deliveries.findBySubscriptionIdInOrderByCreatedAtDesc(ids,
                    org.springframework.data.domain.PageRequest.of(0, Math.max(1, Math.min(200, limit))))) {
                if (status == null || status.equalsIgnoreCase(d.getStatus().name()) || ("dead_letter".equalsIgnoreCase(status) && d.getStatus() == ChannelWebhookDelivery.Status.FAILED)) {
                    list.add(deliveryView(d));
                }
            }
            return JSON.createObjectNode().set("deliveries", list);
        });
    }

    @PostMapping("/webhooks/deliveries/{deliveryId}/replay")
    public ResponseEntity<String> replay(@PathVariable String deliveryId, HttpServletRequest http) {
        return manage(http, HttpStatus.OK, p -> {
            Set<Long> ids = new HashSet<>(webhooks.list(p.channelId(), p.sandbox()).stream().map(WebhookSubscription::getId).toList());
            ChannelWebhookDelivery d = deliveries.findAll().stream().filter(x -> x.getEventId().equals(deliveryId) && ids.contains(x.getSubscriptionId()))
                .findFirst().orElseThrow(() -> ChannelError.RESERVATION_NOT_FOUND.ex("No delivery " + deliveryId));
            return deliveryView(webhooks.replay(d));
        });
    }

    private WebhookSubscription subscription(OAuthService.Principal p, String id) {
        return webhooks.find(p.channelId(), p.sandbox(), id).orElseThrow(() -> ChannelError.RESERVATION_NOT_FOUND.ex("No subscription " + id));
    }

    private static List<String> events(JsonNode b) {
        List<String> out = new ArrayList<>();
        for (JsonNode e : b.path("events")) out.add(e.asText());
        return out;
    }

    private static ObjectNode subscriptionView(WebhookSubscription s) {
        ObjectNode n = JSON.createObjectNode();
        n.put("subscriptionId", s.getPublicId());
        n.put("url", s.getUrl());
        n.set("events", JSON.valueToTree(Arrays.asList(s.getEvents().split(" "))));
        n.put("status", s.getStatus().name());
        n.put("environment", s.getEnvironment());
        n.put("createdAt", s.getCreatedAt().toString());
        return n;
    }

    private static ObjectNode deliveryView(ChannelWebhookDelivery d) {
        ObjectNode n = JSON.createObjectNode();
        n.put("deliveryId", d.getEventId());
        n.put("event", d.getEventType());
        n.put("status", d.getStatus() == ChannelWebhookDelivery.Status.FAILED ? "DEAD_LETTER" : d.getStatus().name());
        n.put("attempts", d.getAttempts());
        if (d.getLastHttpStatus() != null) n.put("lastHttpStatus", d.getLastHttpStatus());
        if (d.getLastError() != null) n.put("lastError", d.getLastError());
        if (d.getNextAttemptAt() != null) n.put("nextAttemptAt", d.getNextAttemptAt().toString());
        if (d.getReservationNumber() != null) n.put("reservationId", d.getReservationNumber());
        n.put("createdAt", d.getCreatedAt().toString());
        return n;
    }

    /** Webhook management: token + webhooks:manage scope, no booking gateway involved. */
    private ResponseEntity<String> manage(HttpServletRequest http, HttpStatus ok, Function<OAuthService.Principal, JsonNode> action) {
        String auth = http.getHeader("Authorization");
        Optional<OAuthService.Principal> p = oauth.verify(auth != null && auth.regionMatches(true, 0, "Bearer ", 0, 7) ? auth.substring(7).trim() : null);
        String rid = rid(http);
        if (p.isEmpty()) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).contentType(JSON_UTF8)
            .header("WWW-Authenticate", "Bearer realm=\"urdrive\", error=\"invalid_token\"")
            .body(write(errorBody(rid, http, "AUTH_FAILED", "A valid OAuth 2.0 access token is required (POST /oauth/token)", "497", false)));
        if (!p.get().scopes().contains("webhooks:manage")) return ResponseEntity.status(HttpStatus.FORBIDDEN).contentType(JSON_UTF8)
            .body(write(errorBody(rid, http, "PERMISSION_DENIED", "This token does not have the scope webhooks:manage", "448", false)));
        try {
            return ResponseEntity.status(ok).contentType(JSON_UTF8)
                .body(write(envelope("success", rid, http, action.apply(p.get())).put("environment", p.get().sandbox() ? "sandbox" : "production")));
        } catch (ChannelException e) {
            return ResponseEntity.status(e.error.http).contentType(JSON_UTF8).body(write(errorBody(rid, http, e)));
        }
    }

    // ------------------------------------------------------------------ plumbing

    private ResponseEntity<String> reference(HttpServletRequest http, String scope, String type, Function<ChannelGateway.Call, JsonNode> action) {
        ResponseEntity<String> rs = run(http, scope, type, null, HttpStatus.OK, c -> {
            ObjectNode d = JSON.createObjectNode();
            d.set("items", action.apply(c));
            return d;
        });
        if (!rs.getStatusCode().is2xxSuccessful() || rs.getBody() == null) return rs;
        // The ETag covers the data only (the envelope's ids and timestamp change on every call).
        try {
            String data = JSON.readTree(rs.getBody()).path("data").toString();
            String etag = "\"" + OAuthService.hex(OAuthService.sha256(data.getBytes(StandardCharsets.UTF_8))).substring(0, 32) + "\"";
            if (etag.equals(http.getHeader("If-None-Match"))) return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(etag).build();
            return ResponseEntity.status(rs.getStatusCode()).headers(rs.getHeaders()).eTag(etag).body(rs.getBody());
        } catch (Exception e) {
            return rs;
        }
    }

    private ResponseEntity<String> run(HttpServletRequest http, String scope, String type, String body, HttpStatus okStatus,
                                       Function<ChannelGateway.Call, JsonNode> action) {
        String auth = http.getHeader("Authorization");
        String token = auth != null && auth.regionMatches(true, 0, "Bearer ", 0, 7) ? auth.substring(7).trim() : null;
        Optional<OAuthService.Principal> p = oauth.verify(token);
        if (p.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).contentType(JSON_UTF8)
                .header("WWW-Authenticate", "Bearer realm=\"urdrive\", error=\"invalid_token\"")
                .body(write(errorBody(rid(http), http, "AUTH_FAILED", "A valid OAuth 2.0 access token is required (POST /oauth/token)", "497", false)));
        }
        if (!p.get().scopes().contains(scope)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).contentType(JSON_UTF8)
                .header("WWW-Authenticate", "Bearer realm=\"urdrive\", error=\"insufficient_scope\", scope=\"" + scope + "\"")
                .body(write(errorBody(rid(http), http, "PERMISSION_DENIED", "This token does not have the scope " + scope, "448", false)));
        }
        http.setAttribute(ChannelGateway.OAUTH_ATTR, p.get());
        String code = gatewayCode(p.get().channelId());
        ResponseEntity<String> rs = gateway.handle(code, null, http, type, body, http.getHeader("X-Request-ID"),
            c -> new ChannelGateway.Rendered(write(envelope("success", c.requestId(), http, action.apply(c))
                .put("environment", c.ctx().sandbox() ? "sandbox" : "production")), JSON_UTF8),
            (e, rid) -> new ChannelGateway.Rendered(write(errorBody(rid, http, e)), JSON_UTF8));
        if (okStatus != HttpStatus.OK && rs.getStatusCode().value() == 200) return ResponseEntity.status(okStatus).headers(rs.getHeaders()).body(rs.getBody());
        return rs;
    }

    /** The gateway finds channels by code or id; the token carries the id. */
    private static String gatewayCode(String channelId) { return channelId; }

    private static void requireIdempotency(String key) {
        if (key == null || key.isBlank()) throw ChannelError.INVALID_REQUEST.ex("The Idempotency-Key header is required for this operation");
        if (key.length() > 100) throw ChannelError.INVALID_REQUEST.ex("Idempotency-Key is at most 100 characters");
    }

    /** An offer as a v3 quote: quoteId is the token to book with, expiresAt when its price stops being guaranteed. */
    private static JsonNode quoteView(Offer o) {
        ObjectNode n = JSON.valueToTree(o);
        n.put("quoteId", o.offerId());
        return n;
    }

    private static ObjectNode envelope(String status, String requestId, HttpServletRequest http, JsonNode data) {
        ObjectNode n = JSON.createObjectNode();
        n.put("status", status);
        n.put("requestId", requestId);
        n.put("correlationId", String.valueOf(http.getAttribute(CorrelationFilter.ATTR)));
        n.put("apiVersion", API_VERSION);
        n.put("timestamp", Instant.now().truncatedTo(ChronoUnit.MILLIS).toString());
        if (data != null) n.set("data", data);
        return n;
    }

    private static ObjectNode errorBody(String requestId, HttpServletRequest http, ChannelException e) {
        ObjectNode n = errorBody(requestId, http, e.error.name(), e.getMessage(), e.error.otaCode,
            e.error == ChannelError.SYSTEM_ERROR || e.error == ChannelError.RATE_LIMIT_EXCEEDED);
        // Accept-Language: ar adds the catalogue meaning in Arabic; message stays English (it is the precise reason).
        if (ChannelLanguage.arabic()) ((ObjectNode) n.path("error")).put("localizedMessage", ChannelLanguage.ERRORS_AR.get(e.error)).put("language", "ar");
        return n;
    }

    private static ObjectNode errorBody(String requestId, HttpServletRequest http, String code, String message, String otaCode, boolean retryable) {
        ObjectNode n = envelope("error", requestId, http, null);
        n.putObject("error").put("code", code).put("message", message).put("otaCode", otaCode).put("retryable", retryable);
        return n;
    }

    private static String rid(HttpServletRequest http) {
        String r = http.getHeader("X-Request-ID");
        return r == null || r.isBlank() ? "REQ-" + UUID.randomUUID().toString().substring(0, 13).toUpperCase(Locale.ROOT) : r;
    }

    /** v3 is camelCase; the shared parsers read snake_case. pickUp/return objects ({location, local}) are flattened. */
    static JsonNode snake(JsonNode in) {
        if (in instanceof ObjectNode o) {
            ObjectNode out = JSON.createObjectNode();
            o.fields().forEachRemaining(f -> {
                String k = f.getKey();
                JsonNode v = f.getValue();
                if ((k.equals("pickUp") || k.equals("return")) && v.isObject()) {
                    String side = k.equals("pickUp") ? "pickup" : "return";
                    if (v.has("location")) out.put(side + "_location", v.path("location").asText());
                    if (v.has("local")) out.put(side + "_at", v.path("local").asText());
                    return;
                }
                out.set(k.replaceAll("([a-z0-9])([A-Z])", "$1_$2").toLowerCase(Locale.ROOT), snake(v));
            });
            return out;
        }
        if (in instanceof ArrayNode a) {
            ArrayNode out = JSON.createArrayNode();
            a.forEach(x -> out.add(snake(x)));
            return out;
        }
        return in;
    }

    private static String write(Object o) {
        try { return JSON.writeValueAsString(o); } catch (Exception e) { throw new IllegalStateException(e); }
    }
}
