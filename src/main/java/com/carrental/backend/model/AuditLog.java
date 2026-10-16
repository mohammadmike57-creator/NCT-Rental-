package com.carrental.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "audit_logs", indexes = {
    @Index(name = "idx_audit_user_id", columnList = "user_id"),
    @Index(name = "idx_audit_timestamp", columnList = "timestamp"),
    @Index(name = "idx_audit_action_type", columnList = "action_type"),
    @Index(name = "idx_audit_entity_type", columnList = "entity_type")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(name = "timestamp", nullable = false)
    private LocalDateTime timestamp;

    @Column(name = "user_id")
    private String userId;

    @Column(name = "user_email")
    private String userEmail;

    @Column(name = "user_name")
    private String userName;

    @Column(name = "action_type", nullable = false)
    @Enumerated(EnumType.STRING)
    private ActionType actionType;

    @Column(name = "entity_type")
    @Enumerated(EnumType.STRING)
    private EntityType entityType;

    @Column(name = "entity_id")
    private String entityId;

    @Column(name = "description", length = 1000)
    private String description;

    @Column(name = "ip_address")
    private String ipAddress;

    @Column(name = "user_agent", length = 500)
    private String userAgent;

    @Column(name = "old_value", columnDefinition = "TEXT")
    private String oldValue; // JSON representation

    @Column(name = "new_value", columnDefinition = "TEXT")
    private String newValue; // JSON representation

    @Column(name = "status")
    @Enumerated(EnumType.STRING)
    private Status status = Status.SUCCESS;

    @Column(name = "error_message", length = 500)
    private String errorMessage;

    @PrePersist
    protected void onCreate() {
        if (timestamp == null) {
            timestamp = LocalDateTime.now();
        }
    }

    public enum ActionType {
        LOGIN,
        LOGOUT,
        LOGIN_FAILED,
        MFA_ENABLED,
        MFA_DISABLED,
        PASSWORD_CHANGED,
        PASSWORD_RESET,
        USER_CREATED,
        USER_UPDATED,
        USER_DELETED,
        RESERVATION_CREATED,
        RESERVATION_UPDATED,
        RESERVATION_DELETED,
        RESERVATION_STATUS_CHANGED,
        PAYMENT_PROCESSED,
        PAYMENT_FAILED,
        PAYMENT_REFUNDED,
        INVOICE_GENERATED,
        VEHICLE_CREATED,
        VEHICLE_UPDATED,
        VEHICLE_DELETED,
        SETTINGS_CHANGED,
        DATA_EXPORTED,
        DATA_IMPORTED,
        BACKUP_CREATED,
        PERMISSION_CHANGED,
        SESSION_TERMINATED,
        API_KEY_CREATED,
        API_KEY_REVOKED,
        // Generic actions used by AuditLogService for any entity type
        CREATE,
        UPDATE,
        DELETE,
        API_CALL,
        SECURITY_EVENT
    }

    public enum EntityType {
        USER,
        RESERVATION,
        VEHICLE,
        PAYMENT,
        INVOICE,
        EXPENSE,
        TRAFFIC_TICKET,
        VEHICLE_DAMAGE,
        SETTINGS,
        BACKUP,
        API_KEY
    }

    public enum Status {
        SUCCESS,
        FAILED,
        PARTIAL,
        WARNING
    }
}
