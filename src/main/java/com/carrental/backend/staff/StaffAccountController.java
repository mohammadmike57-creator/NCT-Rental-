package com.carrental.backend.staff;

import com.carrental.backend.model.User;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Staff login accounts.
 *   GET    /api/account/me                    current user (fresh permissions)
 *   GET    /api/admin/users                   list accounts            (ACTION_ADMIN_MANAGE_USERS)
 *   POST   /api/admin/users                   create account           (ACTION_ADMIN_MANAGE_USERS)
 *   PUT    /api/admin/users/{id}              update profile/access    (ACTION_ADMIN_MANAGE_USERS)
 *   POST   /api/admin/users/{id}/password     set a new password       (ACTION_ADMIN_MANAGE_USERS)
 *   DELETE /api/admin/users/{id}              delete account           (ACTION_ADMIN_MANAGE_USERS)
 * Password hashes are never returned (User.password is write-only).
 */
@RestController
@RequiredArgsConstructor
public class StaffAccountController {

    static final String MANAGE_USERS = "ACTION_ADMIN_MANAGE_USERS";

    private final StaffAccountService service;

    @GetMapping("/api/account/me")
    public ResponseEntity<?> me(Authentication auth) {
        if (auth == null) return ResponseEntity.status(401).build();
        return service.findByEmail(auth.getName())
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(404).body(Map.of("error", "Account not found")));
    }

    @GetMapping("/api/admin/users")
    public ResponseEntity<?> list(Authentication auth) {
        if (!canManage(auth)) return forbidden();
        return ResponseEntity.ok(service.list());
    }

    @PostMapping("/api/admin/users")
    public ResponseEntity<?> create(@RequestBody StaffAccountRequest req, Authentication auth) {
        if (!canManage(auth)) return forbidden();
        return run(() -> ResponseEntity.status(201).body(service.create(req)));
    }

    @PutMapping("/api/admin/users/{id}")
    public ResponseEntity<?> update(@PathVariable String id, @RequestBody StaffAccountRequest req, Authentication auth) {
        if (!canManage(auth)) return forbidden();
        return run(() -> ResponseEntity.ok(service.update(id, req, auth.getName())));
    }

    @PostMapping("/api/admin/users/{id}/password")
    public ResponseEntity<?> resetPassword(@PathVariable String id, @RequestBody Map<String, String> body, Authentication auth) {
        if (!canManage(auth)) return forbidden();
        return run(() -> {
            User u = service.resetPassword(id, body.get("password"));
            return ResponseEntity.ok(Map.of("id", u.getId(), "passwordLastChanged", String.valueOf(u.getPasswordLastChanged())));
        });
    }

    @DeleteMapping("/api/admin/users/{id}")
    public ResponseEntity<?> delete(@PathVariable String id, Authentication auth) {
        if (!canManage(auth)) return forbidden();
        return run(() -> {
            service.delete(id, auth.getName());
            return ResponseEntity.noContent().build();
        });
    }

    private static boolean canManage(Authentication auth) {
        return auth != null && auth.getAuthorities().stream().anyMatch(a -> MANAGE_USERS.equals(a.getAuthority()));
    }

    private static ResponseEntity<?> forbidden() {
        return ResponseEntity.status(403).body(Map.of("error", "You do not have permission to manage staff accounts."));
    }

    private interface Action { ResponseEntity<?> get(); }

    private static ResponseEntity<?> run(Action a) {
        try {
            return a.get();
        } catch (StaffAccountService.StaffAccountException e) {
            return ResponseEntity.status(e.status()).body(Map.of("error", e.getMessage()));
        }
    }
}
