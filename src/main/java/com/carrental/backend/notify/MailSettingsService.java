package com.carrental.backend.notify;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Resolves the SMTP settings used for customer emails: settings saved in the app take
 * precedence; otherwise the MAIL_* environment variables are used. The SMTP password is
 * stored encrypted (AES-GCM, key derived from the server secret) and never sent to the browser.
 */
@Service
@RequiredArgsConstructor
public class MailSettingsService {

    public record MailConfig(boolean enabled, String host, int port, String username, String password,
                             String from, String fromName, String security, String source) {
        public boolean usable() {
            return enabled && notBlank(host) && notBlank(username) && notBlank(password);
        }
    }

    private final MailSettingsRepository repo;

    @Value("${mail.smtp.enabled:false}") boolean envEnabled;
    @Value("${mail.smtp.host:smtp.gmail.com}") String envHost;
    @Value("${mail.smtp.port:587}") String envPort;
    @Value("${mail.smtp.username:}") String envUsername;
    @Value("${mail.smtp.password:}") String envPassword;
    @Value("${mail.smtp.from:noreply@nctrental.com}") String envFrom;
    @Value("${mail.smtp.from.name:NCT Rental}") String envFromName;
    @Value("${jwt.secret}") String secret;

    public MailConfig effective() {
        return repo.findById(1L)
            .map(s -> new MailConfig(s.isEnabled(), nz(s.getHost()), s.getPort() == null ? 587 : s.getPort(), nz(s.getUsername()),
                decrypt(s.getPasswordEncrypted()), notBlank(s.getFromAddress()) ? s.getFromAddress() : nz(s.getUsername()),
                notBlank(s.getFromName()) ? s.getFromName() : envFromName, notBlank(s.getSecurity()) ? s.getSecurity() : "STARTTLS", "app"))
            .orElseGet(() -> {
                int port = parsePort(envPort);
                return new MailConfig(envEnabled, nz(envHost), port, nz(envUsername), nz(envPassword), envFrom, envFromName,
                    port == 465 ? "SSL" : "STARTTLS", envEnabled ? "environment" : "none");
            });
    }

    /** Safe view for the settings screen: no password, only whether one is set. */
    public Map<String, Object> view() {
        MailConfig c = effective();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("enabled", c.enabled());
        m.put("host", c.host());
        m.put("port", c.port());
        m.put("username", c.username());
        m.put("passwordSet", notBlank(c.password()));
        m.put("fromAddress", c.from());
        m.put("fromName", c.fromName());
        m.put("security", c.security());
        m.put("source", c.source());
        m.put("configured", c.usable());
        repo.findById(1L).ifPresent(s -> {
            m.put("updatedBy", s.getUpdatedBy());
            m.put("updatedAt", s.getUpdatedAt() == null ? null : s.getUpdatedAt().toString());
        });
        return m;
    }

    public Map<String, Object> save(Map<String, Object> req, String by) {
        MailSettings s = repo.findById(1L).orElseGet(MailSettings::new);
        String host = str(req.get("host"));
        String username = str(req.get("username"));
        String security = "SSL".equalsIgnoreCase(str(req.get("security"))) ? "SSL" : "STARTTLS";
        int port = req.get("port") == null ? (security.equals("SSL") ? 465 : 587) : parsePort(String.valueOf(req.get("port")));
        boolean enabled = Boolean.TRUE.equals(req.get("enabled"));
        String fromAddress = str(req.get("fromAddress"));
        if (enabled) {
            if (!notBlank(host)) throw new IllegalArgumentException("Enter the SMTP server, e.g. smtp.gmail.com.");
            if (!notBlank(username)) throw new IllegalArgumentException("Enter the SMTP username (usually the email address).");
            if (port < 1 || port > 65535) throw new IllegalArgumentException("Enter a valid port (587 or 465).");
        }
        if (notBlank(fromAddress) && !fromAddress.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) throw new IllegalArgumentException("The sender address is not a valid email.");
        s.setId(1L);
        s.setEnabled(enabled);
        s.setHost(host);
        s.setPort(port);
        s.setUsername(username);
        s.setSecurity(security);
        s.setFromAddress(fromAddress);
        s.setFromName(clip(str(req.get("fromName")), 120));
        String newPassword = req.get("password") == null ? null : String.valueOf(req.get("password"));
        if (newPassword != null && !newPassword.isEmpty()) s.setPasswordEncrypted(encrypt(newPassword.replace(" ", "")));
        if (enabled && !notBlank(decrypt(s.getPasswordEncrypted()))) throw new IllegalArgumentException("Enter the SMTP password (for Gmail, an app password).");
        s.setUpdatedBy(by);
        s.setUpdatedAt(Instant.now());
        repo.save(s);
        return view();
    }

    // ------------------------------------------------------------- encryption

    private SecretKeySpec key() throws Exception {
        byte[] k = MessageDigest.getInstance("SHA-256").digest(("mail-settings:" + secret).getBytes(StandardCharsets.UTF_8));
        return new SecretKeySpec(k, "AES");
    }

    String encrypt(String plain) {
        try {
            byte[] iv = new byte[12];
            new SecureRandom().nextBytes(iv);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key(), new GCMParameterSpec(128, iv));
            byte[] enc = c.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            byte[] out = new byte[iv.length + enc.length];
            System.arraycopy(iv, 0, out, 0, iv.length);
            System.arraycopy(enc, 0, out, iv.length, enc.length);
            return Base64.getEncoder().encodeToString(out);
        } catch (Exception e) {
            throw new IllegalStateException("Could not store the password securely", e);
        }
    }

    String decrypt(String stored) {
        if (!notBlank(stored)) return "";
        try {
            byte[] all = Base64.getDecoder().decode(stored);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, all, 0, 12));
            return new String(c.doFinal(all, 12, all.length - 12), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return ""; // secret changed or value corrupted: treat as not set
        }
    }

    private static int parsePort(String p) { try { return Integer.parseInt(p.trim()); } catch (Exception e) { return 587; } }
    private static String str(Object o) { return o == null ? "" : String.valueOf(o).trim(); }
    private static String nz(String s) { return s == null ? "" : s; }
    private static String clip(String s, int n) { return s.length() <= n ? s : s.substring(0, n); }
    static boolean notBlank(String s) { return s != null && !s.isBlank(); }
}
