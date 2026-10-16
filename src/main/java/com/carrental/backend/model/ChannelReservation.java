package com.carrental.backend.model;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Channel Reservation - Tracks reservations received from external distribution channels
 * Supports: Booking.com, Expedia, Skyscanner, DiscoverCars, Rentalcars.com, etc.
 */
@Entity
@Table(name = "channel_reservations", indexes = {
    @Index(name = "idx_cres_channel_confirmation", columnList = "channelConfirmationNumber"),
    @Index(name = "idx_cres_internal_confirmation", columnList = "internalConfirmationNumber"),
    @Index(name = "idx_cres_channel_id", columnList = "channel_id"),
    @Index(name = "idx_cres_reservation_status", columnList = "reservationStatus"),
    @Index(name = "idx_cres_pickup_date", columnList = "pickupDate")
})
public class ChannelReservation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    // Channel identification
    @ManyToOne
    @JoinColumn(name = "channel_id")
    private DistributionChannel channel;

    private String channelCode; // e.g., "BOOKING", "EXPEDIA"
    private String channelName; // e.g., "Booking.com"
    private String channelConfirmationNumber; // Confirmation from external channel
    private String internalConfirmationNumber; // Our internal confirmation (RSV-2025-00001)

    // Reservation type and status
    @Enumerated(EnumType.STRING)
    private ReservationType reservationType; // NEW, MODIFICATION, CANCELLATION

    @Enumerated(EnumType.STRING)
    private ReservationStatus reservationStatus;

    // Rental period
    private LocalDate pickupDate;
    private LocalDateTime pickupDateTime;
    private String pickupLocationCode;
    private String pickupLocationName;

    private LocalDate returnDate;
    private LocalDateTime returnDateTime;
    private String returnLocationCode;
    private String returnLocationName;

    // Vehicle details
    private String vehicleCategory; // SIPP code (e.g., ECAR, CDAR)
    private String vehicleType;
    private String vehicleSize;
    private String vehicleModel;
    private String requestedVehicle; // Customer's preference

    @ManyToOne
    @JoinColumn(name = "assigned_vehicle_id")
    private Vehicle assignedVehicle; // Actual vehicle assigned (if confirmed)

    // Customer information
    private String customerTitle;
    private String customerFirstName;
    private String customerLastName;
    private String customerFullName;
    private String customerEmail;
    private String customerPhone;

    // Customer address
    private String customerAddress;
    private String customerCity;
    private String customerPostalCode;
    private String customerCountry;

    // License information
    private String licenseNumber;
    private String licenseType;
    private String licenseCountry;
    private LocalDate licenseExpiryDate;

    // Driver details
    private Integer driverAge;
    private Integer additionalDriversCount;

    // Pricing information
    private String rateCode;

    @Column(name = "external_rate_plan_id")
    private String ratePlanId; // the partner's own rate plan code from the XML

    @ManyToOne
    @JoinColumn(name = "rate_plan_id")
    private ChannelRatePlan ratePlan;

    private BigDecimal dailyRate;
    private BigDecimal baseRentalCost;
    private BigDecimal airportFee;
    private BigDecimal youngDriverFee;
    private BigDecimal additionalDriverFee;
    private BigDecimal insuranceFee;
    private BigDecimal taxAmount;
    private BigDecimal totalAmount;
    private String currency;

    // Commission details
    private BigDecimal channelCommissionAmount;
    private BigDecimal channelCommissionPercent;
    private BigDecimal netRevenue; // totalAmount - channelCommissionAmount

    // Payment information
    @Enumerated(EnumType.STRING)
    private PaymentMethod paymentMethod;

    private boolean prepaid; // Paid to channel vs. pay at pickup
    private String paymentReference;

    @ManyToOne
    @JoinColumn(name = "payment_id")
    private Payment payment; // Link to actual payment record

    // Insurance/coverage selections
    @Column(columnDefinition = "TEXT")
    private String insuranceOptions; // JSON: {"CDW": true, "TP": true, "PAI": false}

    // Special requests and notes
    @Column(columnDefinition = "TEXT")
    private String specialRequests;

    private String flightNumber;

    @Column(columnDefinition = "TEXT")
    private String internalNotes;

    // XML data storage (for audit and debugging)
    @Column(columnDefinition = "TEXT")
    private String rawXmlRequest; // Original XML received

    @Column(columnDefinition = "TEXT")
    private String rawXmlResponse; // XML response sent back

    // Modification tracking
    private String originalReservationId; // For MODIFICATION type
    private LocalDateTime modifiedAt;
    private String modificationReason;

    // Cancellation tracking
    private LocalDateTime cancelledAt;
    private String cancellationReason;
    private BigDecimal cancellationFeeAmount;
    private BigDecimal cancellationFeePercent;
    private LocalDateTime cancellationDeadline;
    private BigDecimal refundAmount;

    // System tracking
    private LocalDateTime receivedAt; // When XML was received
    private LocalDateTime processedAt; // When reservation was processed
    private LocalDateTime confirmedAt; // When confirmation was sent
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @ManyToOne
    @JoinColumn(name = "created_by")
    private User createdBy; // System user for channel reservations

    // Status flags
    private boolean requiresManualReview;
    private String reviewReason;
    private boolean emailConfirmationSent;
    private boolean channelConfirmationSent;

    // Link to internal reservation (if converted)
    @OneToOne
    @JoinColumn(name = "reservation_id")
    private Reservation internalReservation;

    public enum ReservationType {
        NEW,
        MODIFICATION,
        CANCELLATION
    }

    public enum ReservationStatus {
        RECEIVED,           // Just received from channel
        PENDING_REVIEW,     // Requires manual review
        CONFIRMED,          // Confirmed and assigned
        PROCESSING,         // Being processed
        ACTIVE,            // Currently active rental
        COMPLETED,         // Rental completed
        CANCELLED,         // Cancelled
        REJECTED,          // Rejected due to unavailability
        MODIFIED,          // Modified successfully
        NO_SHOW            // Customer didn't show up
    }

    public enum PaymentMethod {
        CREDIT_CARD,
        DEBIT_CARD,
        PREPAID,
        PAY_AT_PICKUP,
        INVOICE,
        OTHER
    }

    // Constructors
    public ChannelReservation() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
        this.reservationStatus = ReservationStatus.RECEIVED;
        this.requiresManualReview = false;
        this.emailConfirmationSent = false;
        this.channelConfirmationSent = false;
        this.prepaid = false;
    }

    // Getters and Setters
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public DistributionChannel getChannel() {
        return channel;
    }

    public void setChannel(DistributionChannel channel) {
        this.channel = channel;
    }

    public String getChannelCode() {
        return channelCode;
    }

    public void setChannelCode(String channelCode) {
        this.channelCode = channelCode;
    }

    public String getChannelName() {
        return channelName;
    }

    public void setChannelName(String channelName) {
        this.channelName = channelName;
    }

    public String getChannelConfirmationNumber() {
        return channelConfirmationNumber;
    }

    public void setChannelConfirmationNumber(String channelConfirmationNumber) {
        this.channelConfirmationNumber = channelConfirmationNumber;
    }

    public String getInternalConfirmationNumber() {
        return internalConfirmationNumber;
    }

    public void setInternalConfirmationNumber(String internalConfirmationNumber) {
        this.internalConfirmationNumber = internalConfirmationNumber;
    }

    public ReservationType getReservationType() {
        return reservationType;
    }

    public void setReservationType(ReservationType reservationType) {
        this.reservationType = reservationType;
    }

    public ReservationStatus getReservationStatus() {
        return reservationStatus;
    }

    public void setReservationStatus(ReservationStatus reservationStatus) {
        this.reservationStatus = reservationStatus;
    }

    public LocalDate getPickupDate() {
        return pickupDate;
    }

    public void setPickupDate(LocalDate pickupDate) {
        this.pickupDate = pickupDate;
    }

    public LocalDateTime getPickupDateTime() {
        return pickupDateTime;
    }

    public void setPickupDateTime(LocalDateTime pickupDateTime) {
        this.pickupDateTime = pickupDateTime;
    }

    public String getPickupLocationCode() {
        return pickupLocationCode;
    }

    public void setPickupLocationCode(String pickupLocationCode) {
        this.pickupLocationCode = pickupLocationCode;
    }

    public String getPickupLocationName() {
        return pickupLocationName;
    }

    public void setPickupLocationName(String pickupLocationName) {
        this.pickupLocationName = pickupLocationName;
    }

    public LocalDate getReturnDate() {
        return returnDate;
    }

    public void setReturnDate(LocalDate returnDate) {
        this.returnDate = returnDate;
    }

    public LocalDateTime getReturnDateTime() {
        return returnDateTime;
    }

    public void setReturnDateTime(LocalDateTime returnDateTime) {
        this.returnDateTime = returnDateTime;
    }

    public String getReturnLocationCode() {
        return returnLocationCode;
    }

    public void setReturnLocationCode(String returnLocationCode) {
        this.returnLocationCode = returnLocationCode;
    }

    public String getReturnLocationName() {
        return returnLocationName;
    }

    public void setReturnLocationName(String returnLocationName) {
        this.returnLocationName = returnLocationName;
    }

    public String getVehicleCategory() {
        return vehicleCategory;
    }

    public void setVehicleCategory(String vehicleCategory) {
        this.vehicleCategory = vehicleCategory;
    }

    public String getVehicleType() {
        return vehicleType;
    }

    public void setVehicleType(String vehicleType) {
        this.vehicleType = vehicleType;
    }

    public String getVehicleSize() {
        return vehicleSize;
    }

    public void setVehicleSize(String vehicleSize) {
        this.vehicleSize = vehicleSize;
    }

    public String getVehicleModel() {
        return vehicleModel;
    }

    public void setVehicleModel(String vehicleModel) {
        this.vehicleModel = vehicleModel;
    }

    public String getRequestedVehicle() {
        return requestedVehicle;
    }

    public void setRequestedVehicle(String requestedVehicle) {
        this.requestedVehicle = requestedVehicle;
    }

    public Vehicle getAssignedVehicle() {
        return assignedVehicle;
    }

    public void setAssignedVehicle(Vehicle assignedVehicle) {
        this.assignedVehicle = assignedVehicle;
    }

    public String getCustomerTitle() {
        return customerTitle;
    }

    public void setCustomerTitle(String customerTitle) {
        this.customerTitle = customerTitle;
    }

    public String getCustomerFirstName() {
        return customerFirstName;
    }

    public void setCustomerFirstName(String customerFirstName) {
        this.customerFirstName = customerFirstName;
    }

    public String getCustomerLastName() {
        return customerLastName;
    }

    public void setCustomerLastName(String customerLastName) {
        this.customerLastName = customerLastName;
    }

    public String getCustomerFullName() {
        return customerFullName;
    }

    public void setCustomerFullName(String customerFullName) {
        this.customerFullName = customerFullName;
    }

    public String getCustomerEmail() {
        return customerEmail;
    }

    public void setCustomerEmail(String customerEmail) {
        this.customerEmail = customerEmail;
    }

    public String getCustomerPhone() {
        return customerPhone;
    }

    public void setCustomerPhone(String customerPhone) {
        this.customerPhone = customerPhone;
    }

    public String getCustomerAddress() {
        return customerAddress;
    }

    public void setCustomerAddress(String customerAddress) {
        this.customerAddress = customerAddress;
    }

    public String getCustomerCity() {
        return customerCity;
    }

    public void setCustomerCity(String customerCity) {
        this.customerCity = customerCity;
    }

    public String getCustomerPostalCode() {
        return customerPostalCode;
    }

    public void setCustomerPostalCode(String customerPostalCode) {
        this.customerPostalCode = customerPostalCode;
    }

    public String getCustomerCountry() {
        return customerCountry;
    }

    public void setCustomerCountry(String customerCountry) {
        this.customerCountry = customerCountry;
    }

    public String getLicenseNumber() {
        return licenseNumber;
    }

    public void setLicenseNumber(String licenseNumber) {
        this.licenseNumber = licenseNumber;
    }

    public String getLicenseType() {
        return licenseType;
    }

    public void setLicenseType(String licenseType) {
        this.licenseType = licenseType;
    }

    public String getLicenseCountry() {
        return licenseCountry;
    }

    public void setLicenseCountry(String licenseCountry) {
        this.licenseCountry = licenseCountry;
    }

    public LocalDate getLicenseExpiryDate() {
        return licenseExpiryDate;
    }

    public void setLicenseExpiryDate(LocalDate licenseExpiryDate) {
        this.licenseExpiryDate = licenseExpiryDate;
    }

    public Integer getDriverAge() {
        return driverAge;
    }

    public void setDriverAge(Integer driverAge) {
        this.driverAge = driverAge;
    }

    public Integer getAdditionalDriversCount() {
        return additionalDriversCount;
    }

    public void setAdditionalDriversCount(Integer additionalDriversCount) {
        this.additionalDriversCount = additionalDriversCount;
    }

    public String getRateCode() {
        return rateCode;
    }

    public void setRateCode(String rateCode) {
        this.rateCode = rateCode;
    }

    public String getRatePlanId() {
        return ratePlanId;
    }

    public void setRatePlanId(String ratePlanId) {
        this.ratePlanId = ratePlanId;
    }

    public ChannelRatePlan getRatePlan() {
        return ratePlan;
    }

    public void setRatePlan(ChannelRatePlan ratePlan) {
        this.ratePlan = ratePlan;
    }

    public BigDecimal getDailyRate() {
        return dailyRate;
    }

    public void setDailyRate(BigDecimal dailyRate) {
        this.dailyRate = dailyRate;
    }

    public BigDecimal getBaseRentalCost() {
        return baseRentalCost;
    }

    public void setBaseRentalCost(BigDecimal baseRentalCost) {
        this.baseRentalCost = baseRentalCost;
    }

    public BigDecimal getAirportFee() {
        return airportFee;
    }

    public void setAirportFee(BigDecimal airportFee) {
        this.airportFee = airportFee;
    }

    public BigDecimal getYoungDriverFee() {
        return youngDriverFee;
    }

    public void setYoungDriverFee(BigDecimal youngDriverFee) {
        this.youngDriverFee = youngDriverFee;
    }

    public BigDecimal getAdditionalDriverFee() {
        return additionalDriverFee;
    }

    public void setAdditionalDriverFee(BigDecimal additionalDriverFee) {
        this.additionalDriverFee = additionalDriverFee;
    }

    public BigDecimal getInsuranceFee() {
        return insuranceFee;
    }

    public void setInsuranceFee(BigDecimal insuranceFee) {
        this.insuranceFee = insuranceFee;
    }

    public BigDecimal getTaxAmount() {
        return taxAmount;
    }

    public void setTaxAmount(BigDecimal taxAmount) {
        this.taxAmount = taxAmount;
    }

    public BigDecimal getTotalAmount() {
        return totalAmount;
    }

    public void setTotalAmount(BigDecimal totalAmount) {
        this.totalAmount = totalAmount;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }

    public BigDecimal getChannelCommissionAmount() {
        return channelCommissionAmount;
    }

    public void setChannelCommissionAmount(BigDecimal channelCommissionAmount) {
        this.channelCommissionAmount = channelCommissionAmount;
    }

    public BigDecimal getChannelCommissionPercent() {
        return channelCommissionPercent;
    }

    public void setChannelCommissionPercent(BigDecimal channelCommissionPercent) {
        this.channelCommissionPercent = channelCommissionPercent;
    }

    public BigDecimal getNetRevenue() {
        return netRevenue;
    }

    public void setNetRevenue(BigDecimal netRevenue) {
        this.netRevenue = netRevenue;
    }

    public PaymentMethod getPaymentMethod() {
        return paymentMethod;
    }

    public void setPaymentMethod(PaymentMethod paymentMethod) {
        this.paymentMethod = paymentMethod;
    }

    public boolean isPrepaid() {
        return prepaid;
    }

    public void setPrepaid(boolean prepaid) {
        this.prepaid = prepaid;
    }

    public String getPaymentReference() {
        return paymentReference;
    }

    public void setPaymentReference(String paymentReference) {
        this.paymentReference = paymentReference;
    }

    public Payment getPayment() {
        return payment;
    }

    public void setPayment(Payment payment) {
        this.payment = payment;
    }

    public String getInsuranceOptions() {
        return insuranceOptions;
    }

    public void setInsuranceOptions(String insuranceOptions) {
        this.insuranceOptions = insuranceOptions;
    }

    public String getSpecialRequests() {
        return specialRequests;
    }

    public void setSpecialRequests(String specialRequests) {
        this.specialRequests = specialRequests;
    }

    public String getFlightNumber() {
        return flightNumber;
    }

    public void setFlightNumber(String flightNumber) {
        this.flightNumber = flightNumber;
    }

    public String getInternalNotes() {
        return internalNotes;
    }

    public void setInternalNotes(String internalNotes) {
        this.internalNotes = internalNotes;
    }

    public String getRawXmlRequest() {
        return rawXmlRequest;
    }

    public void setRawXmlRequest(String rawXmlRequest) {
        this.rawXmlRequest = rawXmlRequest;
    }

    public String getRawXmlResponse() {
        return rawXmlResponse;
    }

    public void setRawXmlResponse(String rawXmlResponse) {
        this.rawXmlResponse = rawXmlResponse;
    }

    public String getOriginalReservationId() {
        return originalReservationId;
    }

    public void setOriginalReservationId(String originalReservationId) {
        this.originalReservationId = originalReservationId;
    }

    public LocalDateTime getModifiedAt() {
        return modifiedAt;
    }

    public void setModifiedAt(LocalDateTime modifiedAt) {
        this.modifiedAt = modifiedAt;
    }

    public String getModificationReason() {
        return modificationReason;
    }

    public void setModificationReason(String modificationReason) {
        this.modificationReason = modificationReason;
    }

    public LocalDateTime getCancelledAt() {
        return cancelledAt;
    }

    public void setCancelledAt(LocalDateTime cancelledAt) {
        this.cancelledAt = cancelledAt;
    }

    public String getCancellationReason() {
        return cancellationReason;
    }

    public void setCancellationReason(String cancellationReason) {
        this.cancellationReason = cancellationReason;
    }

    public BigDecimal getCancellationFeeAmount() {
        return cancellationFeeAmount;
    }

    public void setCancellationFeeAmount(BigDecimal cancellationFeeAmount) {
        this.cancellationFeeAmount = cancellationFeeAmount;
    }

    public BigDecimal getCancellationFeePercent() {
        return cancellationFeePercent;
    }

    public void setCancellationFeePercent(BigDecimal cancellationFeePercent) {
        this.cancellationFeePercent = cancellationFeePercent;
    }

    public LocalDateTime getCancellationDeadline() {
        return cancellationDeadline;
    }

    public void setCancellationDeadline(LocalDateTime cancellationDeadline) {
        this.cancellationDeadline = cancellationDeadline;
    }

    public BigDecimal getRefundAmount() {
        return refundAmount;
    }

    public void setRefundAmount(BigDecimal refundAmount) {
        this.refundAmount = refundAmount;
    }

    public LocalDateTime getReceivedAt() {
        return receivedAt;
    }

    public void setReceivedAt(LocalDateTime receivedAt) {
        this.receivedAt = receivedAt;
    }

    public LocalDateTime getProcessedAt() {
        return processedAt;
    }

    public void setProcessedAt(LocalDateTime processedAt) {
        this.processedAt = processedAt;
    }

    public LocalDateTime getConfirmedAt() {
        return confirmedAt;
    }

    public void setConfirmedAt(LocalDateTime confirmedAt) {
        this.confirmedAt = confirmedAt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    public User getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(User createdBy) {
        this.createdBy = createdBy;
    }

    public boolean isRequiresManualReview() {
        return requiresManualReview;
    }

    public void setRequiresManualReview(boolean requiresManualReview) {
        this.requiresManualReview = requiresManualReview;
    }

    public String getReviewReason() {
        return reviewReason;
    }

    public void setReviewReason(String reviewReason) {
        this.reviewReason = reviewReason;
    }

    public boolean isEmailConfirmationSent() {
        return emailConfirmationSent;
    }

    public void setEmailConfirmationSent(boolean emailConfirmationSent) {
        this.emailConfirmationSent = emailConfirmationSent;
    }

    public boolean isChannelConfirmationSent() {
        return channelConfirmationSent;
    }

    public void setChannelConfirmationSent(boolean channelConfirmationSent) {
        this.channelConfirmationSent = channelConfirmationSent;
    }

    public Reservation getInternalReservation() {
        return internalReservation;
    }

    public void setInternalReservation(Reservation internalReservation) {
        this.internalReservation = internalReservation;
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
