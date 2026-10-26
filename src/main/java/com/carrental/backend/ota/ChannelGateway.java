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
    private final Map<String, long[]> windows = new ConcurrentHashMap<>();

    public ChannelGateway(ChannelStateReader channels, ChannelDeliveryService deliveries, ChannelBookingService core) {
        this.channels = channels;
        this.log2 = deliveries;
        this.core = core;
    }

    /**
     * Runs one broker operation. action produces the success body; error renders a ChannelError
     * for this adapter (body + content type) using the request id.
     */
    public ResponseEntity<String> handle(String channelCode, String key, HttpServletRequest http, String messageType, long bytes,
                                         String requestId, Function<Call, Rendered> action,
                                         BiFunction<ChannelException, String, Rendered> error) {
        long start = System.nanoTime();
        String rid = requestId == null || requestId.isBlank() ? "REQ-" + UUID.randomUUID().toString().substring(0, 13).toUpperCase(Locale.ROOT)
            : requestId.length() > 80 ? requestId.substring(0, 80) : requestId;
        String remote = clientIp(http);
        ChannelSnapshot ch = null;
        try {
            if (channelCode == null || channelCode.isBlank()) throw ChannelError.AUTH_FAILED.ex("Channel code is required");
            Optional<ChannelSnapshot> found = channels.find(channelCode);
            if (found.isPresent() && !allow(found.get(), remote)) {
                ch = found.get();
                throw ChannelError.RATE_LIMIT_EXCEEDED.ex("Rate limit of " + rateLimit(ch) + " requests a minute exceeded; retry with back-off");
            }
            if (found.isEmpty() || !PartnerKeyVerifier.matches(found.get(), key)) {
                ch = found.orElse(null);
                throw ChannelError.AUTH_FAILED.ex("Invalid or missing feed key");
            }
            ch = found.get();
            if ("paused".equalsIgnoreCase(ch.status())) throw ChannelError.PERMISSION_DENIED.ex("Distribution to this channel is paused");
            if (!ipAllowed(ch, remote)) throw ChannelError.PERMISSION_DENIED.ex("Requests from " + remote + " are not allowed for this channel");
            boolean sandboxHeader = "sandbox".equalsIgnoreCase(http.getHeader("X-Environment"));
            Rendered ok = action.apply(new Call(core.context(ch, sandboxHeader), rid));
            log2.recordInbound(ch, messageType, 200, true, null, bytes, ms(start), remote);
            return respond(200, ok, rid);
        } catch (ChannelException e) {
            if (ch != null) log2.recordInbound(ch, messageType, e.error.http.value(), false, e.error.name() + ": " + e.getMessage(), bytes, ms(start), remote);
            return respond(e.error.http.value(), error.apply(e, rid), rid);
        } catch (OtaRequestParser.InvalidRequestException e) {
            ChannelException ce = ChannelError.INVALID_REQUEST.ex(e.getMessage());
            if (ch != null) log2.recordInbound(ch, messageType, 400, false, "INVALID_REQUEST: " + e.getMessage(), bytes, ms(start), remote);
            return respond(400, error.apply(ce, rid), rid);
        } catch (Exception e) {
            log.error("Channel {} {} failed ({})", channelCode, messageType, rid, e);
            if (ch != null) log2.recordInbound(ch, messageType, 500, false, "SYSTEM_ERROR: " + e.getClass().getSimpleName(), bytes, ms(start), remote);
            // No stack traces or internal details to partners.
            return respond(500, error.apply(ChannelError.SYSTEM_ERROR.ex("Internal error, reference " + rid), rid), rid);
        }
    }

    private static ResponseEntity<String> respond(int status, Rendered r, String rid) {
        return ResponseEntity.status(status).contentType(r.type()).header("Cache-Control", "no-store").header("X-Request-ID", rid).body(r.body());
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

    private static boolean ipAllowed(ChannelSnapshot ch, String remote) {
        var list = ch.raw().path("bookingRules").path("ipAllowlist");
        if (!list.isArray() || list.isEmpty()) return true;
        for (var ip : list) if (ip.asText("").trim().equals(remote)) return true;
        return false;
    }

    /** The partner's address: the first X-Forwarded-For entry behind the hosting proxy. */
    static String clientIp(HttpServletRequest http) {
        String fwd = http.getHeader("X-Forwarded-For");
        if (fwd != null && !fwd.isBlank()) return fwd.split(",")[0].trim();
        return http.getRemoteAddr();
    }

    private static long ms(long start) { return (System.nanoTime() - start) / 1_000_000; }
}
