package com.carrental.backend.notify;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** Staff-only (JWT): send a branded email to a customer, e.g. the signed rental agreement. */
@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class CustomerEmailController {

    private final CustomerEmailService service;

    @GetMapping("/email-status")
    public Map<String, Object> status() {
        return Map.of("configured", service.isConfigured());
    }

    @PostMapping("/customer-email")
    public ResponseEntity<?> send(@RequestBody CustomerEmailRequest req) {
        try {
            service.send(req);
            return ResponseEntity.ok(Map.of("sent", true));
        } catch (CustomerEmailService.EmailException e) {
            return ResponseEntity.status(e.status()).body(Map.of("sent", false, "error", e.getMessage()));
        }
    }
}
