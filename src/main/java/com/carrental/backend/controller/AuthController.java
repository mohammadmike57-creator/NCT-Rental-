package com.carrental.backend.controller;

import com.carrental.backend.audit.ActivityService;
import com.carrental.backend.dto.AuthRequest;
import com.carrental.backend.dto.AuthResponse;
import com.carrental.backend.dto.ChangePasswordRequest;
import com.carrental.backend.model.User;
import com.carrental.backend.repository.UserRepository;
import com.carrental.backend.security.JwtUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;

@RestController
@RequestMapping("/auth")
public class AuthController {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private ActivityService activity;

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody AuthRequest request) {
        // Staff can sign in with their email or their username.
        String login = request.getEmail() == null ? "" : request.getEmail().trim();
        User user = userRepository.findByEmail(login)
                .or(() -> userRepository.findByEmailIgnoreCase(login))
                .or(() -> userRepository.findFirstByUsernameIgnoreCase(login))
                .orElse(null);
        if (user == null) {
            return ResponseEntity.badRequest().body("Invalid credentials");
        }
        if (user.getPassword() == null || !passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            activity.record(user.getEmail(), "LOGIN_FAILED", "auth", "Failed sign-in attempt (wrong password)", null, null);
            return ResponseEntity.badRequest().body("Invalid credentials");
        }
        if ((user.getStatus() != null && user.getStatus() != com.carrental.backend.model.UserStatus.ACTIVE)
                || Boolean.FALSE.equals(user.getWebAppAccess())) {
            return ResponseEntity.status(403).body("This account has been disabled. Contact your administrator.");
        }
        String token = jwtUtil.generateToken(user.getEmail());
        activity.record(user.getEmail(), "LOGIN", "auth", "Signed in", null, null);
        return ResponseEntity.ok(new AuthResponse(token, user));
    }

    @PostMapping("/change-password")
    public ResponseEntity<?> changePassword(@RequestBody ChangePasswordRequest request,
                                            @AuthenticationPrincipal UserDetails userDetails) {
        if (userDetails == null) {
            return ResponseEntity.status(401).body("Not authenticated");
        }
        User user = userRepository.findByEmail(userDetails.getUsername())
                .orElseThrow(() -> new RuntimeException("User not found"));
        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPassword())) {
            return ResponseEntity.badRequest().body("Current password is incorrect");
        }
        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        user.setPasswordLastChanged(LocalDateTime.now());
        userRepository.save(user);
        activity.record(user.getEmail(), "PASSWORD_CHANGED", "auth", "Changed own password", null, null);
        return ResponseEntity.ok().body("Password changed successfully");
    }
}
