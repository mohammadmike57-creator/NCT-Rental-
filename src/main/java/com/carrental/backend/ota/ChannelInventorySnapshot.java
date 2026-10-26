package com.carrental.backend.ota;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/** The last inventory sent to a broker (as a hash), so inventory.updated only goes out when something changed. */
@Entity
@Table(name = "channel_inventory_snapshot")
@Getter @Setter
public class ChannelInventorySnapshot {
    @Id @Column(length = 100) private String channelId;
    @Column(nullable = false, length = 64) private String hash;
    @Column(nullable = false) private Instant sentAt;
    @Column(nullable = false) private Instant checkedAt;
}
