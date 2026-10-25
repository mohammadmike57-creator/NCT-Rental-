package com.carrental.backend.audit;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Map;

/**
 * Staff activity log.
 *   POST /api/activity            record an action by the signed-in user (any staff member)
 *   POST /api/activity/batch      record several (up to 100) at once, e.g. screens opened and buttons pressed
 *   GET  /api/activity            search all activity          (VIEW_SYSTEM_ACTIVITY_LOG)
 *   GET  /api/activity/users      per-staff summary            (VIEW_SYSTEM_ACTIVITY_LOG)
 *   GET  /api/activity/mine       the signed-in user's own activity
 * Who and when are always taken from the session and server clock, never from the request.
 */
@RestController
@RequestMapping("/api/activity")
@RequiredArgsConstructor
public class ActivityController {

    static final String VIEW = "VIEW_SYSTEM_ACTIVITY_LOG";
    private final ActivityService service;
    private final com.carrental.backend.staff.PresenceService presence;

    @PostMapping
    public ResponseEntity<?> record(@RequestBody Map<String, String> body, Authentication auth) {
        if (auth == null) return ResponseEntity.status(401).build();
        service.record(auth.getName(), body.get("action"), body.get("category"), body.get("summary"), body.get("bookingId"), body.get("details"));
        presence.touch(auth.getName(), null);
        return ResponseEntity.accepted().body(Map.of("recorded", true));
    }

    @PostMapping("/batch")
    public ResponseEntity<?> recordBatch(@RequestBody java.util.List<Map<String, String>> body, Authentication auth) {
        if (auth == null) return ResponseEntity.status(401).build();
        int n = 0;
        for (Map<String, String> e : body == null ? java.util.List.<Map<String, String>>of() : body) {
            if (e == null || n >= 100) continue;
            service.record(auth.getName(), e.get("action"), e.get("category"), e.get("summary"), e.get("bookingId"), e.get("details"));
            n++;
        }
        presence.touch(auth.getName(), null);
        return ResponseEntity.accepted().body(Map.of("recorded", n));
    }

    @GetMapping
    public ResponseEntity<?> search(@RequestParam(required = false) String user, @RequestParam(required = false) String category,
                                    @RequestParam(required = false) String bookingId, @RequestParam(required = false) String q,
                                    @RequestParam(required = false) String from, @RequestParam(required = false) String to,
                                    @RequestParam(defaultValue = "300") int limit, Authentication auth) {
        if (!canView(auth)) return forbidden();
        return ResponseEntity.ok(service.search(user, category, bookingId, q, day(from, false), day(to, true), limit));
    }

    @GetMapping("/users")
    public ResponseEntity<?> users(@RequestParam(defaultValue = "30") int days, Authentication auth) {
        if (!canView(auth)) return forbidden();
        return ResponseEntity.ok(service.summary(days));
    }

    @GetMapping("/mine")
    public ResponseEntity<?> mine(@RequestParam(defaultValue = "100") int limit, Authentication auth) {
        if (auth == null) return ResponseEntity.status(401).build();
        return ResponseEntity.ok(service.search(auth.getName(), null, null, null, null, null, limit));
    }

    /** yyyy-MM-dd as the start of that day (or the start of the next day for an inclusive "to"). */
    private static Instant day(String s, boolean endExclusive) {
        if (s == null || s.isBlank()) return null;
        try {
            LocalDate d = LocalDate.parse(s.trim());
            return (endExclusive ? d.plusDays(1) : d).atStartOfDay().toInstant(ZoneOffset.UTC);
        } catch (Exception e) {
            return null;
        }
    }

    private static boolean canView(Authentication auth) {
        return auth != null && auth.getAuthorities().stream().anyMatch(a -> VIEW.equals(a.getAuthority()));
    }

    private static ResponseEntity<?> forbidden() {
        return ResponseEntity.status(403).body(Map.of("error", "You do not have permission to view the activity log."));
    }
}
