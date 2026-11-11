package com.carrental.backend.ota;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * POST /oauth/token — OAuth 2.0 client credentials grant (RFC 6749 section 4.4) for the REST/JSON v3 API.
 * Client authentication by HTTP Basic (preferred) or client_id + client_secret form fields. Failed attempts count
 * towards the same per-address lockout as wrong API keys.
 */
@RestController
public class OAuthTokenController {

    private final OAuthService oauth;
    private final ChannelSecurityGuard guard;

    public OAuthTokenController(OAuthService oauth, ChannelSecurityGuard guard) {
        this.oauth = oauth;
        this.guard = guard;
    }

    @PostMapping(value = "/oauth/token", consumes = {MediaType.APPLICATION_FORM_URLENCODED_VALUE, MediaType.ALL_VALUE})
    public ResponseEntity<Map<String, Object>> token(@RequestParam MultiValueMap<String, String> form, HttpServletRequest http) {
        String remote = ChannelGateway.clientIp(http);
        if (guard.lockedUntil(remote) != null) return fail(HttpStatus.TOO_MANY_REQUESTS, "slow_down", "Too many failed attempts from this address; try again later");
        if (!"client_credentials".equals(form.getFirst("grant_type"))) return fail(HttpStatus.BAD_REQUEST, "unsupported_grant_type", "Only client_credentials is supported");
        String id = form.getFirst("client_id"), secret = form.getFirst("client_secret");
        String basic = http.getHeader("Authorization");
        if (basic != null && basic.regionMatches(true, 0, "Basic ", 0, 6)) {
            try {
                String pair = new String(Base64.getDecoder().decode(basic.substring(6).trim()), StandardCharsets.UTF_8);
                int i = pair.indexOf(':');
                if (i > 0) { id = pair.substring(0, i); secret = pair.substring(i + 1); }
            } catch (IllegalArgumentException ignored) { /* treated as missing credentials */ }
        }
        Optional<OAuthClient> client = oauth.authenticate(id, secret);
        if (client.isEmpty()) {
            guard.failed(remote);
            return fail(HttpStatus.UNAUTHORIZED, "invalid_client", "Unknown client or wrong secret");
        }
        guard.succeeded(remote);
        OAuthService.Issued t = oauth.issue(client.get(), form.getFirst("scope"));
        if (t == null) return fail(HttpStatus.BAD_REQUEST, "invalid_scope", "A requested scope is not granted to this client");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("access_token", t.token());
        body.put("token_type", "Bearer");
        body.put("expires_in", t.expiresIn());
        body.put("scope", t.scope());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Pragma", "no-cache").body(body);
    }

    private static ResponseEntity<Map<String, Object>> fail(HttpStatus status, String code, String description) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", code);
        body.put("error_description", description);
        body.put("timestamp", Instant.now().toString());
        var rs = ResponseEntity.status(status).cacheControl(CacheControl.noStore());
        if (status == HttpStatus.UNAUTHORIZED) rs = rs.header("WWW-Authenticate", "Basic realm=\"urdrive\"");
        return rs.body(body);
    }
}
