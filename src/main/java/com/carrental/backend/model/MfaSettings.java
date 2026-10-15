package com.carrental.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "mfa_settings")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class MfaSettings {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @OneToOne
    @JoinColumn(name = "user_id", unique = true)
    private User user;

    @Column(name = "mfa_enabled")
    private boolean mfaEnabled = false;

    @Column(name = "mfa_type")
    @Enumerated(EnumType.STRING)
    private MfaType mfaType = MfaType.TOTP;

    @Column(name = "secret_key")
    private String secretKey;

    @Column(name = "backup_codes", length = 1000)
    private String backupCodes; // Comma-separated encrypted codes

    @Column(name = "phone_number")
    private String phoneNumber;

    @Column(name = "email_verified")
    private boolean emailVerified = false;

    @Column(name = "phone_verified")
    private boolean phoneVerified = false;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public enum MfaType {
        TOTP,  // Time-based One-Time Password (Google Authenticator, Authy)
        SMS,   // SMS verification
        EMAIL  // Email verification
    }
}
