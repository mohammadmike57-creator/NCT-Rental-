package com.carrental.backend.ota;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * A connection where UR-Drive calls the broker's system: rate files, availability push or booking
 * notifications. Kept in the database (not in the shared settings) so its credentials stay on the
 * server, encrypted; staff can replace them but never read them back.
 */
@Entity
@Table(name = "outbound_connector", indexes = @Index(name = "idx_conn_channel", columnList = "channelId"))
@Getter
@Setter
public class OutboundConnector {
    public enum Type { RATE_FILE, ARI_PUSH, RES_NOTIFY }

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, unique = true, length = 40) private String publicId;
    @Column(nullable = false, length = 64) private String channelId;
    @Column(nullable = false, length = 80) private String name;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 12) private Type type;
    @Column(nullable = false, length = 500) private String url;
    @Column(nullable = false, length = 6) private String method = "POST";
    /** XML | CSV | JSON */
    @Column(nullable = false, length = 6) private String format = "JSON";
    /** NONE | BASIC | BEARER | HEADER | OAUTH2 */
    @Column(nullable = false, length = 8) private String authType = "NONE";
    /** BASIC user, HEADER name or OAUTH2 client id (not secret, shown in the console). */
    @Column(length = 200) private String authUser;
    /** OAUTH2 token address. */
    @Column(length = 500) private String tokenUrl;
    @Column(length = 300) private String scope;
    /** Password, token, header value or client secret, sealed with SecretBox. */
    @Column(columnDefinition = "TEXT") private String secretEnc;
    /** JSON object: our field name -> the broker's field name (ARI push). */
    @Column(columnDefinition = "TEXT") private String fieldMap;
    /** Daily send hour (0-23, branch time) for rate files and the full availability sync; -1 = none. */
    private int dailyHour = 3;
    private int days = 60;
    private int minIntervalSeconds = 300;
    private boolean onPublish = true;
    private boolean enabled = true;
    private int lastRateVersion;
    @Column(length = 64) private String lastPayloadHash;
    private Instant lastSentAt;
    private Instant lastDailyAt;
    @Column(length = 400) private String lastResult;
    private boolean lastOk;
    @Column(length = 120) private String createdBy;
    @Column(nullable = false) private Instant createdAt = Instant.now();
}
