package com.carrental.backend.ota;

import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

/**
 * Encrypts secrets that must be read back (webhook signing secrets) with AES-256-GCM. The key is derived from the
 * server secret held outside the database, so a copy of the database alone does not reveal them.
 */
@Component
public class SecretBox {
    private static final String PREFIX = "v1:";
    private final SecretKeySpec key;
    /** The current key first, then keys of JWT_SECRET_PREVIOUS: old secrets stay readable after a secret change. */
    private final java.util.List<SecretKeySpec> keys;
    private final SecureRandom random = new SecureRandom();

    public SecretBox(com.carrental.backend.config.ServerSecret serverSecret) {
        this.keys = serverSecret.all().stream()
            .map(s -> new SecretKeySpec(OAuthService.sha256(("urdrive-secret-box-v1:" + s).getBytes(StandardCharsets.UTF_8)), "AES")).toList();
        this.key = keys.get(0);
    }

    public String seal(String plain) {
        try {
            byte[] iv = new byte[12];
            random.nextBytes(iv);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, iv));
            byte[] enc = c.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            byte[] out = Arrays.copyOf(iv, iv.length + enc.length);
            System.arraycopy(enc, 0, out, iv.length, enc.length);
            return PREFIX + Base64.getEncoder().encodeToString(out);
        } catch (Exception e) {
            throw new IllegalStateException("Could not encrypt the secret", e);
        }
    }

    public String open(String sealed) {
        if (sealed == null || !sealed.startsWith(PREFIX)) throw new IllegalStateException("Unknown secret format");
        byte[] all;
        try { all = Base64.getDecoder().decode(sealed.substring(PREFIX.length())); }
        catch (IllegalArgumentException e) { throw new IllegalStateException("Could not decrypt the secret", e); }
        Exception last = null;
        for (SecretKeySpec k : keys) {
            try {
                Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
                c.init(Cipher.DECRYPT_MODE, k, new GCMParameterSpec(128, all, 0, 12));
                return new String(c.doFinal(all, 12, all.length - 12), StandardCharsets.UTF_8);
            } catch (Exception e) {
                last = e;   // sealed with another server secret: try the next one
            }
        }
        throw new IllegalStateException("Could not decrypt the secret", last);
    }
}
