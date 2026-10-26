package com.carrental.backend.ota;

import com.carrental.backend.ota.ChannelModels.Reservation;
import com.carrental.backend.service.ReservationChangedEvent;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Signed webhooks to brokers.
 *
 *   POST <webhookUrl>   Content-Type: application/json
 *   X-NCT-Event: reservation.confirmed      X-NCT-Delivery: <event id>
 *   X-NCT-Timestamp: <unix seconds>         X-NCT-Signature: sha256=<hex HMAC-SHA256(secret, timestamp + "." + body)>
 *
 * Failed deliveries are retried with exponential back-off (1, 2, 4 … minutes, capped at an hour)
 * for 24 hours, then marked FAILED; staff can replay any delivery. Events also fire when staff
 * check a broker booking out or in, or cancel it, in the app.
 */
@Service
public class ChannelWebhookService {

    private static final Logger log = LoggerFactory.getLogger(ChannelWebhookService.class);
    static final Duration RETRY_WINDOW = Duration.ofHours(24);

    private final ChannelWebhookRepository deliveries;
    private final ChannelSecretRepository secrets;
    private final ChannelBookingRepository bookings;
    private final ChannelStateReader channels;
    private final ChannelOfferRepository offers;
    private final ChannelBookingService core;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).followRedirects(HttpClient.Redirect.NEVER).build();
    private ScheduledExecutorService worker;

    public ChannelWebhookService(ChannelWebhookRepository deliveries, ChannelSecretRepository secrets, ChannelBookingRepository bookings,
                                 ChannelStateReader channels, ChannelOfferRepository offers, @Lazy ChannelBookingService core) {
        this.deliveries = deliveries;
        this.secrets = secrets;
        this.bookings = bookings;
        this.channels = channels;
        this.offers = offers;
        this.core = core;
    }

    @PostConstruct
    void start() {
        // A dedicated timer: the application does not enable Spring scheduling globally.
        worker = Executors.newSingleThreadScheduledExecutor(r -> { Thread t = new Thread(r, "channel-webhooks"); t.setDaemon(true); return t; });
        worker.scheduleWithFixedDelay(this::safeTick, 20, 15, TimeUnit.SECONDS);
    }

    @PreDestroy
    void stop() { if (worker != null) worker.shutdownNow(); }

    private void safeTick() {
        try {
            deliverDue();
            offers.expire(Instant.now());
            offers.purge(Instant.now().minus(3, ChronoUnit.DAYS));
        } catch (Exception e) {
            log.warn("Webhook worker: {}", e.getMessage());
        }
    }

    // ------------------------------------------------------------- events

    /** Queues an event for the channel's webhook, if it has one and subscribes to this event. */
    public void emit(ChannelBookingService.Ctx c, String event, Reservation r) {
        if (c.rules().webhookUrl().isBlank() || !c.rules().wantsEvent(event)) return;
        ObjectNode body = ChannelBookingService.JSON.createObjectNode();
        String eventId = "evt_" + UUID.randomUUID().toString().replace("-", "");
        body.put("event_id", eventId);
        body.put("event_type", event);
        body.put("channel_code", c.code());
        body.put("reservation_id", r.reservationId());
        body.put("broker_reference", r.brokerReference());
        body.put("status", r.status());
        body.put("occurred_at", Instant.now().toString());
        body.put("sandbox", c.sandbox());
        body.set("data", ChannelBookingService.JSON.valueToTree(r));
        ChannelWebhookDelivery d = new ChannelWebhookDelivery();
        d.setEventId(eventId);
        d.setChannelId(c.channel().id());
        d.setEventType(event);
        d.setReservationNumber(r.reservationId());
        d.setBrokerReference(r.brokerReference());
        d.setUrl(c.rules().webhookUrl());
        d.setPayload(ChannelBookingService.write(body));
        d.setStatus(ChannelWebhookDelivery.Status.PENDING);
        d.setNextAttemptAt(Instant.now());
        d.setCreatedAt(Instant.now());
        deliveries.save(d);
    }

    /** Queues a non-reservation event (inventory.updated) with its own data. */
    public boolean emitData(ChannelBookingService.Ctx c, String event, JsonNode data) {
        if (c.rules().webhookUrl().isBlank() || !c.rules().wantsEvent(event)) return false;
        ObjectNode body = ChannelBookingService.JSON.createObjectNode();
        String eventId = "evt_" + UUID.randomUUID().toString().replace("-", "");
        body.put("event_id", eventId);
        body.put("event_type", event);
        body.put("channel_code", c.code());
        body.put("occurred_at", Instant.now().toString());
        body.put("sandbox", c.sandbox());
        body.set("data", data);
        ChannelWebhookDelivery d = new ChannelWebhookDelivery();
        d.setEventId(eventId);
        d.setChannelId(c.channel().id());
        d.setEventType(event);
        d.setUrl(c.rules().webhookUrl());
        d.setPayload(ChannelBookingService.write(body));
        d.setStatus(ChannelWebhookDelivery.Status.PENDING);
        d.setNextAttemptAt(Instant.now());
        d.setCreatedAt(Instant.now());
        deliveries.save(d);
        return true;
    }

    /** A broker booking changed in the app (checked out, checked in, cancelled, edited by staff). */
    @EventListener
    public void onReservationChanged(ReservationChangedEvent e) {
        try {
            JsonNode after = e.after();
            if (after == null || after.path("channelId").asText("").isBlank()) return;
            Optional<ChannelBooking> b = bookings.findFirstByStateReservationId(after.path("id").asText());
            if (b.isEmpty() || b.get().isSandbox()) return;
            // Changes the booking API made itself have already sent their events.
            if (after.path("lastEditedBy").asText("").startsWith("Booking API")) return;
            Optional<ChannelSnapshot> ch = channels.find(b.get().getChannelId());
            if (ch.isEmpty()) return;
            ChannelBookingService.Ctx c = core.context(ch.get(), false);
            JsonNode before = e.before();
            List<String> events = new ArrayList<>();
            boolean wasOut = before != null && before.path("voucherSubmitted").asBoolean(false);
            boolean wasClosed = before != null && before.path("dropOffCompleted").asBoolean(false);
            String beforeStatus = before == null ? "" : before.path("status").asText("");
            if (after.path("voucherSubmitted").asBoolean(false) && !wasOut) { events.add("reservation.picked_up"); events.add("agreement.created"); }
            if (after.path("dropOffCompleted").asBoolean(false) && !wasClosed) events.add("agreement.closed");
            if ("CANCELLED".equals(after.path("status").asText()) && !"CANCELLED".equals(beforeStatus)) events.add("reservation.cancelled");
            if ("NO_SHOW".equals(after.path("status").asText()) && !"NO_SHOW".equals(beforeStatus)) events.add("reservation.no_show");
            if (events.isEmpty() && before != null && (!before.path("startDate").asText().equals(after.path("startDate").asText())
                || !before.path("endDate").asText().equals(after.path("endDate").asText()))) events.add("reservation.modified");
            if (events.isEmpty()) return;
            ChannelBooking booking = b.get();
            booking.setStatus(ChannelBookingService.externalStatus(after));
            booking.setUpdatedAt(Instant.now());
            bookings.save(booking);
            Reservation view = core.view(c, booking, after);
            for (String ev : events) emit(c, ev, view);
        } catch (Exception ex) {
            log.warn("Could not queue webhook for a reservation change: {}", ex.getMessage());
        }
    }

    // ------------------------------------------------------------- delivery

    void deliverDue() {
        for (ChannelWebhookDelivery d : deliveries.findTop50ByStatusAndNextAttemptAtBeforeOrderByNextAttemptAtAsc(ChannelWebhookDelivery.Status.PENDING, Instant.now())) {
            attempt(d);
        }
    }

    public ChannelWebhookDelivery attempt(ChannelWebhookDelivery d) {
        d.setAttempts(d.getAttempts() + 1);
        try {
            URI target = OutboundUrlGuard.check(d.getUrl());   // public HTTPS only (no SSRF)
            String secret = secretFor(d.getChannelId());
            long ts = Instant.now().getEpochSecond();
            HttpRequest req = HttpRequest.newBuilder(target)
                .timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/json")
                .header("User-Agent", "NCT-Rental-Webhooks/1.0")
                .header("X-NCT-Event", d.getEventType())
                .header("X-NCT-Delivery", d.getEventId())
                .header("X-NCT-Timestamp", String.valueOf(ts))
                .header("X-NCT-Signature", "sha256=" + sign(secret, ts + "." + d.getPayload()))
                .POST(HttpRequest.BodyPublishers.ofString(d.getPayload(), StandardCharsets.UTF_8))
                .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            d.setLastHttpStatus(res.statusCode());
            if (res.statusCode() >= 200 && res.statusCode() < 300) {
                d.setStatus(ChannelWebhookDelivery.Status.DELIVERED);
                d.setDeliveredAt(Instant.now());
                d.setLastError(null);
                return deliveries.save(d);
            }
            d.setLastError("HTTP " + res.statusCode());
        } catch (Exception e) {
            d.setLastError(trim(e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
        }
        Instant next = Instant.now().plus(Math.min(60, 1L << Math.min(6, d.getAttempts() - 1)), ChronoUnit.MINUTES);
        if (next.isAfter(d.getCreatedAt().plus(RETRY_WINDOW))) {
            d.setStatus(ChannelWebhookDelivery.Status.FAILED);
            d.setNextAttemptAt(null);
        } else {
            d.setNextAttemptAt(next);
        }
        return deliveries.save(d);
    }

    /** Staff replay: sends again now, whatever its state. */
    public ChannelWebhookDelivery replay(String channelId, long id) {
        ChannelWebhookDelivery d = deliveries.findById(id).filter(x -> x.getChannelId().equals(channelId))
            .orElseThrow(() -> new NoSuchElementException("Delivery not found"));
        d.setStatus(ChannelWebhookDelivery.Status.PENDING);
        d.setCreatedAt(Instant.now());
        return attempt(d);
    }

    public List<ChannelWebhookDelivery> list(String channelId, int limit) {
        return deliveries.findByChannelIdOrderByCreatedAtDesc(channelId, PageRequest.of(0, Math.max(1, Math.min(limit, 200))));
    }

    // ------------------------------------------------------------- secrets

    /** Creates (or replaces) the channel's signing secret and returns it; only shown once. */
    public String rotateSecret(String channelId) {
        byte[] raw = new byte[32];
        new SecureRandom().nextBytes(raw);
        String secret = "whsec_" + HexFormat.of().formatHex(raw);
        ChannelSecret s = secrets.findById(channelId).orElseGet(ChannelSecret::new);
        s.setChannelId(channelId);
        s.setWebhookSecret(secret);
        s.setCreatedAt(Instant.now());
        secrets.save(s);
        return secret;
    }

    public Optional<Instant> secretCreatedAt(String channelId) {
        return secrets.findById(channelId).map(ChannelSecret::getCreatedAt);
    }

    private String secretFor(String channelId) {
        return secrets.findById(channelId).map(ChannelSecret::getWebhookSecret)
            .orElseThrow(() -> new IllegalStateException("No webhook signing secret: create one in Channel Manager"));
    }

    static String sign(String secret, String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String trim(String s) { return s.length() > 480 ? s.substring(0, 480) : s; }
}
