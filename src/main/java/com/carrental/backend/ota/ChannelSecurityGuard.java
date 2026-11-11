package com.carrental.backend.ota;

import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Defences in front of every broker call, beside the API key:
 * <ul>
 *   <li>Brute-force lockout: an address that fails authentication {@value #MAX_FAILURES} times within
 *       {@value #WINDOW_MINUTES} minutes is refused for {@value #LOCK_MINUTES} minutes, whatever key it sends.</li>
 *   <li>Signed requests (optional per channel): X-URD-Timestamp and X-URD-Signature (X-NCT-* also accepted) = sha256 HMAC of
 *       "timestamp.body" with the channel's signing secret, at most 5 minutes old, and never accepted twice.</li>
 * </ul>
 * State is held in memory: a restart clears lockouts, which only ever makes the service more permissive for a moment.
 */
@Component
public class ChannelSecurityGuard {

    static final int MAX_FAILURES = 10;
    static final int WINDOW_MINUTES = 10;
    static final int LOCK_MINUTES = 15;
    static final long SIGNATURE_WINDOW_SECONDS = 300;

    private final Map<String, Deque<Long>> failures = new ConcurrentHashMap<>();
    private final Map<String, Long> lockedUntil = new ConcurrentHashMap<>();
    private final Map<String, Long> seenSignatures = new ConcurrentHashMap<>();

    /** When the address is locked out, the moment the lock ends; otherwise null. */
    public Instant lockedUntil(String ip) {
        Long until = lockedUntil.get(ip);
        if (until == null) return null;
        if (until <= System.currentTimeMillis()) { lockedUntil.remove(ip); return null; }
        return Instant.ofEpochMilli(until);
    }

    /** Records a failed authentication; returns true when this failure locked the address. */
    public boolean failed(String ip) {
        long now = System.currentTimeMillis();
        Deque<Long> q = failures.computeIfAbsent(ip, k -> new ArrayDeque<>());
        synchronized (q) {
            q.addLast(now);
            while (!q.isEmpty() && q.peekFirst() < now - WINDOW_MINUTES * 60_000L) q.pollFirst();
            if (q.size() >= MAX_FAILURES) {
                q.clear();
                lockedUntil.put(ip, now + LOCK_MINUTES * 60_000L);
                return true;
            }
        }
        if (failures.size() > 50_000) failures.clear();
        return false;
    }

    public void succeeded(String ip) { failures.remove(ip); }

    /** Staff can lift a lock (Security tab). */
    public boolean unlock(String ip) { failures.remove(ip); return lockedUntil.remove(ip) != null; }

    /** Addresses locked now, with the end of each lock. */
    public List<Map<String, Object>> locks() {
        long now = System.currentTimeMillis();
        lockedUntil.entrySet().removeIf(e -> e.getValue() <= now);
        List<Map<String, Object>> out = new ArrayList<>();
        lockedUntil.forEach((ip, until) -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ip", ip);
            m.put("until", Instant.ofEpochMilli(until).toString());
            out.add(m);
        });
        return out;
    }

    /**
     * Checks a signed request. Throws AUTH_FAILED with the reason when the signature is missing, stale, wrong or replayed.
     */
    public void verifySignature(String secret, String timestamp, String signature, String body, long nowSeconds) {
        if (secret == null || secret.isBlank()) throw ChannelError.AUTH_FAILED.ex("Signed requests are required but no signing secret exists yet");
        if (timestamp == null || timestamp.isBlank() || signature == null || signature.isBlank()) {
            throw ChannelError.AUTH_FAILED.ex("Send X-URD-Timestamp and X-URD-Signature: this channel requires signed requests");
        }
        long ts;
        try { ts = Long.parseLong(timestamp.trim()); } catch (NumberFormatException e) { throw ChannelError.AUTH_FAILED.ex("X-URD-Timestamp must be Unix seconds"); }
        if (Math.abs(nowSeconds - ts) > SIGNATURE_WINDOW_SECONDS) throw ChannelError.AUTH_FAILED.ex("X-URD-Timestamp is more than 5 minutes from our clock");
        String expected = "sha256=" + ChannelWebhookService.sign(secret, ts + "." + (body == null ? "" : body));
        String given = signature.trim();
        if (!MessageDigest.isEqual(expected.getBytes(StandardCharsets.US_ASCII), given.getBytes(StandardCharsets.US_ASCII))) {
            throw ChannelError.AUTH_FAILED.ex("X-URD-Signature does not match the request");
        }
        long nowMs = nowSeconds * 1000;
        seenSignatures.entrySet().removeIf(e -> e.getValue() < nowMs);
        if (seenSignatures.putIfAbsent(given, nowMs + 2 * SIGNATURE_WINDOW_SECONDS * 1000) != null) {
            throw ChannelError.AUTH_FAILED.ex("This signed request was already received (replay)");
        }
    }
}
