package com.carrental.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "channel_rate_plans", indexes = {
    @Index(name = "idx_crp_channel_id", columnList = "channel_id"),
    @Index(name = "idx_crp_vehicle_category", columnList = "vehicle_category"),
    @Index(name = "idx_crp_date_range", columnList = "start_date,end_date")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChannelRatePlan {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @ManyToOne
    @JoinColumn(name = "channel_id", nullable = false)
    private DistributionChannel channel;

    @Column(name = "rate_plan_name", nullable = false)
    private String ratePlanName; // e.g., "Summer 2025", "Winter Special"

    @Column(name = "rate_plan_code")
    private String ratePlanCode; // External system code

    @Column(name = "vehicle_category", nullable = false)
    private String vehicleCategory; // SIPP code or category

    @Column(name = "vehicle_type")
    private String vehicleType; // Economy, Compact, SUV, etc.

    // Date Range
    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    // Pricing Tiers (Duration-based)
    @Column(name = "daily_rate_1_3_days", precision = 10, scale = 2)
    private BigDecimal dailyRate1To3Days; // 1-3 days

    @Column(name = "daily_rate_4_7_days", precision = 10, scale = 2)
    private BigDecimal dailyRate4To7Days; // 4-7 days

    @Column(name = "daily_rate_8_14_days", precision = 10, scale = 2)
    private BigDecimal dailyRate8To14Days; // 8-14 days

    @Column(name = "daily_rate_15_21_days", precision = 10, scale = 2)
    private BigDecimal dailyRate15To21Days; // 15-21 days

    @Column(name = "daily_rate_22_30_days", precision = 10, scale = 2)
    private BigDecimal dailyRate22To30Days; // 22-30 days

    @Column(name = "daily_rate_31_plus_days", precision = 10, scale = 2)
    private BigDecimal dailyRate31PlusDays; // 31+ days

    @Column(name = "weekly_rate", precision = 10, scale = 2)
    private BigDecimal weeklyRate; // 7-day rate

    @Column(name = "monthly_rate", precision = 10, scale = 2)
    private BigDecimal monthlyRate; // 30-day rate

    // Additional Charges
    @Column(name = "airport_fee", precision = 10, scale = 2)
    private BigDecimal airportFee;

    @Column(name = "young_driver_fee", precision = 10, scale = 2)
    private BigDecimal youngDriverFee;

    @Column(name = "additional_driver_fee", precision = 10, scale = 2)
    private BigDecimal additionalDriverFee;

    @Column(name = "one_way_fee", precision = 10, scale = 2)
    private BigDecimal oneWayFee;

    // Deposits
    @Column(name = "security_deposit", precision = 10, scale = 2)
    private BigDecimal securityDeposit;

    @Column(name = "excess_amount", precision = 10, scale = 2)
    private BigDecimal excessAmount;

    // Mileage
    @Column(name = "included_mileage_per_day")
    private Integer includedMileagePerDay; // 0 = unlimited

    @Column(name = "extra_mileage_charge", precision = 10, scale = 2)
    private BigDecimal extraMileageCharge;

    // Minimum/Maximum
    @Column(name = "minimum_rental_days")
    private Integer minimumRentalDays = 1;

    @Column(name = "maximum_rental_days")
    private Integer maximumRentalDays = 90;

    // Restrictions
    @Column(name = "minimum_driver_age")
    private Integer minimumDriverAge = 21;

    @Column(name = "maximum_driver_age")
    private Integer maximumDriverAge = 75;

    // Status
    @Column(name = "is_active")
    private boolean isActive = true;

    @Column(name = "is_published")
    private boolean isPublished = false;

    @Column(name = "priority")
    private Integer priority = 0; // Higher priority shown first

    // Currency
    @Column(name = "currency", length = 3)
    private String currency = "USD";

    // Special Offers
    @Column(name = "is_special_offer")
    private boolean isSpecialOffer = false;

    @Column(name = "discount_percentage")
    private Double discountPercentage;

    @Column(name = "promo_code")
    private String promoCode;

    // Availability
    @Column(name = "available_quantity")
    private Integer availableQuantity; // Number of vehicles available

    @Column(name = "stop_sale")
    private boolean stopSale = false; // Temporarily stop selling

    // Metadata
    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "created_by")
    private String createdBy;

    @Column(name = "last_modified_by")
    private String lastModifiedBy;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    /**
     * Calculate daily rate based on rental duration
     */
    public BigDecimal getDailyRateForDuration(int days) {
        if (days <= 3) return dailyRate1To3Days;
        if (days <= 7) return dailyRate4To7Days;
        if (days <= 14) return dailyRate8To14Days;
        if (days <= 21) return dailyRate15To21Days;
        if (days <= 30) return dailyRate22To30Days;
        return dailyRate31PlusDays;
    }

    /**
     * Calculate total cost for rental duration
     */
    public BigDecimal calculateTotalCost(int days) {
        BigDecimal dailyRate = getDailyRateForDuration(days);
        if (dailyRate == null) return BigDecimal.ZERO;
        return dailyRate.multiply(BigDecimal.valueOf(days));
    }
}
