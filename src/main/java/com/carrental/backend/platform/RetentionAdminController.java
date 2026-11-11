package com.carrental.backend.platform;

import com.carrental.backend.ota.ChannelRetentionService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** Staff view of how long the XML gateway keeps its records, and a manual clean-up. */
@RestController
public class RetentionAdminController {

    private final ChannelRetentionService retention;

    public RetentionAdminController(ChannelRetentionService retention) { this.retention = retention; }

    @GetMapping("/api/channel-platform/retention")
    public ResponseEntity<?> policy(Authentication auth) {
        if (!allowed(auth)) return ResponseEntity.status(403).body(Map.of("error", "You need Channel Manager access for this."));
        return ResponseEntity.ok(retention.policy());
    }

    @PostMapping("/api/channel-platform/retention/run")
    public ResponseEntity<?> run(Authentication auth) {
        if (!allowed(auth)) return ResponseEntity.status(403).body(Map.of("error", "You need Channel Manager access for this."));
        return ResponseEntity.ok(retention.run());
    }

    private static boolean allowed(Authentication auth) {
        return auth != null && auth.getAuthorities().stream().anyMatch(a -> "VIEW_AGGREGATOR_SETUP".equals(a.getAuthority()));
    }
}
