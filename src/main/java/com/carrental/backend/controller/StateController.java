package com.carrental.backend.controller;

import com.carrental.backend.service.StateService;
import com.carrental.backend.service.StateSectionGuard;
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
        return ResponseEntity.ok(stateService.getStateForClient());
    }

    @PostMapping
    public ResponseEntity<?> updateState(@RequestBody String updates, Authentication auth) {
        logger.info("Received state update payload length: {}", updates.length());
        logger.debug("Payload: {}", updates);
        return answer(stateService.mergeState(updates, writer(auth)));
    }

    /** Precise changes (one booking, one section) applied in order on the latest saved data. */
    @PostMapping("/patch")
    public ResponseEntity<?> patch(@RequestBody String patch, Authentication auth) {
        return answer(stateService.applyPatch(patch, writer(auth)));
    }

    /** The signed-in person and their permissions, for the section checks. */
    private static StateSectionGuard.Writer writer(Authentication auth) {
        if (auth == null) return StateSectionGuard.Writer.of(null, java.util.Set.of());
        return StateSectionGuard.Writer.of(auth.getName(), auth.getAuthorities().stream().map(a -> a.getAuthority()).toList());
    }

    /** 200 always (the allowed part is saved); lists sections that were not changed for lack of permission. */
    private static ResponseEntity<?> answer(java.util.List<String> skipped) {
        return skipped.isEmpty() ? ResponseEntity.ok().build() : ResponseEntity.ok(Map.of("skipped", skipped));
    }

    private static boolean isAdmin(Authentication auth) {
        return auth != null && auth.getAuthorities().stream().anyMatch(a -> "ACTION_ADMIN_MANAGE_USERS".equals(a.getAuthority()));
    }

    /** All the data as a file an administrator keeps on their own computer (passwords removed). */
    @GetMapping("/backup-file")
    public ResponseEntity<?> backupFile(Authentication auth) {
        if (!isAdmin(auth)) return ResponseEntity.status(403).body(Map.of("error", "Only an administrator can download a backup."));
        String name = "nct-backup-" + java.time.LocalDate.now(java.time.ZoneId.of("Asia/Amman")) + ".json";
        logger.warn("Data backup downloaded by {}", auth.getName());
        return ResponseEntity.ok()
                .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + name + "\"")
                .header(org.springframework.http.HttpHeaders.CACHE_CONTROL, "no-store")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .body(stateService.backupFileContent());
    }

    /** Backup copies of the data that an administrator can restore. */
    @GetMapping("/backups")
    public ResponseEntity<?> backups(Authentication auth) {
        if (!isAdmin(auth)) return ResponseEntity.status(403).body(Map.of("error", "Only an administrator can see backups."));
        return ResponseEntity.ok(stateService.listBackups());
    }

    /** Puts a backup copy back as the live data (the current data is kept as a backup first). */
    @PostMapping("/restore")
    public ResponseEntity<?> restore(@RequestBody Map<String, String> body, Authentication auth) {
        if (!isAdmin(auth)) return ResponseEntity.status(403).body(Map.of("error", "Only an administrator can restore a backup."));
        try {
            String safetyId = stateService.restoreBackup(body.get("id"));
            logger.warn("Backup {} restored by {} (previous data kept as {})", body.get("id"), auth.getName(), safetyId);
            return ResponseEntity.ok(Map.of("restored", body.get("id"), "previousDataBackup", safetyId));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
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
