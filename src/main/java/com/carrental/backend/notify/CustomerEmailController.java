package com.carrental.backend.notify;

import com.carrental.backend.audit.ActivityService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** Staff-only (JWT): send a branded email to a customer, e.g. the signed rental agreement. */
@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class CustomerEmailController {

    private final CustomerEmailService service;
    private final ActivityService activity;

    @GetMapping("/email-status")
    public Map<String, Object> status() {
        return Map.of("configured", service.isConfigured());
    }

    @PostMapping("/customer-email")
    public ResponseEntity<?> send(@RequestBody CustomerEmailRequest req, Authentication auth) {
        String who = auth == null ? null : auth.getName();
        String files = req.attachments() == null ? "" : req.attachments().stream().map(CustomerEmailRequest.Attachment::fileName).reduce((a, b) -> a + ", " + b).orElse("");
        try {
            service.send(req);
            activity.record(who, "EMAIL_SENT", "email", "Emailed \"" + req.subject() + "\" to " + req.to(), bookingRef(req), files.isEmpty() ? null : "Attachments: " + files);
            return ResponseEntity.ok(Map.of("sent", true));
        } catch (CustomerEmailService.EmailException e) {
            activity.record(who, "EMAIL_FAILED", "email", "Could not email \"" + req.subject() + "\" to " + req.to() + ": " + e.getMessage(), bookingRef(req), null);
            return ResponseEntity.status(e.status()).body(Map.of("sent", false, "error", e.getMessage()));
        }
    }

    /** The booking reference, when the email summary carries one. */
    private static String bookingRef(CustomerEmailRequest req) {
        if (req.rows() == null) return null;
        return req.rows().stream().filter(r -> r != null && r.size() >= 2 && r.get(0) != null && java.util.Set.of("booking", "booking reference").contains(r.get(0).trim().toLowerCase())).map(r -> r.get(1)).findFirst().orElse(null);
    }
}
