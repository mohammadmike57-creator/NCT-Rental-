package com.carrental.backend.security;

import com.carrental.backend.model.MfaSettings;
import com.carrental.backend.model.User;
import com.carrental.backend.ota.SecretBox;
import com.carrental.backend.repository.MfaSettingsRepository;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import org.apache.commons.codec.binary.Base32;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Two-step sign-in: after the password, a 6-digit code from an authenticator app (Google Authenticator,
 * Microsoft Authenticator, …) or one of ten single-use backup codes.
 *
 * <ul>
 *   <li>Off for everyone until each person turns it on for themselves; nothing changes for anyone else.</li>
 *   <li>The app secret is stored encrypted ({@link SecretBox}); backup codes only as hashes.</li>
 *   <li>A code is accepted once (no replay), with ±30 seconds for a phone clock that is slightly off.</li>
 *   <li>Between password and code the browser holds a random, 5-minute challenge (5 tries), never a login token.</li>
 * </ul>
 */
@Service
public class TwoStepService {

    static final String ISSUER = "NCT Rental";
    static final int BACKUP_CODES = 10;
    static final long CHALLENGE_SECONDS = 300;
    static final int CHALLENGE_TRIES = 5;
    /** Wrong codes allowed per account in {@link #LOCK_SECONDS}, over all sign-in attempts, before codes are refused. */
    static final int ACCOUNT_TRIES = 10;
    static final long LOCK_SECONDS = 900;

    private final MfaSettingsRepository settings;
    private final SecretBox box;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Challenge> challenges = new ConcurrentHashMap<>();
    Clock clock = Clock.systemUTC();

    private final Map<String, long[]> wrongCodes = new ConcurrentHashMap<>();   // email -> {count, first wrong at}

    private record Challenge(String email, long expiresAt, int[] tries) {}

    public record Setup(String secret, String otpauthUri, String qrSvg) {}

    public TwoStepService(MfaSettingsRepository settings, SecretBox box) {
        this.settings = settings;
        this.box = box;
    }

    /** On only when confirmed with a code. Older, unconfirmed or unreadable entries count as off, so nobody is locked out. */
    public boolean isOn(User user) {
        return settings.findByUser(user).map(this::active).orElse(false);
    }

    private boolean active(MfaSettings s) {
        return s.isMfaEnabled() && s.getSecretKey() != null && s.getSecretKey().startsWith("v1:");
    }

    /** Starts (or restarts) setting up: a new secret, kept pending until {@link #confirm} sees a correct code. */
    public synchronized Setup start(User user) {
        MfaSettings s = settings.findByUser(user).orElseGet(MfaSettings::new);
        if (active(s)) throw new IllegalStateException("Two-step sign-in is already on.");
        byte[] raw = new byte[20];
        random.nextBytes(raw);
        String secret = new Base32().encodeToString(raw).replace("=", "");
        s.setUser(user);
        s.setMfaEnabled(false);
        s.setMfaType(MfaSettings.MfaType.TOTP);
        s.setSecretKey(box.seal(secret));
        s.setBackupCodes(null);
        s.setLastUsedStep(null);
        settings.save(s);
        String label = URLEncoder.encode(ISSUER + ":" + user.getEmail(), StandardCharsets.UTF_8).replace("+", "%20");
        String uri = "otpauth://totp/" + label + "?secret=" + secret
            + "&issuer=" + URLEncoder.encode(ISSUER, StandardCharsets.UTF_8).replace("+", "%20")
            + "&algorithm=SHA1&digits=6&period=30";
        return new Setup(secret, uri, qrSvg(uri));
    }

    /** Turns it on when the code from the app is right; returns the backup codes, shown this one time only. */
    public synchronized Optional<List<String>> confirm(User user, String code) {
        MfaSettings s = settings.findByUser(user).orElse(null);
        if (s == null || active(s) || s.getSecretKey() == null || !s.getSecretKey().startsWith("v1:")) return Optional.empty();
        Long step = matchingStep(box.open(s.getSecretKey()), code, null);
        if (step == null) return Optional.empty();
        List<String> codes = new ArrayList<>();
        List<String> hashes = new ArrayList<>();
        for (int i = 0; i < BACKUP_CODES; i++) {
            String c = backupCode();
            codes.add(c);
            hashes.add(hash(c));
        }
        s.setBackupCodes(String.join(",", hashes));
        s.setLastUsedStep(step);
        s.setMfaEnabled(true);
        settings.save(s);
        return Optional.of(codes);
    }

    /** Checks an app code or a backup code (a used backup code is gone). */
    public synchronized boolean verify(User user, String code) {
        MfaSettings s = settings.findByUser(user).orElse(null);
        if (s == null || !active(s) || code == null) return false;
        String clean = code.replaceAll("[\\s-]", "").toUpperCase(Locale.ROOT);
        if (clean.matches("\\d{6}")) {
            Long step = matchingStep(box.open(s.getSecretKey()), clean, s.getLastUsedStep());
            if (step == null) return false;
            s.setLastUsedStep(step);
            settings.save(s);
            return true;
        }
        if (s.getBackupCodes() == null || s.getBackupCodes().isEmpty()) return false;
        List<String> left = new ArrayList<>(List.of(s.getBackupCodes().split(",")));
        if (!left.remove(hash(clean))) return false;
        s.setBackupCodes(String.join(",", left));
        settings.save(s);
        return true;
    }

    public int backupCodesLeft(User user) {
        return settings.findByUser(user).filter(this::active)
            .map(s -> s.getBackupCodes() == null || s.getBackupCodes().isEmpty() ? 0 : s.getBackupCodes().split(",").length)
            .orElse(0);
    }

    /** Turns it off (the person themselves with password and code, or an administrator for someone who lost their phone). */
    public synchronized void turnOff(User user) {
        settings.findByUser(user).ifPresent(s -> {
            s.setMfaEnabled(false);
            s.setSecretKey(null);
            s.setBackupCodes(null);
            s.setLastUsedStep(null);
            settings.save(s);
        });
    }

    // ---- the step between password and code ----

    public String newChallenge(String email) {
        long now = clock.instant().getEpochSecond();
        challenges.values().removeIf(c -> c.expiresAt() < now);
        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String id = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        challenges.put(id, new Challenge(email, now + CHALLENGE_SECONDS, new int[]{0}));
        return id;
    }

    /** The email the challenge belongs to while it is valid and has tries left; each call uses one try. */
    public Optional<String> useChallenge(String id) {
        if (id == null) return Optional.empty();
        Challenge c = challenges.get(id);
        if (c == null) return Optional.empty();
        synchronized (c) {
            if (c.expiresAt() < clock.instant().getEpochSecond() || c.tries()[0] >= CHALLENGE_TRIES) {
                challenges.remove(id);
                return Optional.empty();
            }
            c.tries()[0]++;
        }
        return Optional.of(c.email());
    }

    /** False while an account has had too many wrong codes recently (stops guessing with a known password). */
    public boolean mayTryCode(String email) {
        long[] w = wrongCodes.get(email.toLowerCase(Locale.ROOT));
        if (w == null) return true;
        if (clock.instant().getEpochSecond() - w[1] > LOCK_SECONDS) {
            wrongCodes.remove(email.toLowerCase(Locale.ROOT));
            return true;
        }
        return w[0] < ACCOUNT_TRIES;
    }

    public void wrongCode(String email) {
        long now = clock.instant().getEpochSecond();
        wrongCodes.compute(email.toLowerCase(Locale.ROOT), (k, w) ->
            w == null || now - w[1] > LOCK_SECONDS ? new long[]{1, now} : new long[]{w[0] + 1, w[1]});
    }

    public void rightCode(String email) {
        wrongCodes.remove(email.toLowerCase(Locale.ROOT));
    }

    public void finishChallenge(String id) {
        if (id != null) challenges.remove(id);
    }

    // ---- codes ----

    private Long matchingStep(String secret, String code, Long lastUsed) {
        if (code == null) return null;
        String clean = code.replaceAll("\\s", "");
        if (!clean.matches("\\d{6}")) return null;
        long now = clock.instant().getEpochSecond() / 30;
        for (long step = now - 1; step <= now + 1; step++) {
            if (lastUsed != null && step <= lastUsed) continue;          // each code works once
            if (MessageDigest.isEqual(codeAt(secret, step).getBytes(StandardCharsets.UTF_8), clean.getBytes(StandardCharsets.UTF_8))) {
                return step;
            }
        }
        return null;
    }

    /** RFC 6238 code (HMAC-SHA1, 6 digits, 30 seconds). */
    static String codeAt(String base32Secret, long step) {
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(new Base32().decode(base32Secret), "HmacSHA1"));
            byte[] h = mac.doFinal(ByteBuffer.allocate(8).putLong(step).array());
            int o = h[h.length - 1] & 0x0F;
            int bin = ((h[o] & 0x7F) << 24) | ((h[o + 1] & 0xFF) << 16) | ((h[o + 2] & 0xFF) << 8) | (h[o + 3] & 0xFF);
            return String.format("%06d", bin % 1_000_000);
        } catch (Exception e) {
            throw new IllegalStateException("Could not work out the code", e);
        }
    }

    private static final char[] BACKUP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();

    private String backupCode() {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < 10; i++) {
            if (i == 5) b.append('-');
            b.append(BACKUP_ALPHABET[random.nextInt(BACKUP_ALPHABET.length)]);
        }
        return b.toString();
    }

    private static String hash(String code) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(code.replace("-", "").getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(d);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    static String qrSvg(String text) {
        try {
            BitMatrix m = new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 0, 0, Map.of(EncodeHintType.MARGIN, 2));
            StringBuilder path = new StringBuilder();
            for (int y = 0; y < m.getHeight(); y++) {
                for (int x = 0; x < m.getWidth(); x++) {
                    if (m.get(x, y)) path.append('M').append(x).append(',').append(y).append("h1v1h-1z");
                }
            }
            return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 " + m.getWidth() + " " + m.getHeight()
                + "\" shape-rendering=\"crispEdges\"><rect width=\"100%\" height=\"100%\" fill=\"#fff\"/><path fill=\"#000\" d=\""
                + path + "\"/></svg>";
        } catch (Exception e) {
            throw new IllegalStateException("Could not draw the QR code", e);
        }
    }
}
