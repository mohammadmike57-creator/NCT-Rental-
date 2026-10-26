package com.carrental.backend.ota;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;

/**
 * The channel gateway's own data model. OTA XML, native XML and REST/JSON requests are all
 * translated into these records and answered from them, so no partner's format leaks into the core.
 */
public final class ChannelModels {
    private ChannelModels() {}

    public record ExtraRequest(String code, int quantity) {}

    public record Search(String pickupLocation, String returnLocation, LocalDateTime pickupAt, LocalDateTime returnAt,
                         Integer driverAge, String driverCountry, String vehicleGroup, List<ExtraRequest> extras) {}

    public record PriceLine(String type, String code, String description, BigDecimal unitAmount, int quantity, BigDecimal amount) {}

    public record Offer(String offerId, String vehicleGroup, String groupName, String modelExample, String category,
                        String transmission, boolean airCon, String status, int available, String closedReason,
                        int rentalDays, String currency, BigDecimal baseAmount, BigDecimal extrasAmount, BigDecimal feesAmount,
                        BigDecimal taxAmount, boolean taxIncluded, BigDecimal totalAmount, List<PriceLine> breakdown,
                        BigDecimal depositAmount, BigDecimal excessAmount, String cancellationPolicy, String paymentType,
                        Instant expiresAt, boolean held) {}

    public record Customer(String title, String firstName, String lastName, String email, String phone, String country) {
        public String fullName() {
            return ((firstName == null ? "" : firstName) + " " + (lastName == null ? "" : lastName)).trim();
        }
    }

    public record Driver(String firstName, String lastName, String dateOfBirth, String licenceNumber, String licenceCountry) {}

    public record BookingRequest(String offerId, String brokerReference, String idempotencyKey, Search search,
                                 Customer customer, Driver driver, BigDecimal expectedTotal, String comments, String flightNumber) {}

    public record ModifyRequest(String reservation, Search search, Customer customer, Driver driver, BigDecimal expectedTotal, String comments) {}

    public record Reservation(String reservationId, String brokerReference, String status, String channelCode,
                              String vehicleGroup, String vehicleDescription, String pickupLocation, String returnLocation,
                              LocalDateTime pickupAt, LocalDateTime returnAt, int rentalDays, String currency,
                              BigDecimal baseAmount, BigDecimal extrasAmount, BigDecimal feesAmount, BigDecimal totalAmount,
                              List<PriceLine> breakdown, String paymentType, String paymentStatus, String cancellationPolicy,
                              Customer customer, Driver driver, String assignedVehicle, Instant createdAt,
                              BigDecimal cancellationFee, BigDecimal refundAmount, String refundStatus, boolean sandbox) {}

    public record Location(String code, String name, String address, boolean pickup, boolean dropOff) {}

    public record VehicleGroup(String code, String name, String category, String modelExample, String transmission,
                               boolean airCon, int fleetSize, BigDecimal depositAmount, BigDecimal excessAmount) {}

    public record Extra(String code, String name, BigDecimal dailyPrice, BigDecimal maxPerRental) {}
}
