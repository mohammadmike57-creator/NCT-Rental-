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

    /** Constant-time comparison against the stored hash; channels without a key are always denied. */
    public static boolean matches(ChannelSnapshot channel, String presentedKey) {
        String stored = channel.feedKeyHash();
        if (stored == null || stored.isBlank() || presentedKey == null || presentedKey.isBlank()) return false;
        byte[] expected = stored.toLowerCase().getBytes(StandardCharsets.US_ASCII);
        byte[] actual = sha256Hex(presentedKey).getBytes(StandardCharsets.US_ASCII);
        return MessageDigest.isEqual(expected, actual);
    }
}
