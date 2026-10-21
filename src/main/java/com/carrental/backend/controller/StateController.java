package com.carrental.backend.controller;

import com.carrental.backend.service.StateService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/state")
@RequiredArgsConstructor
public class StateController {

    private static final Logger logger = LoggerFactory.getLogger(StateController.class);

    private final StateService stateService;

    @GetMapping
    public ResponseEntity<String> getState() {
        return ResponseEntity.ok(stateService.getFullState());
    }

    @PostMapping
    public ResponseEntity<?> updateState(@RequestBody String updates) {
        logger.info("Received state update payload length: {}", updates.length());
        logger.debug("Payload: {}", updates);
        stateService.mergeState(updates);
        return ResponseEntity.ok().build();
    }

    /** Precise changes (one booking, one section) applied in order on the latest saved data. */
    @PostMapping("/patch")
    public ResponseEntity<?> patch(@RequestBody String patch) {
        stateService.applyPatch(patch);
        return ResponseEntity.ok().build();
    }

    /**
     * Administrator clean-up: clears the chosen sections (bookings, fleet, ...) after keeping a full
     * backup copy on the server. Company details, agreement terms, staff and settings are never touched.
     */
    @PostMapping("/clear")
    public ResponseEntity<?> clear(@RequestBody Map<String, List<String>> body, Authentication auth) {
        boolean admin = auth != null && auth.getAuthorities().stream().anyMatch(a -> "ACTION_ADMIN_MANAGE_USERS".equals(a.getAuthority()));
        if (!admin) return ResponseEntity.status(403).body(Map.of("error", "Only an administrator can clear data."));
        List<String> sections = body.getOrDefault("sections", List.of()).stream().filter(StateService.CLEARABLE::containsKey).toList();
        if (sections.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Choose what to clear."));
        String backupId = stateService.clearSections(sections, auth.getName());
        logger.warn("Data cleared by {}: {} (backup {})", auth.getName(), sections, backupId);
        return ResponseEntity.ok(Map.of("backupId", backupId, "cleared", sections));
    }
}
