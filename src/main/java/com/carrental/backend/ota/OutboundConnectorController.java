package com.carrental.backend.ota;

import com.carrental.backend.ota.ChannelError.ChannelException;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** Staff management of a channel's outbound connectors. Secrets can be set or replaced, never read. */
@RestController
@RequestMapping("/api/channels/{channelId}/connectors")
public class OutboundConnectorController {

    private final OutboundConnectorService service;
    private final ChannelStateReader channels;
    private final com.carrental.backend.audit.ActivityService activity;

    public OutboundConnectorController(OutboundConnectorService service, ChannelStateReader channels, com.carrental.backend.audit.ActivityService activity) {
        this.service = service;
        this.channels = channels;
        this.activity = activity;
    }

    @GetMapping
    public ResponseEntity<?> list(@PathVariable String channelId, Authentication auth) {
        if (!allowed(auth)) return forbidden();
        return ResponseEntity.ok(Map.of("connectors", service.list(channelId).stream().map(service::view).toList()));
    }

    @PostMapping
    public ResponseEntity<?> create(@PathVariable String channelId, @RequestBody JsonNode body, Authentication auth) {
        if (!allowed(auth)) return forbidden();
        if (channels.find(channelId).isEmpty()) return ResponseEntity.status(404).body(Map.of("error", "Channel not found"));
        try {
            OutboundConnector c = service.save(channelId, null, body, auth.getName());
            log(auth, "create", c);
            return ResponseEntity.ok(service.view(c));
        } catch (ChannelException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PatchMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable String channelId, @PathVariable String id, @RequestBody JsonNode body, Authentication auth) {
        if (!allowed(auth)) return forbidden();
        return service.find(channelId, id).<ResponseEntity<?>>map(c -> {
            try {
                OutboundConnector saved = service.save(channelId, c, body, auth.getName());
                log(auth, "update", saved);
                return ResponseEntity.ok(service.view(saved));
            } catch (ChannelException e) {
                return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
            }
        }).orElseGet(() -> ResponseEntity.status(404).body(Map.of("error", "No such connector")));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable String channelId, @PathVariable String id, Authentication auth) {
        if (!allowed(auth)) return forbidden();
        return service.find(channelId, id).<ResponseEntity<?>>map(c -> {
            service.delete(c);
            log(auth, "delete", c);
            return ResponseEntity.ok(Map.of("deleted", id));
        }).orElseGet(() -> ResponseEntity.status(404).body(Map.of("error", "No such connector")));
    }

    @PostMapping("/{id}/test")
    public ResponseEntity<?> test(@PathVariable String channelId, @PathVariable String id, Authentication auth) {
        if (!allowed(auth)) return forbidden();
        return service.find(channelId, id).<ResponseEntity<?>>map(c -> {
            try { return ResponseEntity.ok(service.test(c)); }
            catch (ChannelException e) { return ResponseEntity.badRequest().body(Map.of("error", e.getMessage())); }
        }).orElseGet(() -> ResponseEntity.status(404).body(Map.of("error", "No such connector")));
    }

    @GetMapping("/{id}/sends")
    public ResponseEntity<?> sends(@PathVariable String channelId, @PathVariable String id, @RequestParam(defaultValue = "30") int limit, Authentication auth) {
        if (!allowed(auth)) return forbidden();
        return service.find(channelId, id).<ResponseEntity<?>>map(c -> ResponseEntity.ok(Map.of("sends", service.recentSends(c, limit))))
            .orElseGet(() -> ResponseEntity.status(404).body(Map.of("error", "No such connector")));
    }

    private void log(Authentication auth, String action, OutboundConnector c) {
        try { activity.record(auth.getName(), action.toUpperCase(java.util.Locale.ROOT), "channel", "Outbound connector " + (action.endsWith("e") ? action + "d" : action + "ed") + ": " + c.getName() + " (" + c.getType() + ") → " + c.getUrl() + ", channel " + c.getChannelId(), null, null); }
        catch (Exception ignored) { }
    }

    private static boolean allowed(Authentication auth) {
        return auth != null && auth.getAuthorities().stream().anyMatch(a -> "VIEW_AGGREGATOR_SETUP".equals(a.getAuthority()));
    }

    private static ResponseEntity<?> forbidden() { return ResponseEntity.status(403).body(Map.of("error", "You need Channel Manager access for this.")); }

    @SuppressWarnings("unused") private static final List<String> TYPES = List.of("RATE_FILE", "ARI_PUSH", "RES_NOTIFY");
}
