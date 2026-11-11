package com.carrental.backend.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;

/**
 * The server secret (JWT_SECRET): signs staff logins and broker access tokens, and is the root of the keys that
 * encrypt stored secrets (email password, webhook and connector secrets).
 *
 * <ul>
 *   <li>There is no default: the server does not start without JWT_SECRET, and says why.</li>
 *   <li>Changing it safely: put the old value in JWT_SECRET_PREVIOUS. Logins and stored secrets made with the old value
 *       keep working (they are read with either value); everything new uses the new value.</li>
 *   <li>A value that was once published in the source code is reported at start-up as a security warning.</li>
 * </ul>
 */
@Component
public class ServerSecret {

    private static final Logger log = LoggerFactory.getLogger(ServerSecret.class);
    public static final int MIN_LENGTH = 32;
    /**
     * Which JWT settings reached the server, to find set-up mistakes on the hosting platform: names, lengths and stray
     * spaces only, never the values.
     */
    static String envReport() {
        StringBuilder b = new StringBuilder();
        for (String name : new String[] {"JWT_SECRET", "JWT_SECRET_PREVIOUS"}) {
            String v = System.getenv(name);
            if (b.length() > 0) b.append("; ");
            b.append(name).append(v == null ? " missing" : " present, length " + v.length() + (v.equals(v.trim()) ? "" : ", with spaces around it"));
        }
        List<String> similar = new ArrayList<>();
        for (String k : System.getenv().keySet()) {
            if (k.toUpperCase(java.util.Locale.ROOT).contains("JWT") && !k.equals("JWT_SECRET") && !k.equals("JWT_SECRET_PREVIOUS")) similar.add("\"" + k + "\"");
        }
        if (!similar.isEmpty()) b.append("; similar names: ").append(String.join(", ", similar));
        return b.toString();
    }

    /** SHA-256 of values that were written in the source code in the past (the values themselves are not kept). */
    private static final Set<String> PUBLISHED = Set.of(
        "3a6f8e5c67c49776f56f1df748ff73e621816a82bd3e83ee7f053bfab4a9ecbb",
        "c22075453c0aef36d8e4a15b5986712244ca61cfc5ad7522f14a63a976de3cc4");

    private final String current;
    private final List<String> previous;
    private final boolean published;

    public ServerSecret(@Value("${jwt.secret:}") String current, @Value("${jwt.secret.previous:}") String previous) {
        String c = current == null ? "" : current.trim();
        if (c.isEmpty()) {
            throw new IllegalStateException("JWT_SECRET is not set. Add it to the server's environment variables "
                + "(a random value of at least " + MIN_LENGTH + " characters) and start the server again. "
                + "What the server received: " + envReport() + ".");
        }
        if (c.length() < MIN_LENGTH) {
            throw new IllegalStateException("JWT_SECRET is too short: use a random value of at least " + MIN_LENGTH + " characters.");
        }
        List<String> prev = new ArrayList<>();
        if (previous != null) for (String p : previous.split(",")) if (!p.trim().isEmpty() && !p.trim().equals(c)) prev.add(p.trim());
        this.current = c;
        this.previous = Collections.unmodifiableList(prev);
        this.published = PUBLISHED.contains(sha256Hex(c));
        if (published) {
            log.warn("SECURITY: JWT_SECRET is a value that was once written in the source code. Set a new random JWT_SECRET "
                + "and put the current one in JWT_SECRET_PREVIOUS so nobody is logged out and stored secrets stay readable.");
        }
        if (!prev.isEmpty()) log.info("JWT_SECRET_PREVIOUS is set: {} older secret(s) are still accepted for reading.", prev.size());
    }

    /** The value used for everything new. */
    public String current() { return current; }

    /** The current value first, then the older ones that may still be read. */
    public List<String> all() {
        List<String> out = new ArrayList<>(1 + previous.size());
        out.add(current);
        out.addAll(previous);
        return out;
    }

    /** True when the current value is one that was published in the source code. */
    public boolean isPublishedValue() { return published; }

    static String sha256Hex(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
