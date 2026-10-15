package com.carrental.backend.service;

import com.carrental.backend.model.User;
import com.carrental.backend.model.UserSession;
import com.carrental.backend.repository.UserSessionRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class SessionManagementService {

    @Autowired
    private UserSessionRepository sessionRepository;

    @Value("${app.session.max-concurrent:3}")
    private int maxConcurrentSessions;

    @Value("${app.session.timeout-minutes:30}")
    private int sessionTimeoutMinutes;

    @Value("${app.session.max-duration-hours:24}")
    private int maxSessionDurationHours;

    /**
     * Create a new session for user
     */
    public UserSession createSession(User user, HttpServletRequest request) {
        // Check concurrent session limit
        long activeSessions = sessionRepository.countActiveSessionsByUser(user);
        if (activeSessions >= maxConcurrentSessions) {
            // Terminate oldest session
            terminateOldestSession(user);
        }

        UserSession session = new UserSession();
        session.setSessionToken(UUID.randomUUID().toString());
        session.setUser(user);
        session.setIpAddress(getClientIp(request));
        session.setUserAgent(request.getHeader("User-Agent"));
        session.setDeviceType(detectDeviceType(request));
        session.setDeviceName(extractDeviceName(request));
        session.setExpiresAt(LocalDateTime.now().plusHours(maxSessionDurationHours));
        session.setActive(true);

        return sessionRepository.save(session);
    }

    /**
     * Validate and refresh session
     */
    public boolean validateAndRefreshSession(String sessionToken) {
        return sessionRepository.findBySessionToken(sessionToken)
            .map(session -> {
                if (!session.isActive()) {
                    return false;
                }
                if (session.isExpired()) {
                    session.setActive(false);
                    session.setLogoutAt(LocalDateTime.now());
                    sessionRepository.save(session);
                    return false;
                }
                if (session.isInactive(sessionTimeoutMinutes)) {
                    session.setActive(false);
                    session.setLogoutAt(LocalDateTime.now());
                    sessionRepository.save(session);
                    return false;
                }

                // Refresh last activity
                session.setLastActivity(LocalDateTime.now());
                sessionRepository.save(session);
                return true;
            })
            .orElse(false);
    }

    /**
     * Get active sessions for user
     */
    public List<UserSession> getActiveSessions(User user) {
        return sessionRepository.findActiveSessionsByUser(user);
    }

    /**
     * Terminate specific session
     */
    @Transactional
    public void terminateSession(String sessionToken) {
        sessionRepository.findBySessionToken(sessionToken).ifPresent(session -> {
            session.setActive(false);
            session.setLogoutAt(LocalDateTime.now());
            sessionRepository.save(session);
        });
    }

    /**
     * Terminate all sessions for user (used during password change, etc.)
     */
    @Transactional
    public void terminateAllUserSessions(User user) {
        sessionRepository.deactivateAllUserSessions(user, LocalDateTime.now());
    }

    /**
     * Terminate oldest session when limit is reached
     */
    private void terminateOldestSession(User user) {
        List<UserSession> sessions = sessionRepository.findActiveSessionsByUser(user);
        if (!sessions.isEmpty()) {
            UserSession oldest = sessions.get(sessions.size() - 1);
            terminateSession(oldest.getSessionToken());
        }
    }

    /**
     * Scheduled task to clean up expired sessions
     */
    @Scheduled(fixedRate = 300000) // Run every 5 minutes
    @Transactional
    public void cleanupExpiredSessions() {
        sessionRepository.deactivateExpiredSessions(LocalDateTime.now(), LocalDateTime.now());
    }

    /**
     * Get client IP address
     */
    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }
        String xRealIp = request.getHeader("X-Real-IP");
        if (xRealIp != null && !xRealIp.isEmpty()) {
            return xRealIp;
        }
        return request.getRemoteAddr();
    }

    /**
     * Detect device type from user agent
     */
    private UserSession.DeviceType detectDeviceType(HttpServletRequest request) {
        String userAgent = request.getHeader("User-Agent");
        if (userAgent == null) {
            return UserSession.DeviceType.DESKTOP;
        }
        userAgent = userAgent.toLowerCase();

        if (userAgent.contains("mobile") || userAgent.contains("android") || userAgent.contains("iphone")) {
            return UserSession.DeviceType.MOBILE;
        } else if (userAgent.contains("tablet") || userAgent.contains("ipad")) {
            return UserSession.DeviceType.TABLET;
        }
        return UserSession.DeviceType.DESKTOP;
    }

    /**
     * Extract device name from user agent
     */
    private String extractDeviceName(HttpServletRequest request) {
        String userAgent = request.getHeader("User-Agent");
        if (userAgent == null) {
            return "Unknown";
        }

        if (userAgent.contains("Chrome")) return "Chrome Browser";
        if (userAgent.contains("Firefox")) return "Firefox Browser";
        if (userAgent.contains("Safari")) return "Safari Browser";
        if (userAgent.contains("Edge")) return "Edge Browser";

        return "Unknown Browser";
    }
}
