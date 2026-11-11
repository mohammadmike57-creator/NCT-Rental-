package com.carrental.backend.ota;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * Verifies the feed key a partner presents. Only the SHA-256 hash of the key
 * is stored (generated in the browser and shown to staff once), so a leaked
 * state document does not leak usable keys.
 */
public final class PartnerKeyVerifier {

    private PartnerKeyVerifier() {}

    public static String sha256Hex(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Extracts the key from "Authorization: Bearer <key>" or "X-Api-Key: <key>". */
    public static String extractKey(String authorization, String apiKeyHeader) {
        if (authorization != null && authorization.regionMatches(true, 0, "Bearer ", 0, 7)) {
            return authorization.substring(7).trim();
        }
        return apiKeyHeader == null ? null : apiKeyHeader.trim();
    }

    /** Which of the channel's keys was presented. */
    public enum KeyKind { NONE, LIVE, TEST }

    /** Constant-time comparison against the stored hashes; channels without a key are always denied. */
    public static KeyKind kind(ChannelSnapshot channel, String presentedKey) {
        if (presentedKey == null || presentedKey.isBlank()) return KeyKind.NONE;
        byte[] actual = sha256Hex(presentedKey).getBytes(StandardCharsets.US_ASCII);
        if (same(channel.feedKeyHash(), actual)) return KeyKind.LIVE;
        if (same(channel.testKeyHash(), actual)) return KeyKind.TEST;
        java.time.Instant until = channel.previousKeyExpiresAt();
        if (until != null && java.time.Instant.now().isBefore(until) && same(channel.previousKeyHash(), actual)) return KeyKind.LIVE;
        return KeyKind.NONE;
    }

    /** True for the live key or the test key (the test key is held to the sandbox by the gateway). */
    public static boolean matches(ChannelSnapshot channel, String presentedKey) {
        return kind(channel, presentedKey) != KeyKind.NONE;
    }

    private static boolean same(String stored, byte[] actual) {
        if (stored == null || stored.isBlank()) return false;
        return MessageDigest.isEqual(stored.toLowerCase().getBytes(StandardCharsets.US_ASCII), actual);
    }
}
