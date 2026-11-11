package com.carrental.backend.ota;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/** Staff: OAuth clients of a channel for the REST/JSON v3 API. The secret is in the create response only, once. */
@RestController
@RequestMapping("/api/channels/{channelId}/oauth-clients")
public class OAuthClientAdminController {

    private final OAuthService oauth;
    private final ChannelStateReader channels;
    private final com.carrental.backend.audit.ActivityService activity;

    public OAuthClientAdminController(OAuthService oauth, ChannelStateReader channels, com.carrental.backend.audit.ActivityService activity) {
        this.oauth = oauth;
        this.channels = channels;
        this.activity = activity;
    }

    @GetMapping
    public ResponseEntity<?> list(@PathVariable String channelId, Authentication auth) {
        if (!allowed(auth)) return forbidden();
        List<Map<String, Object>> out = new ArrayList<>();
        for (OAuthClient c : oauth.list(channelId)) out.add(view(c));
        return ResponseEntity.ok(Map.of("clients", out, "scopes", OAuthService.SCOPES));
    }

    @PostMapping
    public ResponseEntity<?> create(@PathVariable String channelId, @RequestBody(required = false) Map<String, Object> body, Authentication auth) {
        if (!allowed(auth)) return forbidden();
        if (channels.all().stream().noneMatch(ch -> ch.id().equals(channelId))) return ResponseEntity.status(404).body(Map.of("error", "Unknown channel"));
        Map<String, Object> b = body == null ? Map.of() : body;
        List<String> scopes = new ArrayList<>();
        if (b.get("scopes") instanceof Collection<?> list) for (Object o : list) scopes.add(String.valueOf(o));
        try {
            OAuthService.Created made = oauth.create(channelId, String.valueOf(b.getOrDefault("environment", "sandbox")), scopes,
                b.get("name") == null ? null : String.valueOf(b.get("name")), auth.getName());
            activity.record(auth.getName(), "CREATE", "channel", "Created OAuth client " + made.client().getClientId() + " ("
                + made.client().getEnvironment() + ") for channel " + channelId, null, null);
            Map<String, Object> out = view(made.client());
            out.put("clientSecret", made.secret());
            return ResponseEntity.ok(out);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{clientId}")
    public ResponseEntity<?> revoke(@PathVariable String channelId, @PathVariable String clientId, Authentication auth) {
        if (!allowed(auth)) return forbidden();
        if (!oauth.revoke(channelId, clientId)) return ResponseEntity.status(404).body(Map.of("error", "No such client on this channel"));
        activity.record(auth.getName(), "DELETE", "channel", "Revoked OAuth client " + clientId + " of channel " + channelId, null, null);
        return ResponseEntity.ok(Map.of("revoked", clientId));
    }

    private static Map<String, Object> view(OAuthClient c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("clientId", c.getClientId());
        m.put("name", c.getName());
        m.put("environment", c.getEnvironment());
        m.put("scopes", Arrays.asList(c.getScopes().split(" ")));
        m.put("status", c.getStatus());
        m.put("secretHint", c.getSecretHint());
        m.put("createdAt", c.getCreatedAt());
        m.put("createdBy", c.getCreatedBy());
        m.put("lastUsedAt", c.getLastUsedAt());
        m.put("revokedAt", c.getRevokedAt());
        return m;
    }

    private static boolean allowed(Authentication auth) {
        return auth != null && auth.getAuthorities().stream().anyMatch(a -> ChannelGatewayAdminController.PERMISSION.equals(a.getAuthority()));
    }

    private static ResponseEntity<?> forbidden() {
        return ResponseEntity.status(403).body(Map.of("error", "You need Channel Manager access for this."));
    }
}
