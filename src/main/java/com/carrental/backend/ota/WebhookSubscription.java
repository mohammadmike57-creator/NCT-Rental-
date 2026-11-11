package com.carrental.backend.ota;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/** A webhooks-v2 endpoint of a channel (REST/JSON v3): its address, its events, its signing secret (encrypted). */
@Entity
@Table(name = "webhook_subscription", indexes = @Index(name = "idx_whsub_channel", columnList = "channelId,environment"))
@Getter
@Setter
public class WebhookSubscription {
    public enum Status { ACTIVE, PAUSED, DISABLED }

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, unique = true, length = 40) private String publicId;
    @Column(nullable = false, length = 64) private String channelId;
    /** sandbox | production: a subscription only receives events of its environment. */
    @Column(nullable = false, length = 12) private String environment;
    @Column(nullable = false, length = 500) private String url;
    /** Space-separated event types. */
    @Column(nullable = false, length = 800) private String events;
    @Column(nullable = false, columnDefinition = "TEXT") private String secretEnc;
    @Column(columnDefinition = "TEXT") private String previousSecretEnc;
    private Instant previousSecretUntil;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 12) private Status status = Status.ACTIVE;
    @Column(length = 120) private String createdBy;
    @Column(nullable = false) private Instant createdAt = Instant.now();
    private Instant updatedAt;
}
