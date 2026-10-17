package com.carrental.backend.notify;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

/** Outgoing email (SMTP) settings an administrator saves from the app. A single row, id = 1. */
@Entity
@Table(name = "mail_settings")
@Data
public class MailSettings {
    @Id
    private Long id = 1L;
    private boolean enabled;
    private String host;
    private Integer port;
    private String username;
    @Column(length = 1024)
    private String passwordEncrypted;
    private String fromAddress;
    private String fromName;
    /** Optional. Empty means emails are send-only (no Reply-To; customers are told not to reply). */
    private String replyTo;
    /** STARTTLS (usually port 587) or SSL (usually port 465). */
    private String security;
    private String updatedBy;
    private Instant updatedAt;
}
