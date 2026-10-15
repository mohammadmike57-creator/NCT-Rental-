package com.carrental.backend.controller;

import com.carrental.backend.model.User;
import com.carrental.backend.model.UserSession;
import com.carrental.backend.repository.UserRepository;
import com.carrental.backend.service.SessionManagementService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/sessions")
public class SessionController {

    @Autowired
    private SessionManagementService sessionService;

    @Autowired
    private UserRepository userRepository;

    /**
     * Get active sessions for current user
     */
    @GetMapping("/active")
    public ResponseEntity<?> getActiveSessions(Authentication auth) {
        User user = getUserFromAuth(auth);
        if (user == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }

        List<UserSession> sessions = sessionService.getActiveSessions(user);

        List<Map<String, Object>> sessionList = sessions.stream().map(session -> {
            Map<String, Object> sessionMap = new HashMap<>();
            sessionMap.put("id", session.getId());
            sessionMap.put("deviceType", session.getDeviceType());
            sessionMap.put("deviceName", session.getDeviceName());
            sessionMap.put("ipAddress", session.getIpAddress());
            sessionMap.put("location", session.getLocation());
            sessionMap.put("createdAt", session.getCreatedAt());
            sessionMap.put("lastActivity", session.getLastActivity());
            sessionMap.put("expiresAt", session.getExpiresAt());
            return sessionMap;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(Map.of("sessions", sessionList));
    }

    /**
     * Terminate specific session
     */
    @DeleteMapping("/{sessionId}")
    public ResponseEntity<?> terminateSession(
            @PathVariable String sessionId,
            Authentication auth
    ) {
        User user = getUserFromAuth(auth);
        if (user == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }

        sessionService.terminateSession(sessionId);

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Session terminated successfully"
        ));
    }

    /**
     * Terminate all sessions except current
     */
    @PostMapping("/terminate-all-others")
    public ResponseEntity<?> terminateAllOtherSessions(
            Authentication auth,
            HttpServletRequest request
    ) {
        User user = getUserFromAuth(auth);
        if (user == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }

        String currentSessionToken = request.getHeader("Session-Token");
        List<UserSession> sessions = sessionService.getActiveSessions(user);

        for (UserSession session : sessions) {
            if (!session.getSessionToken().equals(currentSessionToken)) {
                sessionService.terminateSession(session.getSessionToken());
            }
        }

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "All other sessions terminated successfully"
        ));
    }

    private User getUserFromAuth(Authentication auth) {
        if (auth == null || auth.getPrincipal() == null) {
            return null;
        }
        String email = auth.getName();
        return userRepository.findByEmail(email).orElse(null);
    }
}
