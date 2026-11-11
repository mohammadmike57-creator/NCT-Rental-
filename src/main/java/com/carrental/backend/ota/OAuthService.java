package com.carrental.backend.ota;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;

/**
 * OAuth 2.0 client credentials for the REST/JSON v3 API. Access tokens are JWTs valid 30 minutes, signed with a
 * key of their own (derived from the server secret with a different purpose), so a broker token can never pass
 * as a staff login and a staff token can never call the broker API.
 */
@Service
public class OAuthService {

    public static final List<String> SCOPES = List.of("locations:read", "fleet:read", "availability:read", "quotes:read",
        "reservations:read", "reservations:write", "inventory:read", "webhooks:manage");
    public static final String AUDIENCE = "urdrive-api";
    public static final String ISSUER = "urdrive";
    public static final long TOKEN_SECONDS = 30 * 60;

    /** Who called: the channel, its environment and the scopes in the token. */
    public record Principal(String clientId, String channelId, boolean sandbox, Set<String> scopes) {}
    public record Issued(String token, long expiresIn, String scope) {}
    public record Created(OAuthClient client, String secret) {}

    private static final SecureRandom RANDOM = new SecureRandom();
    private final OAuthClientRepository clients;
    private final SecretKey key;
    private final List<SecretKey> keys;

    public OAuthService(OAuthClientRepository clients, com.carrental.backend.config.ServerSecret serverSecret) {
        this.clients = clients;
        this.keys = serverSecret.all().stream()
            .map(s -> Keys.hmacShaKeyFor(sha256(("urdrive-oauth-access-token-v1:" + s).getBytes(StandardCharsets.UTF_8)))).toList();
        this.key = keys.get(0);
    }

    public Created create(String channelId, String environment, Collection<String> scopes, String name, String by) {
        String env = "production".equalsIgnoreCase(environment) ? "production" : "sandbox";
        List<String> granted = scopes == null || scopes.isEmpty() ? SCOPES : scopes.stream().filter(SCOPES::contains).distinct().toList();
        if (granted.isEmpty()) throw new IllegalArgumentException("No valid scopes");
        OAuthClient c = new OAuthClient();
        c.setClientId("urd_" + (env.equals("sandbox") ? "test" : "live") + "_" + random(12));
        String secret = random(32);
        c.setSecretHash(hex(sha256(secret.getBytes(StandardCharsets.UTF_8))));
        c.setSecretHint(secret.substring(secret.length() - 4));
        c.setChannelId(channelId);
        c.setEnvironment(env);
        c.setScopes(String.join(" ", granted));
        c.setName(name == null || name.isBlank() ? null : name.trim().substring(0, Math.min(120, name.trim().length())));
        c.setCreatedBy(by);
        return new Created(clients.save(c), secret);
    }

    /** The active client for these credentials, or empty (comparison in constant time). */
    public Optional<OAuthClient> authenticate(String clientId, String secret) {
        if (clientId == null || secret == null || clientId.isBlank() || secret.isBlank()) return Optional.empty();
        Optional<OAuthClient> c = clients.findByClientId(clientId.trim()).filter(x -> "ACTIVE".equals(x.getStatus()));
        byte[] presented = hex(sha256(secret.trim().getBytes(StandardCharsets.UTF_8))).getBytes(StandardCharsets.US_ASCII);
        byte[] stored = c.map(x -> x.getSecretHash().getBytes(StandardCharsets.US_ASCII)).orElse(new byte[64]);
        return MessageDigest.isEqual(stored, presented) ? c : Optional.empty();
    }

    /** A token for the requested scopes that the client holds (all of them when none are asked for); null if any is not granted. */
    public Issued issue(OAuthClient c, String requestedScope) {
        Set<String> granted = new LinkedHashSet<>(Arrays.asList(c.getScopes().split(" ")));
        Set<String> want = requestedScope == null || requestedScope.isBlank() ? granted : new LinkedHashSet<>(Arrays.asList(requestedScope.trim().split("\\s+")));
        if (!granted.containsAll(want)) return null;
        Instant now = Instant.now();
        String scope = String.join(" ", want);
        String token = Jwts.builder().setIssuer(ISSUER).setAudience(AUDIENCE).setSubject(c.getClientId())
            .claim("ch", c.getChannelId()).claim("env", c.getEnvironment()).claim("scope", scope)
            .setIssuedAt(Date.from(now)).setExpiration(Date.from(now.plusSeconds(TOKEN_SECONDS))).setId(UUID.randomUUID().toString())
            .signWith(key).compact();
        c.setLastUsedAt(now);
        clients.save(c);
        return new Issued(token, TOKEN_SECONDS, scope);
    }

    /** The principal of a valid, unexpired v3 access token whose client is still active; empty otherwise. */
    public Optional<Principal> verify(String token) {
        if (token == null || token.isBlank()) return Optional.empty();
        try {
            Claims cl = null;
            for (SecretKey k : keys) {   // current secret first, then JWT_SECRET_PREVIOUS
                try {
                    cl = Jwts.parserBuilder().setSigningKey(k).requireIssuer(ISSUER).requireAudience(AUDIENCE).build().parseClaimsJws(token).getBody();
                    break;
                } catch (io.jsonwebtoken.security.SignatureException e) { /* try the next secret */ }
            }
            if (cl == null) return Optional.empty();
            String clientId = cl.getSubject();
            Optional<OAuthClient> c = clients.findByClientId(clientId).filter(x -> "ACTIVE".equals(x.getStatus()));
            if (c.isEmpty() || !c.get().getChannelId().equals(cl.get("ch", String.class))) return Optional.empty();
            Set<String> scopes = new LinkedHashSet<>(Arrays.asList(String.valueOf(cl.get("scope")).split(" ")));
            return Optional.of(new Principal(clientId, c.get().getChannelId(), !"production".equals(cl.get("env", String.class)), scopes));
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    public List<OAuthClient> list(String channelId) { return clients.findByChannelIdOrderByCreatedAtDesc(channelId); }

    public boolean revoke(String channelId, String clientId) {
        Optional<OAuthClient> c = clients.findByClientId(clientId).filter(x -> x.getChannelId().equals(channelId));
        if (c.isEmpty()) return false;
        c.get().setStatus("REVOKED");
        c.get().setRevokedAt(Instant.now());
        clients.save(c.get());
        return true;
    }

    private static String random(int bytes) {
        byte[] b = new byte[bytes];
        RANDOM.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    static byte[] sha256(byte[] in) {
        try { return MessageDigest.getInstance("SHA-256").digest(in); } catch (Exception e) { throw new IllegalStateException(e); }
    }

    static String hex(byte[] b) { return HexFormat.of().formatHex(b); }
}
