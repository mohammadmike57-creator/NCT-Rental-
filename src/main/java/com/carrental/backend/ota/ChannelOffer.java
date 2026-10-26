package com.carrental.backend.ota;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;

/**
 * A priced offer returned by an availability search (QUOTED). A quote request turns it into a
 * short temporary hold (HELD) that counts against availability until it expires or is booked
 * (CONVERTED). Prices are never taken from the partner: a booking re-prices and compares.
 */
@Entity
@Table(name = "channel_offer", indexes = {
    @Index(name = "idx_offer_hold", columnList = "status,sippCode,expiresAt"),
    @Index(name = "idx_offer_created", columnList = "createdAt")})
@Getter @Setter
public class ChannelOffer {
    public enum Status { QUOTED, HELD, CONVERTED, EXPIRED, RELEASED }

    @Id @Column(length = 40) private String id;
    @Column(nullable = false, length = 100) private String channelId;
    @Column(nullable = false, length = 10) private String sippCode;
    @Column(length = 20) private String pickupLocation;
    @Column(length = 20) private String returnLocation;
    @Column(nullable = false) private LocalDateTime pickupAt;
    @Column(nullable = false) private LocalDateTime returnAt;
    @Column(length = 500) private String extras;     // CODE:qty,CODE:qty
    @Column(length = 200) private String coverages;  // optional cover codes, comma-separated
    @Column(length = 40) private String promoCode;
    private Integer driverAge;
    @Column(nullable = false, length = 3) private String currency;
    @Column(nullable = false, precision = 12, scale = 2) private BigDecimal total;
    @Lob @Column(columnDefinition = "TEXT") private String breakdown;   // JSON price breakdown at quote time
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 12) private Status status;
    @Column(nullable = false) private Instant expiresAt;
    @Column(nullable = false) private Instant createdAt;
    private boolean sandbox;
}
