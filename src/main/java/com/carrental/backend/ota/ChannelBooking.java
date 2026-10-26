package com.carrental.backend.ota;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;

/**
 * One booking made by a broker: links the broker's reference to our reservation number and to
 * the booking in the reservations list, and keeps what idempotent retries must replay.
 * Sandbox bookings (channels in testing, certification runs) live only here, never in the
 * reservations list.
 */
@Entity
@Table(name = "channel_booking",
    uniqueConstraints = {@UniqueConstraint(name = "uq_cb_idem", columnNames = {"channelId", "idempotencyKey"}),
                         @UniqueConstraint(name = "uq_cb_res", columnNames = {"reservationNumber"})},
    indexes = {@Index(name = "idx_cb_ref", columnList = "channelId,brokerReference"), @Index(name = "idx_cb_created", columnList = "channelId,createdAt")})
@Getter @Setter
public class ChannelBooking {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, length = 100) private String channelId;
    @Column(length = 40) private String channelCode;
    @Column(nullable = false, length = 30) private String reservationNumber;   // RSV-2026-000123
    @Column(length = 100) private String brokerReference;
    @Column(nullable = false, length = 150) private String idempotencyKey;
    @Column(nullable = false, length = 64) private String requestHash;
    @Column(length = 60) private String stateReservationId;                   // id in the reservations list
    @Column(length = 40) private String offerId;
    @Column(length = 10) private String sippCode;
    private LocalDateTime pickupAt;
    private LocalDateTime returnAt;
    @Column(precision = 12, scale = 2) private BigDecimal total;
    @Column(length = 3) private String currency;
    @Column(length = 20) private String status;                                // last status told to the broker
    @Column(length = 200) private String customerName;
    @Lob @Column(columnDefinition = "TEXT") private String createResponse;    // JSON view replayed on retries
    @Lob @Column(columnDefinition = "TEXT") private String sandboxReservation; // sandbox only: the booking itself
    private boolean sandbox;
    @Column(nullable = false) private Instant createdAt;
    private Instant updatedAt;
}
