package com.carrental.backend.ota;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

/**
 * Staff endpoints (login + Channel Manager access) for the booking gateway:
 *   GET  /api/channels/{id}/bookings                    bookings made by this broker
 *   GET  /api/channels/{id}/webhooks                    webhook deliveries and whether a signing secret exists
 *   POST /api/channels/{id}/webhooks/secret             create / rotate the signing secret (returned once)
 *   POST /api/channels/{id}/webhooks/test               send a signed test event now
 *   POST /api/channels/{id}/webhooks/{delivery}/replay  send a delivery again
 *   POST /api/channels/{id}/certification               run the certification suite (sandbox)
 *   GET  /api/channels/{id}/statement?month=YYYY-MM     commission statement (live bookings by pick-up month)
 *   GET  /api/channels/{id}/inventory?days=N            what inventory.updated would send now
 *   POST /api/channels/{id}/inventory/push              send inventory.updated now
 *   GET  /api/channels/{id}/traffic?hours=&operation=&result=ok|error&q=&limit=   the traffic log (metadata)
 *   GET  /api/channels/{id}/traffic/{messageId}         one call with the full request and response
 *   GET  /api/channels/{id}/traffic/stats?hours=24      volume, errors, response times, look-to-book
 */
@RestController
@RequestMapping("/api/channels/{channelId}")
public class ChannelGatewayAdminController {

    static final String PERMISSION = "VIEW_AGGREGATOR_SETUP";

    private final ChannelStateReader channels;
    private final ChannelBookingRepository bookings;
    private final ChannelWebhookService webhooks;
    private final ChannelWebhookRepository deliveries;
    private final ChannelCertificationService certification;
    private final ChannelBookingService core;
    private final ChannelJobs jobs;
    private final ChannelTrafficService traffic;

    public ChannelGatewayAdminController(ChannelStateReader channels, ChannelBookingRepository bookings, ChannelWebhookService webhooks,
                                         ChannelWebhookRepository deliveries, ChannelCertificationService certification,
                                         ChannelBookingService core, ChannelJobs jobs, ChannelTrafficService traffic) {
        this.traffic = traffic;
        this.core = core;
        this.jobs = jobs;
        this.channels = channels;
        this.bookings = bookings;
        this.webhooks = webhooks;
        this.deliveries = deliveries;
        this.certification = certification;
    }

    @GetMapping("/bookings")
    public ResponseEntity<?> bookings(@PathVariable String channelId, @RequestParam(defaultValue = "100") int limit, Authentication auth) {
        if (!allowed(auth)) return forbidden();
        List<Map<String, Object>> out = new ArrayList<>();
        for (ChannelBooking b : bookings.findByChannelIdOrderByCreatedAtDesc(channelId, PageRequest.of(0, Math.max(1, Math.min(limit, 500))))) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("reservationNumber", b.getReservationNumber());
            m.put("brokerReference", b.getBrokerReference());
            m.put("status", b.getStatus());
            m.put("vehicleGroup", b.getSippCode());
            m.put("pickupAt", b.getPickupAt());
            m.put("returnAt", b.getReturnAt());
            m.put("total", b.getTotal());
            m.put("currency", b.getCurrency());
            m.put("customerName", b.getCustomerName());
            m.put("fee", b.getFeeAmount());
            m.put("promoCode", b.getPromoCode());
            m.put("sandbox", b.isSandbox());
            m.put("createdAt", b.getCreatedAt());
            m.put("updatedAt", b.getUpdatedAt());
            out.add(m);
        }
        return ResponseEntity.ok(out);
    }

    @GetMapping("/webhooks")
    public ResponseEntity<?> webhooks(@PathVariable String channelId, @RequestParam(defaultValue = "50") int limit, Authentication auth) {
        if (!allowed(auth)) return forbidden();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("secretCreatedAt", webhooks.secretCreatedAt(channelId).orElse(null));
        m.put("deliveries", webhooks.list(channelId, limit).stream().map(ChannelGatewayAdminController::delivery).toList());
        return ResponseEntity.ok(m);
    }

    @PostMapping("/webhooks/secret")
    public ResponseEntity<?> secret(@PathVariable String channelId, Authentication auth) {
        if (!allowed(auth)) return forbidden();
        if (channels.find(channelId).isEmpty()) return notFound();
        return ResponseEntity.ok(Map.of("secret", webhooks.rotateSecret(channelId), "createdAt", Instant.now()));
    }

    @PostMapping("/webhooks/test")
    public ResponseEntity<?> test(@PathVariable String channelId, Authentication auth) {
        if (!allowed(auth)) return forbidden();
        Optional<ChannelSnapshot> ch = channels.find(channelId);
        if (ch.isEmpty()) return notFound();
        ChannelRules rules = ChannelRules.of(ch.get(), null);
        if (rules.webhookUrl().isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "Set the webhook URL first."));
        ChannelWebhookDelivery d = new ChannelWebhookDelivery();
        String id = "evt_test_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        d.setEventId(id);
        d.setChannelId(channelId);
        d.setEventType("webhook.test");
        d.setUrl(rules.webhookUrl());
        d.setPayload("{\"event_id\":\"" + id + "\",\"event_type\":\"webhook.test\",\"channel_code\":\"" + OtaXml.escape(ch.get().urlCode())
            + "\",\"occurred_at\":\"" + Instant.now() + "\",\"data\":{\"message\":\"Test event from NCT Rental\"}}");
        d.setStatus(ChannelWebhookDelivery.Status.PENDING);
        d.setCreatedAt(Instant.now());
        d.setNextAttemptAt(Instant.now());
        d = deliveries.save(d);
        return ResponseEntity.ok(delivery(webhooks.attempt(d)));
    }

    @PostMapping("/webhooks/{deliveryId}/replay")
    public ResponseEntity<?> replay(@PathVariable String channelId, @PathVariable long deliveryId, Authentication auth) {
        if (!allowed(auth)) return forbidden();
        try {
            return ResponseEntity.ok(delivery(webhooks.replay(channelId, deliveryId)));
        } catch (NoSuchElementException e) {
            return notFound();
        }
    }

    @PostMapping("/certification")
    public ResponseEntity<?> certify(@PathVariable String channelId, Authentication auth) {
        if (!allowed(auth)) return forbidden();
        return channels.find(channelId).<ResponseEntity<?>>map(ch -> ResponseEntity.ok(certification.run(ch))).orElseGet(this::notFound);
    }

    @GetMapping("/statement")
    public ResponseEntity<?> statement(@PathVariable String channelId, @RequestParam String month, Authentication auth) {
        if (!allowed(auth)) return forbidden();
        java.time.YearMonth ym;
        try { ym = java.time.YearMonth.parse(month); } catch (Exception e) { return ResponseEntity.badRequest().body(Map.of("error", "month must be YYYY-MM")); }
        return channels.find(channelId).<ResponseEntity<?>>map(ch -> ResponseEntity.ok(core.statement(ch, ym))).orElseGet(this::notFound);
    }

    @GetMapping("/inventory")
    public ResponseEntity<?> inventory(@PathVariable String channelId, @RequestParam(required = false) Integer days, Authentication auth) {
        if (!allowed(auth)) return forbidden();
        return channels.find(channelId).<ResponseEntity<?>>map(ch -> {
            ChannelBookingService.Ctx c = core.context(ch, false);
            return ResponseEntity.ok(core.inventory(c, days == null ? c.rules().inventoryPushDays() : Math.max(1, Math.min(365, days))));
        }).orElseGet(this::notFound);
    }

    @PostMapping("/inventory/push")
    public ResponseEntity<?> pushInventory(@PathVariable String channelId, Authentication auth) {
        if (!allowed(auth)) return forbidden();
        Optional<ChannelSnapshot> ch = channels.find(channelId);
        if (ch.isEmpty()) return notFound();
        ChannelBookingService.Ctx c = core.context(ch.get(), false);
        if (c.rules().webhookUrl().isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "Set the webhook URL first."));
        if (!c.rules().wantsEvent("inventory.updated")) return ResponseEntity.badRequest().body(Map.of("error", "Tick the inventory.updated event first."));
        return ResponseEntity.ok(Map.of("queued", jobs.pushInventory(c, true)));
    }

    @GetMapping("/traffic")
    public ResponseEntity<?> traffic(@PathVariable String channelId, @RequestParam(defaultValue = "24") int hours,
                                     @RequestParam(required = false) String operation, @RequestParam(required = false) String result,
                                     @RequestParam(required = false) String q, @RequestParam(defaultValue = "100") int limit, Authentication auth) {
        if (!allowed(auth)) return forbidden();
        return ResponseEntity.ok(traffic.search(channelId, hours, operation, result, q, limit).stream().map(m -> {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("id", m.getId());
            r.put("createdAt", m.getCreatedAt());
            r.put("requestId", m.getRequestId());
            r.put("format", m.getFormat());
            r.put("operation", m.getOperation());
            r.put("httpStatus", m.getHttpStatus());
            r.put("success", m.isSuccess());
            r.put("errorCode", m.getErrorCode());
            r.put("errorMessage", m.getErrorMessage());
            r.put("durationMs", m.getDurationMs());
            r.put("requestBytes", m.getRequestBytes());
            r.put("responseBytes", m.getResponseBytes());
            r.put("remoteIp", m.getRemoteIp());
            r.put("sandbox", m.isSandbox());
            r.put("reservationNumber", m.getReservationNumber());
            return r;
        }).toList());
    }

    @GetMapping("/traffic/stats")
    public ResponseEntity<?> trafficStats(@PathVariable String channelId, @RequestParam(defaultValue = "24") int hours, Authentication auth) {
        if (!allowed(auth)) return forbidden();
        return ResponseEntity.ok(traffic.stats(channelId, hours));
    }

    @GetMapping("/traffic/{messageId}")
    public ResponseEntity<?> trafficMessage(@PathVariable String channelId, @PathVariable long messageId, Authentication auth) {
        if (!allowed(auth)) return forbidden();
        return traffic.get(channelId, messageId).<ResponseEntity<?>>map(ResponseEntity::ok).orElseGet(this::notFound);
    }

    private static Map<String, Object> delivery(ChannelWebhookDelivery d) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", d.getId());
        m.put("eventId", d.getEventId());
        m.put("eventType", d.getEventType());
        m.put("reservationNumber", d.getReservationNumber());
        m.put("brokerReference", d.getBrokerReference());
        m.put("status", d.getStatus());
        m.put("attempts", d.getAttempts());
        m.put("lastHttpStatus", d.getLastHttpStatus());
        m.put("lastError", d.getLastError());
        m.put("nextAttemptAt", d.getNextAttemptAt());
        m.put("createdAt", d.getCreatedAt());
        m.put("deliveredAt", d.getDeliveredAt());
        return m;
    }

    private static boolean allowed(Authentication auth) {
        return auth != null && auth.getAuthorities().stream().anyMatch(a -> PERMISSION.equals(a.getAuthority()));
    }

    private static ResponseEntity<?> forbidden() {
        return ResponseEntity.status(403).body(Map.of("error", "You need Channel Manager access for this."));
    }

    private ResponseEntity<?> notFound() {
        return ResponseEntity.status(404).body(Map.of("error", "Channel not found"));
    }
}
