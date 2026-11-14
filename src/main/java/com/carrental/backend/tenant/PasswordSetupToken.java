package com.carrental.backend.tenant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/** A one-time link to choose a password (invitations and resets). Only the link's fingerprint is stored. */
@Entity
@Table(name = "password_setup_token")
public class PasswordSetupToken {
    @Id
    @Column(length = 64)
    private String tokenHash;
    @Column(nullable = false)
    private String email;
    @Column(length = 40)
    private String supplierId;
    @Column(nullable = false)
    private Instant expiresAt;
    private Instant usedAt;
    private Instant createdAt;
    private String createdBy;

    public String getTokenHash() { return tokenHash; }
    public void setTokenHash(String v) { this.tokenHash = v; }
    public String getEmail() { return email; }
    public void setEmail(String v) { this.email = v; }
    public String getSupplierId() { return supplierId; }
    public void setSupplierId(String v) { this.supplierId = v; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant v) { this.expiresAt = v; }
    public Instant getUsedAt() { return usedAt; }
    public void setUsedAt(Instant v) { this.usedAt = v; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant v) { this.createdAt = v; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String v) { this.createdBy = v; }
}
