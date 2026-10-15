package com.carrental.backend.service;

import com.carrental.backend.model.AuditLog;
import com.carrental.backend.model.User;
import com.carrental.backend.repository.AuditLogRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
public class AuditLogService {

    @Autowired
    private AuditLogRepository auditLogRepository;

    @Autowired
    private ObjectMapper objectMapper;

    /**
     * Log an audit event asynchronously
     */
    @Async
    public void log(AuditLog.ActionType actionType, User user, String description, HttpServletRequest request) {
        AuditLog log = new AuditLog();
        log.setTimestamp(LocalDateTime.now());
        log.setActionType(actionType);
        log.setDescription(description);
        log.setStatus(AuditLog.Status.SUCCESS);

        if (user != null) {
            log.setUserId(user.getId());
            log.setUserEmail(user.getEmail());
            log.setUserName(user.getFullName());
        }

        if (request != null) {
            log.setIpAddress(getClientIp(request));
            log.setUserAgent(request.getHeader("User-Agent"));
        }

        auditLogRepository.save(log);
    }

    /**
     * Log with entity details
     */
    @Async
    public void logEntityAction(
            AuditLog.ActionType actionType,
            AuditLog.EntityType entityType,
            String entityId,
            User user,
            Object oldValue,
            Object newValue,
            HttpServletRequest request
    ) {
        try {
            AuditLog log = new AuditLog();
            log.setTimestamp(LocalDateTime.now());
            log.setActionType(actionType);
            log.setEntityType(entityType);
            log.setEntityId(entityId);
            log.setStatus(AuditLog.Status.SUCCESS);

            if (user != null) {
                log.setUserId(user.getId());
                log.setUserEmail(user.getEmail());
                log.setUserName(user.getFullName());
            }

            if (oldValue != null) {
                log.setOldValue(objectMapper.writeValueAsString(oldValue));
            }

            if (newValue != null) {
                log.setNewValue(objectMapper.writeValueAsString(newValue));
            }

            if (request != null) {
                log.setIpAddress(getClientIp(request));
                log.setUserAgent(request.getHeader("User-Agent"));
            }

            auditLogRepository.save(log);
        } catch (Exception e) {
            // Log error but don't fail the main operation
            e.printStackTrace();
        }
    }

    /**
     * Log failed action
     */
    @Async
    public void logFailure(
            AuditLog.ActionType actionType,
            User user,
            String errorMessage,
            HttpServletRequest request
    ) {
        AuditLog log = new AuditLog();
        log.setTimestamp(LocalDateTime.now());
        log.setActionType(actionType);
        log.setStatus(AuditLog.Status.FAILED);
        log.setErrorMessage(errorMessage);

        if (user != null) {
            log.setUserId(user.getId());
            log.setUserEmail(user.getEmail());
            log.setUserName(user.getFullName());
        }

        if (request != null) {
            log.setIpAddress(getClientIp(request));
            log.setUserAgent(request.getHeader("User-Agent"));
        }

        auditLogRepository.save(log);
    }

    /**
     * Get audit logs with pagination
     */
    public Page<AuditLog> getAuditLogs(Pageable pageable) {
        return auditLogRepository.findAll(pageable);
    }

    /**
     * Get audit logs for specific user
     */
    public Page<AuditLog> getUserAuditLogs(String userId, Pageable pageable) {
        return auditLogRepository.findByUserId(userId, pageable);
    }

    /**
     * Get audit logs by action type
     */
    public Page<AuditLog> getAuditLogsByAction(AuditLog.ActionType actionType, Pageable pageable) {
        return auditLogRepository.findByActionType(actionType, pageable);
    }

    /**
     * Get audit logs in time range
     */
    public Page<AuditLog> getAuditLogsInTimeRange(
            LocalDateTime start,
            LocalDateTime end,
            Pageable pageable
    ) {
        return auditLogRepository.findByTimestampBetween(start, end, pageable);
    }

    /**
     * Get client IP
     */
    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    /**
     * Log reservation created from channel
     */
    @Async
    public void logReservationCreated(String reservationId, String channelId, String source) {
        AuditLog log = new AuditLog();
        log.setTimestamp(LocalDateTime.now());
        log.setActionType(AuditLog.ActionType.CREATE);
        log.setEntityType(AuditLog.EntityType.RESERVATION);
        log.setEntityId(reservationId);
        log.setDescription("Reservation created from " + source + " via channel " + channelId);
        log.setStatus(AuditLog.Status.SUCCESS);
        auditLogRepository.save(log);
    }

    /**
     * Log reservation modified
     */
    @Async
    public void logReservationModified(String reservationId, String channelId, String source) {
        AuditLog log = new AuditLog();
        log.setTimestamp(LocalDateTime.now());
        log.setActionType(AuditLog.ActionType.UPDATE);
        log.setEntityType(AuditLog.EntityType.RESERVATION);
        log.setEntityId(reservationId);
        log.setDescription("Reservation modified from " + source + " via channel " + channelId);
        log.setStatus(AuditLog.Status.SUCCESS);
        auditLogRepository.save(log);
    }

    /**
     * Log reservation cancelled
     */
    @Async
    public void logReservationCancelled(String reservationId, String channelId, String source) {
        AuditLog log = new AuditLog();
        log.setTimestamp(LocalDateTime.now());
        log.setActionType(AuditLog.ActionType.DELETE);
        log.setEntityType(AuditLog.EntityType.RESERVATION);
        log.setEntityId(reservationId);
        log.setDescription("Reservation cancelled from " + source + " via channel " + channelId);
        log.setStatus(AuditLog.Status.SUCCESS);
        auditLogRepository.save(log);
    }

    /**
     * Log reservation error
     */
    @Async
    public void logReservationError(String channelId, String action, String errorMessage) {
        AuditLog log = new AuditLog();
        log.setTimestamp(LocalDateTime.now());
        log.setActionType(AuditLog.ActionType.CREATE);
        log.setEntityType(AuditLog.EntityType.RESERVATION);
        log.setDescription(action + " from channel " + channelId);
        log.setStatus(AuditLog.Status.FAILED);
        log.setErrorMessage(errorMessage);
        auditLogRepository.save(log);
    }

    /**
     * Log webhook received
     */
    @Async
    public void logWebhookReceived(String webhookType, String channelId, String confirmationNumber,
                                   boolean success, long processingTimeMs) {
        AuditLog log = new AuditLog();
        log.setTimestamp(LocalDateTime.now());
        log.setActionType(AuditLog.ActionType.API_CALL);
        log.setDescription(String.format("Webhook %s from channel %s - Confirmation: %s - Time: %dms",
            webhookType, channelId, confirmationNumber, processingTimeMs));
        log.setStatus(success ? AuditLog.Status.SUCCESS : AuditLog.Status.FAILED);
        auditLogRepository.save(log);
    }

    /**
     * Log security event
     */
    @Async
    public void logSecurityEvent(String eventType, String channelId, String details) {
        AuditLog log = new AuditLog();
        log.setTimestamp(LocalDateTime.now());
        log.setActionType(AuditLog.ActionType.SECURITY_EVENT);
        log.setDescription(eventType + " - Channel: " + channelId + " - " + details);
        log.setStatus(AuditLog.Status.WARNING);
        auditLogRepository.save(log);
    }
}
