package com.carrental.backend.ota;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * One broker API call, kept in full for support and audits: the request and the response as sent
 * (credentials and card numbers masked), timing, result and the booking it concerned.
 * Kept for channel.traffic.retention-days (30 by default).
 */
@Entity
@Table(name = "channel_message", indexes = {
    @Index(name = "idx_cm_channel_created", columnList = "channelId,createdAt"),
    @Index(name = "idx_cm_request", columnList = "requestId"),
    @Index(name = "idx_cm_reservation", columnList = "reservationNumber")})
@Getter @Setter
public class ChannelMessage {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, length = 100) private String channelId;
    @Column(length = 90) private String requestId;
    @Column(length = 12) private String format;          // OTA | SOAP | XML | REST | CONSOLE
    @Column(length = 60) private String operation;
    private int httpStatus;
    private boolean success;
    @Column(length = 40) private String errorCode;
    @Column(length = 500) private String errorMessage;
    private long durationMs;
    private int requestBytes;
    private int responseBytes;
    @Column(length = 64) private String remoteIp;
    private boolean sandbox;
    @Column(length = 30) private String reservationNumber;
    @Column(columnDefinition = "TEXT") private String requestBody;
    @Column(columnDefinition = "TEXT") private String responseBody;
    @Column(nullable = false) private Instant createdAt;
}
