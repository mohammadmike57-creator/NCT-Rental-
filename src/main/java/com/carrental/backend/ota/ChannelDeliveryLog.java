package com.carrental.backend.ota;

import jakarta.persistence.*;

import java.time.Instant;

/** Audit record of every XML exchange with a partner, in either direction. */
@Entity
@Table(name = "channel_delivery_log", indexes = @Index(name = "idx_cdl_channel_created", columnList = "channelId,createdAt"))
public class ChannelDeliveryLog {

    public enum Direction { OUTBOUND, INBOUND }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String channelId;

    @Column(length = 200)
    private String channelName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Direction direction;

    @Column(nullable = false, length = 50)
    private String messageType;

    private Integer version;
    private Integer httpStatus;
    private boolean success;
    private long durationMs;
    private long requestBytes;

    @Column(length = 1000)
    private String error;

    @Column(length = 1000)
    private String responseSnippet;

    @Column(length = 200)
    private String actor; // staff email for pushes, remote address for partner requests

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    public static String clip(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }

    public Long getId() { return id; }
    public String getChannelId() { return channelId; }
    public void setChannelId(String channelId) { this.channelId = channelId; }
    public String getChannelName() { return channelName; }
    public void setChannelName(String channelName) { this.channelName = clip(channelName, 200); }
    public Direction getDirection() { return direction; }
    public void setDirection(Direction direction) { this.direction = direction; }
    public String getMessageType() { return messageType; }
    public void setMessageType(String messageType) { this.messageType = messageType; }
    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }
    public Integer getHttpStatus() { return httpStatus; }
    public void setHttpStatus(Integer httpStatus) { this.httpStatus = httpStatus; }
    public boolean isSuccess() { return success; }
    public void setSuccess(boolean success) { this.success = success; }
    public long getDurationMs() { return durationMs; }
    public void setDurationMs(long durationMs) { this.durationMs = durationMs; }
    public long getRequestBytes() { return requestBytes; }
    public void setRequestBytes(long requestBytes) { this.requestBytes = requestBytes; }
    public String getError() { return error; }
    public void setError(String error) { this.error = clip(error, 1000); }
    public String getResponseSnippet() { return responseSnippet; }
    public void setResponseSnippet(String responseSnippet) { this.responseSnippet = clip(responseSnippet, 1000); }
    public String getActor() { return actor; }
    public void setActor(String actor) { this.actor = clip(actor, 200); }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
