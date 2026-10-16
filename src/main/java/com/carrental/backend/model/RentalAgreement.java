package com.carrental.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "rental_agreements", indexes = {
    @Index(name = "idx_agreement_reservation_id", columnList = "reservation_id"),
    @Index(name = "idx_agreement_number", columnList = "agreement_number"),
    @Index(name = "idx_agreement_customer_email", columnList = "customer_email")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
public class RentalAgreement {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(name = "agreement_number", unique = true, nullable = false)
    private String agreementNumber; // e.g., "AGR-2025-00001"

    @Column(name = "reservation_id")
    private String reservationId;

    // Customer Information
    @Column(name = "customer_full_name", nullable = false)
    private String customerFullName;

    @Column(name = "customer_email", nullable = false)
    private String customerEmail;

    @Column(name = "customer_phone", nullable = false)
    private String customerPhone;

    @Column(name = "customer_address", length = 500)
    private String customerAddress;

    @Column(name = "customer_city")
    private String customerCity;

    @Column(name = "customer_country")
    private String customerCountry;

    @Column(name = "customer_postal_code")
    private String customerPostalCode;

    // Driver License
    @Column(name = "license_number", nullable = false)
    private String licenseNumber;

    @Column(name = "license_country", nullable = false)
    private String licenseCountry;

    @Column(name = "license_issue_date")
    private LocalDate licenseIssueDate;

    @Column(name = "license_expiry_date")
    private LocalDate licenseExpiryDate;

    @Column(name = "driver_age")
    private Integer driverAge;

    // Rental Details
    @Column(name = "pickup_date", nullable = false)
    private LocalDateTime pickupDate;

    @Column(name = "return_date", nullable = false)
    private LocalDateTime returnDate;

    @Column(name = "rental_days")
    private Integer rentalDays;

    @Column(name = "pickup_location", nullable = false)
    private String pickupLocation;

    @Column(name = "return_location", nullable = false)
    private String returnLocation;

    @Column(name = "is_one_way")
    private boolean isOneWay = false;

    // Vehicle Information
    @Column(name = "vehicle_id")
    private String vehicleId;

    @Column(name = "vehicle_make")
    private String vehicleMake;

    @Column(name = "vehicle_model")
    private String vehicleModel;

    @Column(name = "vehicle_year")
    private Integer vehicleYear;

    @Column(name = "vehicle_category")
    private String vehicleCategory;

    @Column(name = "license_plate")
    private String licensePlate;

    @Column(name = "vin_number")
    private String vinNumber;

    @Column(name = "odometer_start")
    private Integer odometerStart;

    @Column(name = "odometer_end")
    private Integer odometerEnd;

    @Column(name = "fuel_level_start")
    private String fuelLevelStart; // FULL, 3/4, 1/2, 1/4, EMPTY

    @Column(name = "fuel_level_end")
    private String fuelLevelEnd;

    // Pricing Breakdown
    @Column(name = "daily_rate", precision = 10, scale = 2, nullable = false)
    private BigDecimal dailyRate;

    @Column(name = "base_rental_cost", precision = 10, scale = 2, nullable = false)
    private BigDecimal baseRentalCost;

    @Column(name = "tax_amount", precision = 10, scale = 2)
    private BigDecimal taxAmount;

    @Column(name = "tax_percentage")
    private Double taxPercentage;

    // Additional Fees
    @Column(name = "airport_fee", precision = 10, scale = 2)
    private BigDecimal airportFee = BigDecimal.ZERO;

    @Column(name = "young_driver_fee", precision = 10, scale = 2)
    private BigDecimal youngDriverFee = BigDecimal.ZERO;

    @Column(name = "additional_driver_fee", precision = 10, scale = 2)
    private BigDecimal additionalDriverFee = BigDecimal.ZERO;

    @Column(name = "one_way_fee", precision = 10, scale = 2)
    private BigDecimal oneWayFee = BigDecimal.ZERO;

    @Column(name = "late_return_fee", precision = 10, scale = 2)
    private BigDecimal lateReturnFee = BigDecimal.ZERO;

    @Column(name = "fuel_charge", precision = 10, scale = 2)
    private BigDecimal fuelCharge = BigDecimal.ZERO;

    @Column(name = "cleaning_fee", precision = 10, scale = 2)
    private BigDecimal cleaningFee = BigDecimal.ZERO;

    @Column(name = "damage_charge", precision = 10, scale = 2)
    private BigDecimal damageCharge = BigDecimal.ZERO;

    // Extras
    @Column(name = "extras_cost", precision = 10, scale = 2)
    private BigDecimal extrasCost = BigDecimal.ZERO;

    @Column(name = "extras_list", columnDefinition = "TEXT")
    private String extrasList; // JSON or comma-separated list

    // Insurance
    @Column(name = "insurance_type")
    private String insuranceType; // CDW, LDW, TP, PAI, etc.

    @Column(name = "insurance_cost", precision = 10, scale = 2)
    private BigDecimal insuranceCost = BigDecimal.ZERO;

    @Column(name = "insurance_coverage_amount", precision = 10, scale = 2)
    private BigDecimal insuranceCoverageAmount;

    // Deposits
    @Column(name = "security_deposit", precision = 10, scale = 2, nullable = false)
    private BigDecimal securityDeposit;

    @Column(name = "deposit_paid", precision = 10, scale = 2)
    private BigDecimal depositPaid = BigDecimal.ZERO;

    @Column(name = "deposit_refunded", precision = 10, scale = 2)
    private BigDecimal depositRefunded = BigDecimal.ZERO;

    @Column(name = "deposit_held", precision = 10, scale = 2)
    private BigDecimal depositHeld = BigDecimal.ZERO;

    @Column(name = "excess_amount", precision = 10, scale = 2)
    private BigDecimal excessAmount;

    // Totals
    @Column(name = "subtotal", precision = 10, scale = 2, nullable = false)
    private BigDecimal subtotal;

    @Column(name = "total_amount", precision = 10, scale = 2, nullable = false)
    private BigDecimal totalAmount;

    @Column(name = "amount_paid", precision = 10, scale = 2)
    private BigDecimal amountPaid = BigDecimal.ZERO;

    @Column(name = "amount_due", precision = 10, scale = 2)
    private BigDecimal amountDue = BigDecimal.ZERO;

    @Column(name = "currency", length = 3)
    private String currency = "USD";

    // Payment Information
    @Column(name = "payment_method")
    @Enumerated(EnumType.STRING)
    private PaymentMethod paymentMethod;

    @Column(name = "payment_status")
    @Enumerated(EnumType.STRING)
    private PaymentStatus paymentStatus = PaymentStatus.PENDING;

    @Column(name = "card_last_four")
    private String cardLastFour;

    @Column(name = "payment_authorization_code")
    private String paymentAuthorizationCode;

    // Mileage Policy
    @Column(name = "included_mileage")
    private Integer includedMileage; // 0 = unlimited

    @Column(name = "extra_mileage_charge", precision = 10, scale = 2)
    private BigDecimal extraMileageCharge;

    @Column(name = "actual_mileage")
    private Integer actualMileage;

    // Terms & Conditions
    @Column(name = "terms_and_conditions", columnDefinition = "TEXT")
    private String termsAndConditions;

    @Column(name = "cancellation_policy", columnDefinition = "TEXT")
    private String cancellationPolicy;

    @Column(name = "fuel_policy", columnDefinition = "TEXT")
    private String fuelPolicy;

    // Signatures
    @Column(name = "customer_signature", columnDefinition = "TEXT")
    private String customerSignature; // Base64 image

    @Column(name = "customer_signed_at")
    private LocalDateTime customerSignedAt;

    @Column(name = "agent_signature", columnDefinition = "TEXT")
    private String agentSignature; // Base64 image

    @Column(name = "agent_name")
    private String agentName;

    @Column(name = "agent_signed_at")
    private LocalDateTime agentSignedAt;

    @Column(name = "ip_address")
    private String ipAddress;

    // Status
    @Column(name = "agreement_status")
    @Enumerated(EnumType.STRING)
    private AgreementStatus agreementStatus = AgreementStatus.DRAFT;

    @Column(name = "is_signed")
    private boolean isSigned = false;

    @Column(name = "is_active")
    private boolean isActive = true;

    // Additional Information
    @Column(name = "special_instructions", columnDefinition = "TEXT")
    private String specialInstructions;

    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    // Timestamps
    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "signed_at")
    private LocalDateTime signedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "voided_at")
    private LocalDateTime voidedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
        generateAgreementNumber();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    private void generateAgreementNumber() {
        if (agreementNumber == null) {
            agreementNumber = "AGR-" + LocalDateTime.now().getYear() + "-"
                + String.format("%08d", System.currentTimeMillis() % 100000000);
        }
    }

    public enum PaymentMethod {
        CREDIT_CARD,
        DEBIT_CARD,
        CASH,
        BANK_TRANSFER,
        PAYPAL,
        STRIPE,
        OTHER
    }

    public enum PaymentStatus {
        PENDING,
        AUTHORIZED,
        PAID,
        PARTIAL,
        REFUNDED,
        FAILED,
        VOIDED
    }

    public enum AgreementStatus {
        DRAFT,
        PENDING_SIGNATURE,
        SIGNED,
        ACTIVE,
        COMPLETED,
        VOIDED,
        CANCELLED
    }

    /**
     * Calculate all totals
     */
    public void calculateTotals() {
        // Base rental cost
        baseRentalCost = dailyRate.multiply(BigDecimal.valueOf(rentalDays));

        // Subtotal (before tax)
        subtotal = baseRentalCost
            .add(airportFee)
            .add(youngDriverFee)
            .add(additionalDriverFee)
            .add(oneWayFee)
            .add(extrasCost)
            .add(insuranceCost);

        // Tax
        if (taxPercentage != null) {
            taxAmount = subtotal.multiply(BigDecimal.valueOf(taxPercentage / 100));
        } else {
            taxAmount = BigDecimal.ZERO;
        }

        // Total
        totalAmount = subtotal.add(taxAmount);

        // Amount due
        amountDue = totalAmount.subtract(amountPaid);
    }
}
