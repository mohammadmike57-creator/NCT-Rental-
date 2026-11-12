package com.carrental.backend.security;

import com.carrental.backend.audit.ActivityService;
import com.carrental.backend.model.User;
import com.carrental.backend.repository.UserRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Each person turns two-step sign-in on or off for themselves (Profile → Two-step sign-in). An administrator can
 * turn it off for someone who lost their phone and their backup codes; they set it up again themselves.
 */
@RestController
@RequestMapping("/api/two-step")
public class TwoStepController {

    private final TwoStepService twoStep;
    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final ActivityService activity;

    public TwoStepController(TwoStepService twoStep, UserRepository users, PasswordEncoder passwords, ActivityService activity) {
        this.twoStep = twoStep;
        this.users = users;
        this.passwords = passwords;
        this.activity = activity;
    }

    private User me(Authentication auth) {
        return auth == null ? null : users.findByEmail(auth.getName()).orElse(null);
    }

    private static ResponseEntity<?> error(int status, String message) {
        return ResponseEntity.status(status).body(Map.of("error", message));
    }

    @GetMapping("/status")
    public ResponseEntity<?> status(Authentication auth) {
        User u = me(auth);
        if (u == null) return error(401, "Please sign in again.");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("on", twoStep.isOn(u));
        body.put("backupCodesLeft", twoStep.backupCodesLeft(u));
        return ResponseEntity.ok(body);
    }

    @PostMapping("/setup")
    public ResponseEntity<?> setup(Authentication auth) {
        User u = me(auth);
        if (u == null) return error(401, "Please sign in again.");
        if (twoStep.isOn(u)) return error(409, "Two-step sign-in is already on.");
        TwoStepService.Setup s = twoStep.start(u);
        return ResponseEntity.ok(Map.of("secret", s.secret(), "otpauthUri", s.otpauthUri(), "qrSvg", s.qrSvg()));
    }

    @PostMapping("/confirm")
    public ResponseEntity<?> confirm(@RequestBody Map<String, String> body, Authentication auth) {
        User u = me(auth);
        if (u == null) return error(401, "Please sign in again.");
        return twoStep.confirm(u, body.get("code"))
            .<ResponseEntity<?>>map(codes -> {
                activity.record(u.getEmail(), "TWO_STEP_ON", "auth", "Turned on two-step sign-in", null, null);
                return ResponseEntity.ok(Map.of("backupCodes", codes));
            })
            .orElseGet(() -> error(400, "That code is not right. Check the time on your phone and try the newest code."));
    }

    @PostMapping("/off")
    public ResponseEntity<?> off(@RequestBody Map<String, String> body, Authentication auth) {
        User u = me(auth);
        if (u == null) return error(401, "Please sign in again.");
        if (!twoStep.isOn(u)) return ResponseEntity.ok(Map.of("on", false));
        String password = body.get("password");
        if (password == null || u.getPassword() == null || !passwords.matches(password, u.getPassword())) {
            return error(400, "The password is not right.");
        }
        if (!twoStep.verify(u, body.get("code"))) return error(400, "The code is not right.");
        twoStep.turnOff(u);
        activity.record(u.getEmail(), "TWO_STEP_OFF", "auth", "Turned off two-step sign-in", null, null);
        return ResponseEntity.ok(Map.of("on", false));
    }

    /** Administrator: turn it off for another person (lost phone). */
    @PostMapping("/reset")
    public ResponseEntity<?> reset(@RequestBody Map<String, String> body, Authentication auth) {
        boolean admin = auth != null && auth.getAuthorities().stream().anyMatch(a -> "ACTION_ADMIN_MANAGE_USERS".equals(a.getAuthority()));
        if (!admin) return error(403, "Only an administrator can do this.");
        String email = body.get("email");
        User u = email == null ? null : users.findByEmailIgnoreCase(email.trim()).orElse(null);
        if (u == null) return error(404, "No account with that email.");
        twoStep.turnOff(u);
        activity.record(auth.getName(), "TWO_STEP_RESET", "auth", "Turned off two-step sign-in for " + u.getEmail(), null, null);
        return ResponseEntity.ok(Map.of("on", false));
    }
}
