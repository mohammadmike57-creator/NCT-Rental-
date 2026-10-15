package com.carrental.backend.controller;

import com.carrental.backend.dto.MfaEnableRequest;
import com.carrental.backend.dto.MfaVerifyRequest;
import com.carrental.backend.model.AuditLog;
import com.carrental.backend.model.MfaSettings;
import com.carrental.backend.model.User;
import com.carrental.backend.repository.UserRepository;
import com.carrental.backend.service.AuditLogService;
import com.carrental.backend.service.MfaService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/mfa")
public class MfaController {

    @Autowired
    private MfaService mfaService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private AuditLogService auditLogService;

    /**
     * Get MFA status for current user
     */
    @GetMapping("/status")
    public ResponseEntity<?> getMfaStatus(Authentication auth) {
        User user = getUserFromAuth(auth);
        if (user == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }

        MfaSettings settings = mfaService.getMfaSettings(user);
        Map<String, Object> response = new HashMap<>();

        if (settings != null) {
            response.put("enabled", settings.isMfaEnabled());
            response.put("type", settings.getMfaType());
        } else {
            response.put("enabled", false);
        }

        return ResponseEntity.ok(response);
    }

    /**
     * Initialize MFA setup (generate secret and QR code)
     */
    @PostMapping("/setup/init")
    public ResponseEntity<?> initializeMfaSetup(
            @RequestBody Map<String, String> request,
            Authentication auth
    ) {
        User user = getUserFromAuth(auth);
        if (user == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }

        String type = request.getOrDefault("type", "TOTP");
        MfaSettings.MfaType mfaType = MfaSettings.MfaType.valueOf(type);

        String secretKey = mfaService.generateSecretKey();
        String qrCodeUrl = mfaService.generateQrCodeUrl(
                user.getEmail(),
                secretKey,
                "NCT Rental"
        );

        List<String> backupCodes = mfaService.generateBackupCodes();

        Map<String, Object> response = new HashMap<>();
        response.put("secretKey", secretKey);
        response.put("qrCodeUrl", qrCodeUrl);
        response.put("backupCodes", backupCodes);
        response.put("type", mfaType);

        return ResponseEntity.ok(response);
    }

    /**
     * Enable MFA after verification
     */
    @PostMapping("/enable")
    public ResponseEntity<?> enableMfa(
            @RequestBody MfaEnableRequest request,
            Authentication auth,
            HttpServletRequest httpRequest
    ) {
        User user = getUserFromAuth(auth);
        if (user == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }

        // Verify the code before enabling
        boolean valid = mfaService.verifyTotpCode(request.getSecretKey(), request.getCode());
        if (!valid) {
            return ResponseEntity.status(400).body(Map.of("error", "Invalid verification code"));
        }

        // Enable MFA
        MfaSettings settings = mfaService.enableMfa(user, MfaSettings.MfaType.TOTP);

        // Store the secret key
        settings.setSecretKey(request.getSecretKey());

        // Log audit event
        auditLogService.log(
                AuditLog.ActionType.MFA_ENABLED,
                user,
                "MFA enabled via TOTP",
                httpRequest
        );

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "MFA enabled successfully"
        ));
    }

    /**
     * Disable MFA
     */
    @PostMapping("/disable")
    public ResponseEntity<?> disableMfa(
            @RequestBody Map<String, String> request,
            Authentication auth,
            HttpServletRequest httpRequest
    ) {
        User user = getUserFromAuth(auth);
        if (user == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }

        String code = request.get("code");
        MfaSettings settings = mfaService.getMfaSettings(user);

        if (settings == null || !settings.isMfaEnabled()) {
            return ResponseEntity.status(400).body(Map.of("error", "MFA is not enabled"));
        }

        // Verify code before disabling
        boolean valid = mfaService.verifyTotpCode(settings.getSecretKey(), code);
        if (!valid) {
            // Try backup code
            valid = mfaService.verifyBackupCode(user, code);
        }

        if (!valid) {
            return ResponseEntity.status(400).body(Map.of("error", "Invalid verification code"));
        }

        mfaService.disableMfa(user);

        // Log audit event
        auditLogService.log(
                AuditLog.ActionType.MFA_DISABLED,
                user,
                "MFA disabled",
                httpRequest
        );

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "MFA disabled successfully"
        ));
    }

    /**
     * Verify MFA code during login
     */
    @PostMapping("/verify")
    public ResponseEntity<?> verifyMfaCode(
            @RequestBody MfaVerifyRequest request,
            Authentication auth
    ) {
        User user = getUserFromAuth(auth);
        if (user == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }

        MfaSettings settings = mfaService.getMfaSettings(user);
        if (settings == null || !settings.isMfaEnabled()) {
            return ResponseEntity.status(400).body(Map.of("error", "MFA not enabled"));
        }

        boolean valid = mfaService.verifyTotpCode(settings.getSecretKey(), request.getCode());

        if (!valid) {
            // Try backup code
            valid = mfaService.verifyBackupCode(user, request.getCode());
        }

        if (valid) {
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "verified", true
            ));
        } else {
            return ResponseEntity.status(400).body(Map.of(
                    "success", false,
                    "error", "Invalid code"
            ));
        }
    }

    private User getUserFromAuth(Authentication auth) {
        if (auth == null || auth.getPrincipal() == null) {
            return null;
        }
        String email = auth.getName();
        return userRepository.findByEmail(email).orElse(null);
    }
}
