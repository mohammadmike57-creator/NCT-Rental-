package com.carrental.backend.ota;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
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

/**
 * Webhooks v2 for REST/JSON v3 subscriptions. Next to the channel's own webhook (v1), which is unchanged.
 *
 *   URD-Webhook-Id: <event id>            URD-Webhook-Timestamp: <unix seconds>
 *   URD-Webhook-Nonce: <random, once>     URD-Webhook-Signature: v1=<hex HMAC-SHA256(secret, id.timestamp.nonce.body)>
 *
 * During a secret rotation both signatures are sent ("v1=<new>,v1=<old>") for the grace period. The broker must
 * answer 2xx within 10 seconds. Failed deliveries retry 1 min, 5 min, 15 min, 1 h, 3 h, 6 h, then every 12 h for
 * 72 hours; then they stay FAILED (the dead-letter list) until replayed. Events of one reservation are delivered in
 * order: a later one waits while an earlier one is still pending.
 */
@Service
public class WebhookV2Service {

    public static final List<String> EVENTS = List.of("reservation.created", "reservation.confirmed", "reservation.modified",
        "reservation.cancelled", "reservation.no_show", "reservation.picked_up", "reservation.returned", "agreement.created",
        "agreement.closed", "inventory.updated", "rate_sheet.published", "stop_sale.created", "stop_sale.removed", "webhook.test");
    static final Duration RETRY_WINDOW = Duration.ofHours(72);
    static final Duration GRACE = Duration.ofHours(72);
    private static final long[] SCHEDULE_MIN = {1, 5, 15, 60, 180, 360};
    private static final SecureRandom RANDOM = new SecureRandom();

    public record Created(WebhookSubscription subscription, String secret) {}

    private final WebhookSubscriptionRepository subs;
    private final ChannelWebhookRepository deliveries;
    private final SecretBox box;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();

    public WebhookV2Service(WebhookSubscriptionRepository subs, ChannelWebhookRepository deliveries, SecretBox box) {
        this.subs = subs;
        this.deliveries = deliveries;
        this.box = box;
    }

    // ------------------------------------------------------------- subscriptions

    public Created create(String channelId, boolean sandbox, String url, Collection<String> events, String by) {
        WebhookSubscription s = new WebhookSubscription();
        s.setPublicId("whsub_" + random(12));
        s.setChannelId(channelId);
        s.setEnvironment(sandbox ? "sandbox" : "production");
        s.setUrl(checkUrl(url));
        s.setEvents(String.join(" ", checkEvents(events)));
        String secret = newSecret();
        s.setSecretEnc(box.seal(secret));
        s.setCreatedBy(by);
        return new Created(subs.save(s), secret);
    }

    public List<WebhookSubscription> list(String channelId, boolean sandbox) {
        return subs.findByChannelIdAndEnvironment(channelId, sandbox ? "sandbox" : "production");
    }

    public Optional<WebhookSubscription> find(String channelId, boolean sandbox, String publicId) {
        return subs.findByPublicId(publicId).filter(s -> s.getChannelId().equals(channelId) && s.getEnvironment().equals(sandbox ? "sandbox" : "production"));
    }

    public WebhookSubscription update(WebhookSubscription s, String url, Collection<String> events, String status) {
        if (url != null) s.setUrl(checkUrl(url));
        if (events != null) s.setEvents(String.join(" ", checkEvents(events)));
        if (status != null) {
            try { s.setStatus(WebhookSubscription.Status.valueOf(status.toUpperCase(Locale.ROOT))); }
            catch (IllegalArgumentException e) { throw ChannelError.INVALID_REQUEST.ex("status must be ACTIVE, PAUSED or DISABLED"); }
        }
        s.setUpdatedAt(Instant.now());
        return subs.save(s);
    }

    public void delete(WebhookSubscription s) { subs.delete(s); }

    /** A new secret; the old one keeps signing too for the grace period. Returned once. */
    public String rotate(WebhookSubscription s) {
        String secret = newSecret();
        s.setPreviousSecretEnc(s.getSecretEnc());
        s.setPreviousSecretUntil(Instant.now().plus(GRACE));
        s.setSecretEnc(box.seal(secret));
        s.setUpdatedAt(Instant.now());
        subs.save(s);
        return secret;
    }

    // ------------------------------------------------------------- events

    /** Queues the event for every active subscription of this channel and environment that wants it; returns how many. */
    public int fanOut(String channelId, String channelCode, boolean sandbox, String event, String reservationId, String brokerReference,
                      Integer version, JsonNode data) {
        int n = 0;
        for (WebhookSubscription s : subs.findByChannelIdAndEnvironment(channelId, sandbox ? "sandbox" : "production")) {
            if (s.getStatus() == WebhookSubscription.Status.DISABLED || !Arrays.asList(s.getEvents().split(" ")).contains(event)) continue;
            queue(s, channelCode, event, reservationId, brokerReference, version, data);
            n++;
        }
        return n;
    }

    public ChannelWebhookDelivery queue(WebhookSubscription s, String channelCode, String event, String reservationId, String brokerReference,
                                        Integer version, JsonNode data) {
        String id = "evt_" + UUID.randomUUID().toString().replace("-", "");
        ObjectNode env = ChannelBookingService.JSON.createObjectNode();
        env.put("id", id);
        env.put("type", event);
        env.put("apiVersion", ApiV3Controller.API_VERSION);
        env.put("createdAt", Instant.now().truncatedTo(ChronoUnit.MILLIS).toString());
        env.put("environment", s.getEnvironment());
        env.put("channel", channelCode);
        if (version != null) env.put("sequence", version);
        if (reservationId != null) {
            ObjectNode subj = env.putObject("subject");
            subj.put("reservationId", reservationId);
            if (brokerReference != null) subj.put("brokerReference", brokerReference);
            if (version != null) subj.put("version", version);
        }
        if (data != null) env.set("data", data);
        ChannelWebhookDelivery d = new ChannelWebhookDelivery();
        d.setEventId(id);
        d.setChannelId(s.getChannelId());
        d.setEventType(event);
        d.setReservationNumber(reservationId);
        d.setBrokerReference(brokerReference);
        d.setUrl(s.getUrl());
        d.setPayload(ChannelBookingService.write(env));
        d.setStatus(ChannelWebhookDelivery.Status.PENDING);
        d.setNextAttemptAt(Instant.now());
        d.setCreatedAt(Instant.now());
        d.setSubscriptionId(s.getId());
        d.setSequence(version);
        return deliveries.save(d);
    }

    // ------------------------------------------------------------- delivery

    /** False while the subscription is paused or an earlier event of the same reservation is still pending. */
    boolean mayDeliverNow(ChannelWebhookDelivery d) {
        Optional<WebhookSubscription> s = subs.findById(d.getSubscriptionId());
        if (s.isEmpty() || s.get().getStatus() != WebhookSubscription.Status.ACTIVE) return false;
        return d.getReservationNumber() == null
            || !deliveries.existsBySubscriptionIdAndReservationNumberAndStatusAndIdLessThan(d.getSubscriptionId(), d.getReservationNumber(),
                ChannelWebhookDelivery.Status.PENDING, d.getId());
    }

    public ChannelWebhookDelivery attempt(ChannelWebhookDelivery d) {
        d.setAttempts(d.getAttempts() + 1);
        try {
            WebhookSubscription s = subs.findById(d.getSubscriptionId()).orElseThrow(() -> new IllegalStateException("Subscription removed"));
            URI target = OutboundUrlGuard.check(d.getUrl());   // public HTTPS only (no SSRF)
            long ts = Instant.now().getEpochSecond();
            String nonce = random(16);
            HttpRequest req = HttpRequest.newBuilder(target)
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json")
                .header("User-Agent", "UR-Drive-Webhooks/2.0")
                .header("URD-Webhook-Id", d.getEventId())
                .header("URD-Webhook-Event", d.getEventType())
                .header("URD-Webhook-Timestamp", String.valueOf(ts))
                .header("URD-Webhook-Nonce", nonce)
                .header("URD-Webhook-Signature", signatureHeader(s, d.getEventId(), ts, nonce, d.getPayload()))
                .POST(HttpRequest.BodyPublishers.ofString(d.getPayload(), StandardCharsets.UTF_8))
                .build();
            HttpResponse<String> res = http.send(req, OutboundUrlGuard.boundedReply());
            d.setLastHttpStatus(res.statusCode());
            if (res.statusCode() >= 200 && res.statusCode() < 300) {
                d.setStatus(ChannelWebhookDelivery.Status.DELIVERED);
                d.setDeliveredAt(Instant.now());
                d.setLastError(null);
                d.setNextAttemptAt(null);
                return deliveries.save(d);
            }
            d.setLastError("HTTP " + res.statusCode());
        } catch (Exception e) {
            String m = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            d.setLastError(m.length() > 480 ? m.substring(0, 480) : m);
        }
        Instant next = nextAttempt(d.getCreatedAt(), d.getAttempts(), Instant.now());
        d.setNextAttemptAt(next);
        if (next == null) d.setStatus(ChannelWebhookDelivery.Status.FAILED);   // dead letter
        return deliveries.save(d);
    }

    /** When to try again after this many attempts, or null when the 72 hours are over (dead letter). */
    static Instant nextAttempt(Instant created, int attempts, Instant now) {
        long minutes = attempts <= SCHEDULE_MIN.length ? SCHEDULE_MIN[attempts - 1] : 720;
        long jitter = Math.round(minutes * 60 * 0.2 * (RANDOM.nextDouble() * 2 - 1));
        Instant next = now.plusSeconds(minutes * 60 + jitter);
        return next.isAfter(created.plus(RETRY_WINDOW)) ? null : next;
    }

    /** Replays a v2 delivery now (dead letters included), as a fresh 72-hour window. */
    public ChannelWebhookDelivery replay(ChannelWebhookDelivery d) {
        d.setStatus(ChannelWebhookDelivery.Status.PENDING);
        d.setCreatedAt(Instant.now());
        d.setAttempts(0);
        d.setNextAttemptAt(Instant.now());
        return attempt(d);
    }

    String signatureHeader(WebhookSubscription s, String id, long ts, String nonce, String body) {
        String base = id + "." + ts + "." + nonce + "." + body;
        String sig = "v1=" + hmac(box.open(s.getSecretEnc()), base);
        if (s.getPreviousSecretEnc() != null && s.getPreviousSecretUntil() != null && Instant.now().isBefore(s.getPreviousSecretUntil())) {
            sig += ",v1=" + hmac(box.open(s.getPreviousSecretEnc()), base);
        }
        return sig;
    }

    static String hmac(String secret, String base) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(base.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String checkUrl(String url) {
        if (url == null || url.isBlank()) throw ChannelError.INVALID_REQUEST.ex("url is required");
        try {
            OutboundUrlGuard.check(url.trim());
        } catch (Exception e) {
            // A host that does not resolve yet is accepted here; every delivery checks the address again.
            String m = e.getMessage() == null ? "" : e.getMessage();
            if (!m.startsWith("Endpoint host could not be resolved")) throw ChannelError.INVALID_REQUEST.ex("url must be a public HTTPS address: " + m);
        }
        return url.trim();
    }

    private static List<String> checkEvents(Collection<String> events) {
        if (events == null || events.isEmpty()) return EVENTS.stream().filter(e -> !e.equals("webhook.test")).toList();
        List<String> bad = events.stream().filter(e -> !EVENTS.contains(e)).toList();
        if (!bad.isEmpty()) throw ChannelError.INVALID_REQUEST.ex("Unknown events: " + String.join(", ", bad));
        return events.stream().distinct().toList();
    }

    private static String newSecret() { return "whsec_" + random(32); }

    private static String random(int bytes) {
        byte[] b = new byte[bytes];
        RANDOM.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }
}
