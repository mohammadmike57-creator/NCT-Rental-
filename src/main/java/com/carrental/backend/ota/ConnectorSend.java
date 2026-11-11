package com.carrental.backend.ota;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/** One message waiting for, or done with, an outbound connector; retried until delivered or 24 hours old. */
@Entity
@Table(name = "connector_send", indexes = @Index(name = "idx_csend_due", columnList = "status,nextAttemptAt"))
@Getter
@Setter
public class ConnectorSend {
    public enum Status { PENDING, SENT, FAILED }

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false) private Long connectorId;
    @Column(nullable = false, length = 64) private String channelId;
    @Column(nullable = false, length = 40) private String kind;          // e.g. reservation.created, rates, availability
    @Column(length = 40) private String reservationNumber;
    @Column(nullable = false, length = 60) private String contentType;
    @Column(nullable = false, columnDefinition = "TEXT") private String body;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 8) private Status status = Status.PENDING;
    private int attempts;
    private Integer lastHttpStatus;
    @Column(length = 400) private String lastError;
    private Instant nextAttemptAt = Instant.now();
    @Column(nullable = false) private Instant createdAt = Instant.now();
    private Instant sentAt;
}
