package com.carrental.backend.tenant;

import com.carrental.backend.staff.StaffAccountService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * The set-password page (/set-password?token=…), no sign-in needed:
 *   GET  /auth/password-setup?token=…        who the link is for (404 when used, expired or unknown)
 *   POST /auth/password-setup {token, password}
 */
@RestController
public class PasswordSetupController {

    private final PasswordSetupService setup;

    public PasswordSetupController(PasswordSetupService setup) { this.setup = setup; }

    @GetMapping("/auth/password-setup")
    public ResponseEntity<?> check(@RequestParam String token) {
        return setup.describe(token).<ResponseEntity<?>>map(ResponseEntity::ok)
            .orElseGet(() -> ResponseEntity.status(404).body(Map.of("error", "This link has expired or was already used. Ask your administrator for a new one.")));
    }

    @PostMapping("/auth/password-setup")
    public ResponseEntity<?> set(@RequestBody Map<String, String> body) {
        String password = body.getOrDefault("password", "");
        String problem = StaffAccountService.passwordProblem(password);
        if (problem != null) return ResponseEntity.badRequest().body(Map.of("error", problem));
        return setup.use(body.get("token"), password).<ResponseEntity<?>>map(email -> ResponseEntity.ok(Map.of("email", email)))
            .orElseGet(() -> ResponseEntity.status(404).body(Map.of("error", "This link has expired or was already used. Ask your administrator for a new one.")));
    }
}
