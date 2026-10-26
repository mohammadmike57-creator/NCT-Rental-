package com.carrental.backend.ota;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/** Webhook signing secret per channel. Kept on the server only; shown to staff once when created. */
@Entity
@Table(name = "channel_secret")
@Getter @Setter
public class ChannelSecret {
    @Id @Column(length = 100) private String channelId;
    @Column(nullable = false, length = 100) private String webhookSecret;
    @Column(nullable = false) private Instant createdAt;
}
