package com.carrental.backend.ota;

import com.carrental.backend.ota.ChannelError.ChannelException;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.BiFunction;
import java.util.function.Function;

/**
 * The single entry point for broker traffic, whatever the format. It authenticates the channel's
 * API key (constant-time, same answer for unknown channel and wrong key), enforces the channel's
 * status, IP allow-list and rate limit, assigns a request id, logs every exchange, and turns
 * ChannelErrors into the adapter's error format. Brokers never reach the data any other way.
 */
@Component
public class ChannelGateway {

    private static final Logger log = LoggerFactory.getLogger(ChannelGateway.class);
    static final int DEFAULT_RATE_PER_MINUTE = 120;

    public record Call(ChannelBookingService.Ctx ctx, String requestId) {}
    public record Rendered(String body, MediaType type) {}

    private final ChannelStateReader channels;
    private final ChannelDeliveryService log2;
    private final ChannelBookingService core;
    private final ChannelTrafficService traffic;
    private final ChannelSecurityGuard guard;
    private final ChannelSecretRepository secrets;
    private final Map<String, long[]> windows = new ConcurrentHashMap<>();
    /** Proxies in front of the server that append to X-Forwarded-For (the host's load balancer = 1). */
    private static volatile int trustedProxyHops = 1;
    /** Request attribute the staff console sets (server side only) to call a channel without its key, always in sandbox. */
    static final String CONSOLE_ATTR = "nct.channel.console";
    /** Request attribute the v3 API sets (server side only) after verifying an OAuth access token: the channel and environment it is for. */
    static final String OAUTH_ATTR = "urd.oauth.principal";

    public ChannelGateway(ChannelStateReader channels, ChannelDeliveryService deliveries, ChannelBookingService core, ChannelTrafficService traffic,
                          ChannelSecurityGuard guard, ChannelSecretRepository secrets,
                          @org.springframework.beans.factory.annotation.Value("${channel.trusted-proxy-hops:1}") int hops) {
        this.channels = channels;
        this.log2 = deliveries;
        this.core = core;
        this.traffic = traffic;
        this.guard = guard;
        this.secrets = secrets;
        trustedProxyHops = Math.max(0, Math.min(5, hops));
    }

    /**
     * Runs one broker operation. action produces the success body; error renders a ChannelError
     * for this adapter (body + content type) using the request id.
     */
    public ResponseEntity<String> handle(String channelCode, String key, HttpServletRequest http, String messageType, String body,
                                         String requestId, Function<Call, Rendered> action,
                                         BiFunction<ChannelException, String, Rendered> error) {
        long bytes = body == null ? 0 : body.length();
        boolean console = http.getAttribute(CONSOLE_ATTR) != null;
        boolean sandbox = console;
        long start = System.nanoTime();
        String rid = requestId == null || requestId.isBlank() ? "REQ-" + UUID.randomUUID().toString().substring(0, 13).toUpperCase(Locale.ROOT)
            : requestId.length() > 80 ? requestId.substring(0, 80) : requestId;
        String remote = clientIp(http);
        ChannelSnapshot ch = null;
        ChannelLanguage.set(ChannelLanguage.detect(http, body));
        try {
            if (channelCode == null || channelCode.isBlank()) throw ChannelError.AUTH_FAILED.ex("Channel code is required");
            Optional<ChannelSnapshot> found = channels.find(channelCode);
            if (found.isPresent() && !allow(found.get(), remote)) {
                ch = found.get();
                throw ChannelError.RATE_LIMIT_EXCEEDED.ex("Rate limit of " + rateLimit(ch) + " requests a minute exceeded; retry with back-off");
            }
            boolean consoleOk = console && found.isPresent() && found.get().id().equals(http.getAttribute(CONSOLE_ATTR));
            OAuthService.Principal oauth = http.getAttribute(OAUTH_ATTR) instanceof OAuthService.Principal p
                && found.isPresent() && found.get().id().equals(p.channelId()) ? p : null;
            java.time.Instant lock = consoleOk ? null : guard.lockedUntil(remote);
            if (lock != null) {
                ch = found.orElse(null);
                throw ChannelError.AUTH_FAILED.ex("Too many failed attempts from " + remote + "; try again after " + lock.truncatedTo(java.time.temporal.ChronoUnit.SECONDS) + " (UTC)");
            }
            if (found.isEmpty() || (!consoleOk && oauth == null && !PartnerKeyVerifier.matches(found.get(), key))) {
                ch = found.orElse(null);
                if (guard.failed(remote)) log.warn("Broker gateway: {} locked out after repeated failed authentication", remote);
                throw ChannelError.AUTH_FAILED.ex("Invalid or missing feed key");
            }
            ch = found.get();
            if (!consoleOk) {
                guard.succeeded(remote);
                if (ch.raw().path("bookingRules").path("requireSignature").asBoolean(false)) {
                    String secret = secrets.findById(ch.id()).map(ChannelSecret::getWebhookSecret).orElse(null);
                    // The signature covers the raw body as sent: for SOAP that is the whole envelope, not the OTA message inside it.
                    Object raw = http.getAttribute(ChannelTrafficService.RAW_BODY_ATTR);
                    // X-URD-* is the documented name; X-NCT-* stays accepted for the brokers that already sign with it.
                    guard.verifySignature(secret, header(http, "X-URD-Timestamp", "X-NCT-Timestamp"), header(http, "X-URD-Signature", "X-NCT-Signature"),
                        raw instanceof String r ? r : body, System.currentTimeMillis() / 1000);
                }
            }
            if ("paused".equalsIgnoreCase(ch.status())) throw ChannelError.PERMISSION_DENIED.ex("Distribution to this channel is paused");
            if (!ipAllowed(ch, remote)) throw ChannelError.PERMISSION_DENIED.ex("Requests from " + remote + " are not allowed for this channel");
            boolean testKey = !consoleOk && oauth == null && PartnerKeyVerifier.kind(ch, key) == PartnerKeyVerifier.KeyKind.TEST;
            boolean sandboxHeader = console || testKey || (oauth != null && oauth.sandbox()) || "sandbox".equalsIgnoreCase(http.getHeader("X-Environment"));
            ChannelBookingService.Ctx ctx = core.context(ch, sandboxHeader);
            sandbox = ctx.sandbox();
            Rendered ok = action.apply(new Call(ctx, rid));
            log2.recordInbound(ch, messageType, 200, true, null, bytes, ms(start), remote);
            traffic.record(ch, http, messageType, body, rid, 200, true, null, null, ok.body(), ms(start), remote, sandbox);
            return respond(200, ok, rid);
        } catch (ChannelException e) {
            return failed(ch, http, messageType, body, rid, e.error.http.value(), e, error, start, remote, sandbox);
        } catch (OtaRequestParser.InvalidRequestException e) {
            return failed(ch, http, messageType, body, rid, 400, ChannelError.INVALID_REQUEST.ex(e.getMessage()), error, start, remote, sandbox);
        } catch (Exception e) {
            log.error("Channel {} {} failed ({})", channelCode, messageType, rid, e);
            // No stack traces or internal details to partners.
            return failed(ch, http, messageType, body, rid, 500, ChannelError.SYSTEM_ERROR.ex("Internal error, reference " + rid), error, start, remote, sandbox);
        } finally {
            ChannelLanguage.clear();
        }
    }

    private ResponseEntity<String> failed(ChannelSnapshot ch, HttpServletRequest http, String type, String body, String rid, int status,
                                          ChannelException e, BiFunction<ChannelException, String, Rendered> error, long start, String remote, boolean sandbox) {
        Rendered r = error.apply(e, rid);
        if (ch != null) {
            log2.recordInbound(ch, type, status, false, e.error.name() + ": " + e.getMessage(), body == null ? 0 : body.length(), ms(start), remote);
            traffic.record(ch, http, type, body, rid, status, false, e.error.name(), e.getMessage(), r.body(), ms(start), remote, sandbox);
        }
        return respond(status, r, rid);
    }

    private static ResponseEntity<String> respond(int status, Rendered r, String rid) {
        var rs = ResponseEntity.status(status).contentType(r.type()).header("Cache-Control", "no-store").header("X-Request-ID", rid);
        if (ChannelLanguage.arabic()) rs = rs.header("Content-Language", "ar");    // only when asked: other answers are unchanged
        return rs.body(r.body());
    }

    private boolean allow(ChannelSnapshot ch, String remote) {
        long minute = System.currentTimeMillis() / 60_000;
        long[] w = windows.compute(ch.id() + "|" + remote, (k, v) -> (v == null || v[0] != minute) ? new long[]{minute, 1} : new long[]{minute, v[1] + 1});
        if (windows.size() > 10_000) windows.entrySet().removeIf(e -> e.getValue()[0] != minute);
        return w[1] <= rateLimit(ch);
    }

    static int rateLimit(ChannelSnapshot ch) {
        int v = ch.raw().path("bookingRules").path("rateLimitPerMinute").asInt(DEFAULT_RATE_PER_MINUTE);
        return Math.max(10, Math.min(5000, v));
    }

    static boolean ipAllowed(ChannelSnapshot ch, String remote) {
        var list = ch.raw().path("bookingRules").path("ipAllowlist");
        if (!list.isArray() || list.isEmpty()) return true;
        for (var ip : list) if (ip.asText("").trim().equals(remote)) return true;
        return false;
    }

    /**
     * The partner's address. Each proxy appends the address it received the request from, so the entry added by our own
     * load balancer is trustworthy and anything to its left may have been written by the caller (and would let anyone pass
     * an IP allow-list or dodge the lockout). We take the entry trustedProxyHops from the right.
     */
    static String clientIp(HttpServletRequest http) {
        Object console = http.getAttribute(CONSOLE_ATTR + ".user");
        if (console != null) return "console:" + console;
        String fwd = http.getHeader("X-Forwarded-For");
        if (trustedProxyHops > 0 && fwd != null && !fwd.isBlank()) {
            String[] parts = fwd.split(",");
            String ip = parts[Math.max(0, parts.length - trustedProxyHops)].trim();
            if (!ip.isEmpty()) return ip;
        }
        return http.getRemoteAddr();
    }

    private static long ms(long start) { return (System.nanoTime() - start) / 1_000_000; }

    private static String header(HttpServletRequest http, String name, String legacy) {
        String v = http.getHeader(name);
        return v != null && !v.isBlank() ? v : http.getHeader(legacy);
    }
}
