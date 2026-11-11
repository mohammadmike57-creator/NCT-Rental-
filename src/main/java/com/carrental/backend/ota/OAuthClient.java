package com.carrental.backend.ota;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/** An OAuth 2.0 client of a broker channel for the REST/JSON v3 API: one per channel and environment (or more). */
@Entity
@Table(name = "oauth_client", indexes = @Index(name = "idx_oauth_client_channel", columnList = "channelId"))
@Getter
@Setter
public class OAuthClient {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false, unique = true, length = 64) private String clientId;
    /** SHA-256 hex of the client secret; the secret itself is shown once and never stored. */
    @Column(nullable = false, length = 64) private String secretHash;
    @Column(length = 8) private String secretHint;
    @Column(nullable = false, length = 64) private String channelId;
    /** sandbox | production */
    @Column(nullable = false, length = 12) private String environment;
    /** Space-separated granted scopes. */
    @Column(nullable = false, length = 400) private String scopes;
    @Column(length = 120) private String name;
    /** ACTIVE | REVOKED */
    @Column(nullable = false, length = 12) private String status = "ACTIVE";
    @Column(length = 120) private String createdBy;
    @Column(nullable = false) private Instant createdAt = Instant.now();
    private Instant lastUsedAt;
    private Instant revokedAt;
}
