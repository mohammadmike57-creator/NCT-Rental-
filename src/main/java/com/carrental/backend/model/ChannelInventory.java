package com.carrental.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "channel_inventory", indexes = {
    @Index(name = "idx_channel_date", columnList = "channel_id,inventory_date"),
    @Index(name = "idx_vehicle_category", columnList = "vehicle_category")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChannelInventory {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @ManyToOne
    @JoinColumn(name = "channel_id", nullable = false)
    private DistributionChannel channel;

    @Column(name = "vehicle_category", nullable = false)
    private String vehicleCategory;

    @Column(name = "inventory_date", nullable = false)
    private LocalDate inventoryDate;

    // Availability
    @Column(name = "total_available")
    private Integer totalAvailable;

    @Column(name = "total_booked")
    private Integer totalBooked = 0;

    @Column(name = "total_blocked")
    private Integer totalBlocked = 0;

    @Column(name = "remaining_available")
    private Integer remainingAvailable;

    // Stop Sale
    @Column(name = "stop_sale")
    private boolean stopSale = false;

    @Column(name = "stop_sale_reason")
    private String stopSaleReason;

    // Overbooking Settings
    @Column(name = "overbooking_allowed")
    private boolean overbookingAllowed = false;

    @Column(name = "overbooking_percentage")
    private Integer overbookingPercentage = 0;

    // Minimum Stay
    @Column(name = "minimum_stay")
    private Integer minimumStay = 1;

    @Column(name = "maximum_stay")
    private Integer maximumStay = 90;

    // Timestamps
    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "synced_at")
    private LocalDateTime syncedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
        calculateRemainingAvailable();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
        calculateRemainingAvailable();
    }

    private void calculateRemainingAvailable() {
        if (totalAvailable != null) {
            remainingAvailable = totalAvailable - (totalBooked != null ? totalBooked : 0)
                                                - (totalBlocked != null ? totalBlocked : 0);
        }
    }

    public boolean hasAvailability() {
        return !stopSale && remainingAvailable != null && remainingAvailable > 0;
    }
}
