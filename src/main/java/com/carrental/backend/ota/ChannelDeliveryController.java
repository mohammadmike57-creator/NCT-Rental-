package com.carrental.backend.ota;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** Staff endpoints (JWT required) for delivering rates and viewing the delivery log. */
@RestController
@RequestMapping("/api/channels/{channelId}")
@RequiredArgsConstructor
public class ChannelDeliveryController {

    private final ChannelStateReader channels;
    private final ChannelDeliveryService deliveries;

    /** Pushes the last published rate sheet to the partner's endpoint. */
    @PostMapping("/deliver")
    public ResponseEntity<?> deliver(@PathVariable String channelId, Authentication auth) {
        return channels.find(channelId)
            .<ResponseEntity<?>>map(ch -> ResponseEntity.ok(deliveries.pushRateSheet(ch, auth == null ? null : auth.getName())))
            .orElseGet(() -> ResponseEntity.status(404).body(Map.of("error", "Channel not found")));
    }

    @GetMapping("/deliveries")
    public ResponseEntity<List<ChannelDeliveryLog>> list(@PathVariable String channelId,
                                                         @RequestParam(defaultValue = "50") int limit) {
        return ResponseEntity.ok(deliveries.recent(channelId, limit));
    }
}
