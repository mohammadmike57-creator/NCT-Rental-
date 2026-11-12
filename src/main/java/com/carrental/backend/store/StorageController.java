package com.carrental.backend.store;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * Administrator checks of how the data is stored (see {@link DataStore}): the comparison between the document
 * and the tables, earlier versions of a booking, and recently deleted bookings (kept in the history).
 */
@RestController
@RequestMapping("/api/admin/storage")
public class StorageController {

    private final DataStore store;

    public StorageController(DataStore store) { this.store = store; }

    private static boolean isAdmin(Authentication auth) {
        return auth != null && auth.getAuthorities().stream().anyMatch(a -> "ACTION_ADMIN_MANAGE_USERS".equals(a.getAuthority()));
    }

    private static ResponseEntity<?> forbidden() {
        return ResponseEntity.status(403).body(Map.of("error", "Only an administrator can see this."));
    }

    @GetMapping("/check")
    public ResponseEntity<?> check(Authentication auth) {
        return isAdmin(auth) ? ResponseEntity.ok(store.check()) : forbidden();
    }

    @GetMapping("/history")
    public ResponseEntity<?> history(@RequestParam String bookingId, Authentication auth) {
        if (!isAdmin(auth)) return forbidden();
        return ResponseEntity.ok(rows(store.historyOf(bookingId)));
    }

    @GetMapping("/deleted")
    public ResponseEntity<?> deleted(Authentication auth) {
        return isAdmin(auth) ? ResponseEntity.ok(rows(store.recentlyDeleted())) : forbidden();
    }

    private static List<Map<String, Object>> rows(List<BookingHistory> list) {
        return list.stream().map(h -> Map.<String, Object>of(
            "bookingId", h.getBookingId() == null ? "" : h.getBookingId(),
            "action", h.getAction(),
            "changedAt", h.getChangedAt().toString(),
            "previous", h.getPrevious())).toList();
    }
}
