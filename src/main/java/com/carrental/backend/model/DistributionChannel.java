package com.carrental.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "distribution_channels")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DistributionChannel {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(name = "channel_name", nullable = false)
    private String channelName; // e.g., "Skyscanner", "DiscoverCars", "Booking.com"

    @Column(name = "channel_code", length = 50)
    private String channelCode; // short partner code used in inbound XML, e.g. "BKG"

    @Column(name = "channel_type", nullable = false)
    @Enumerated(EnumType.STRING)
    private ChannelType channelType;

    @Column(name = "is_active")
    private boolean isActive = true;

    @Column(name = "commission_type")
    @Enumerated(EnumType.STRING)
    private CommissionType commissionType = CommissionType.PERCENTAGE;

    @Column(name = "commission_value")
    private Double commissionValue; // Percentage or fixed amount

    @Column(name = "currency", length = 3)
    private String currency = "USD";

    // API Configuration
    @Column(name = "api_endpoint")
    private String apiEndpoint;

    @Column(name = "api_username")
    private String apiUsername;

    @Column(name = "api_password")
    private String apiPassword;

    @Column(name = "api_key", length = 500)
    private String apiKey;

    @Column(name = "company_code")
    private String companyCode; // Your company code in their system

    // Connection Details
    @Column(name = "connection_type")
    @Enumerated(EnumType.STRING)
    private ConnectionType connectionType = ConnectionType.API;

    @Column(name = "xml_feed_url")
    private String xmlFeedUrl; // For XML-based channels

    @Column(name = "webhook_url")
    private String webhookUrl;

    // Rate Management
    @Column(name = "markup_type")
    @Enumerated(EnumType.STRING)
    private MarkupType markupType = MarkupType.PERCENTAGE;

    @Column(name = "markup_value")
    private Double markupValue; // Markup on base rates

    @Column(name = "minimum_rate")
    private Double minimumRate;

    // Availability & Inventory
    @Column(name = "auto_sync_inventory")
    private boolean autoSyncInventory = true;

    @Column(name = "sync_frequency_minutes")
    private Integer syncFrequencyMinutes = 15;

    @Column(name = "last_sync_at")
    private LocalDateTime lastSyncAt;

    @Column(name = "sync_status")
    @Enumerated(EnumType.STRING)
    private SyncStatus syncStatus = SyncStatus.PENDING;

    // Booking Settings
    @Column(name = "instant_booking_enabled")
    private boolean instantBookingEnabled = true;

    @Column(name = "require_approval")
    private boolean requireApproval = false;

    @Column(name = "prepayment_required")
    private boolean prepaymentRequired = false;

    @Column(name = "cancellation_policy")
    private String cancellationPolicy;

    // Extras & Options
    @Column(name = "show_extras")
    private boolean showExtras = true;

    @Column(name = "show_insurance")
    private boolean showInsurance = true;

    // Contact Information
    @Column(name = "contact_name")
    private String contactName;

    @Column(name = "contact_email")
    private String contactEmail;

    @Column(name = "contact_phone")
    private String contactPhone;

    // Statistics
    @Column(name = "total_bookings")
    private Long totalBookings = 0L;

    @Column(name = "total_revenue")
    private Double totalRevenue = 0.0;

    @Column(name = "average_booking_value")
    private Double averageBookingValue = 0.0;

    // Metadata
    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "last_booking_at")
    private LocalDateTime lastBookingAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public enum ChannelType {
        OTA,              // Online Travel Agency (Booking.com, Expedia)
        METASEARCH,       // Metasearch (Skyscanner, Kayak)
        AGGREGATOR,       // Car Rental Aggregators (DiscoverCars, Rentalcars.com)
        CORPORATE,        // Corporate Direct
        DIRECT,           // Direct Website
        GDS,              // Global Distribution System
        AFFILIATE,        // Affiliate Partners
        WHOLESALE         // Wholesale Partners
    }

    public enum CommissionType {
        PERCENTAGE,       // Commission as percentage
        FIXED_AMOUNT,     // Fixed amount per booking
        TIERED            // Tiered based on volume
    }

    public enum ConnectionType {
        API,              // REST API
        XML_FEED,         // XML Feed
        MANUAL,           // Manual Entry
        CSV_IMPORT,       // CSV Import
        WEBSERVICE        // SOAP Web Service
    }

    public enum MarkupType {
        PERCENTAGE,       // Markup as percentage
        FIXED_AMOUNT,     // Fixed amount markup
        DYNAMIC           // Dynamic pricing
    }

    public enum SyncStatus {
        PENDING,
        IN_PROGRESS,
        SUCCESS,
        FAILED,
        DISABLED
    }
}
