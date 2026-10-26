package com.carrental.backend.ota;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/** One webhook event for a broker and its delivery attempts (retried with exponential back-off). */
@Entity
@Table(name = "channel_webhook_delivery", indexes = {
    @Index(name = "idx_wh_due", columnList = "status,nextAttemptAt"),
    @Index(name = "idx_wh_channel", columnList = "channelId,createdAt")})
@Getter @Setter
public class ChannelWebhookDelivery {
    public enum Status { PENDING, DELIVERED, FAILED }

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, length = 40) private String eventId;
    @Column(nullable = false, length = 100) private String channelId;
    @Column(nullable = false, length = 40) private String eventType;
    @Column(length = 30) private String reservationNumber;
    @Column(length = 100) private String brokerReference;
    @Column(length = 500) private String url;
    @Lob @Column(columnDefinition = "TEXT", nullable = false) private String payload;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 12) private Status status;
    private int attempts;
    private Instant nextAttemptAt;
    private Integer lastHttpStatus;
    @Column(length = 500) private String lastError;
    @Column(nullable = false) private Instant createdAt;
    private Instant deliveredAt;
}
