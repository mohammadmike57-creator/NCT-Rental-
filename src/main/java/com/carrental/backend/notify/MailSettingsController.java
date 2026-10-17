package com.carrental.backend.notify;

import com.carrental.backend.audit.ActivityService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Outgoing email settings (ACTION_ADMIN_MANAGE_COMPANY_DETAILS).
 *   GET  /api/admin/mail-settings        current settings, never the password
 *   PUT  /api/admin/mail-settings        save
 *   POST /api/admin/mail-settings/test   send a test email {to}
 */
@RestController
@RequestMapping("/api/admin/mail-settings")
@RequiredArgsConstructor
public class MailSettingsController {

    static final String PERMISSION = "ACTION_ADMIN_MANAGE_COMPANY_DETAILS";

    private final MailSettingsService settings;
    private final CustomerEmailService email;
    private final ActivityService activity;

    @GetMapping
    public ResponseEntity<?> get(Authentication auth) {
        if (!allowed(auth)) return forbidden();
        return ResponseEntity.ok(settings.view());
    }

    @PutMapping
    public ResponseEntity<?> save(@RequestBody Map<String, Object> body, Authentication auth) {
        if (!allowed(auth)) return forbidden();
        try {
            Map<String, Object> view = settings.save(body, auth.getName());
            activity.record(auth.getName(), "EMAIL_SETTINGS_CHANGED", "settings",
                "Outgoing email " + (Boolean.TRUE.equals(view.get("enabled")) ? "enabled via " + view.get("host") : "disabled"), null, null);
            return ResponseEntity.ok(view);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/test")
    public ResponseEntity<?> test(@RequestBody Map<String, String> body, Authentication auth) {
        if (!allowed(auth)) return forbidden();
        String to = body.getOrDefault("to", "").trim();
        try {
            email.send(new CustomerEmailRequest(to, "Test email from your rental system",
                "Outgoing email works", "This is a test message sent from the rental system's email settings. Rental agreements, termination statements, claims and invoices will be sent to customers the same way.",
                List.of(List.of("Sent by", auth.getName())), "No action is needed.", null, null, null, null, null, null,
                "TEST", "success", null, null));
            activity.record(auth.getName(), "EMAIL_TEST_SENT", "email", "Test email sent to " + to, null, null);
            return ResponseEntity.ok(Map.of("sent", true));
        } catch (CustomerEmailService.EmailException e) {
            return ResponseEntity.status(e.status()).body(Map.of("sent", false, "error", e.getMessage()));
        }
    }

    private static boolean allowed(Authentication auth) {
        return auth != null && auth.getAuthorities().stream().anyMatch(a -> PERMISSION.equals(a.getAuthority()));
    }

    private static ResponseEntity<?> forbidden() {
        return ResponseEntity.status(403).body(Map.of("error", "You do not have permission to change email settings."));
    }
}
