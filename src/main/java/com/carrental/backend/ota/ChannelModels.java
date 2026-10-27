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

    /** A search or booking itinerary. coverages = optional cover codes chosen; promoCode = a promotion agreed with the broker. */
    public record Search(String pickupLocation, String returnLocation, LocalDateTime pickupAt, LocalDateTime returnAt,
                         Integer driverAge, String driverCountry, String vehicleGroup, List<ExtraRequest> extras,
                         List<String> coverages, String promoCode, String currency) {
        public Search(String pickupLocation, String returnLocation, LocalDateTime pickupAt, LocalDateTime returnAt,
                      Integer driverAge, String driverCountry, String vehicleGroup, List<ExtraRequest> extras) {
            this(pickupLocation, returnLocation, pickupAt, returnAt, driverAge, driverCountry, vehicleGroup, extras, null, null, null);
        }
        public Search(String pickupLocation, String returnLocation, LocalDateTime pickupAt, LocalDateTime returnAt,
                      Integer driverAge, String driverCountry, String vehicleGroup, List<ExtraRequest> extras, List<String> coverages, String promoCode) {
            this(pickupLocation, returnLocation, pickupAt, returnAt, driverAge, driverCountry, vehicleGroup, extras, coverages, promoCode, null);
        }
        public List<String> coverageCodes() { return coverages == null ? List.of() : coverages; }
        public Search with(Integer age) {
            return new Search(pickupLocation, returnLocation, pickupAt, returnAt, age, driverCountry, vehicleGroup, extras, coverages, promoCode, currency);
        }
        public Search inCurrency(String cur) {
            return new Search(pickupLocation, returnLocation, pickupAt, returnAt, driverAge, driverCountry, vehicleGroup, extras, coverages, promoCode, cur);
        }
    }

    /** One step of the cancellation schedule: from `from` (hoursBefore pick-up) the fee is percent of the booking. */
    public record Penalty(LocalDateTime from, int hoursBefore, BigDecimal percent, BigDecimal amount) {}

    /** What the broker shows for a car group (from the channel's group details, the SIPP code and the fleet). */
    public record VehicleInfo(int seats, int doors, int largeBags, int smallBags, String fuel, String pictureUrl, String description) {}

    /** Mileage included in the rate. */
    public record Mileage(boolean unlimited, int kmPerDay, int kmIncluded, BigDecimal extraKmPrice) {}

    /** An insurance cover on an offer: included in the rate, or optional (selected = the customer took it). */
    public record CoverageOffer(String code, String name, boolean included, boolean selected, BigDecimal dailyPrice,
                                BigDecimal amount, BigDecimal excess, BigDecimal deposit) {}

    public record PriceLine(String type, String code, String description, BigDecimal unitAmount, int quantity, BigDecimal amount) {}

    public record Offer(String offerId, String vehicleGroup, String groupName, String modelExample, String category,
                        String transmission, boolean airCon, String status, int available, String closedReason,
                        int rentalDays, String currency, BigDecimal baseAmount, BigDecimal extrasAmount, BigDecimal feesAmount,
                        BigDecimal taxAmount, boolean taxIncluded, BigDecimal totalAmount, List<PriceLine> breakdown,
                        BigDecimal depositAmount, BigDecimal excessAmount, String cancellationPolicy, String paymentType,
                        Instant expiresAt, boolean held, VehicleInfo vehicle, Mileage mileage, List<CoverageOffer> coverages,
                        String promoCode, String taxName, BigDecimal taxPercent, List<Penalty> penalties,
                        String baseCurrency, BigDecimal exchangeRate) {}

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
                              BigDecimal cancellationFee, BigDecimal refundAmount, String refundStatus, boolean sandbox,
                              BigDecimal taxAmount, boolean taxIncluded, Mileage mileage, List<CoverageOffer> coverages,
                              VehicleInfo vehicle, String promoCode, List<Penalty> penalties) {}

    public record OpeningHours(String day, String open, String close) {}

    public record Location(String code, String name, String address, boolean pickup, boolean dropOff, String type, String phone,
                           Double latitude, Double longitude, List<OpeningHours> openingHours, boolean afterHoursPickup,
                           boolean afterHoursReturn, BigDecimal afterHoursFee) {}

    public record VehicleGroup(String code, String name, String category, String modelExample, String transmission,
                               boolean airCon, int fleetSize, BigDecimal depositAmount, BigDecimal excessAmount, VehicleInfo vehicle) {}

    public record Coverage(String code, String name, boolean included, BigDecimal dailyPrice, BigDecimal excess, BigDecimal deposit) {}

    public record Extra(String code, String name, BigDecimal dailyPrice, BigDecimal maxPerRental) {}

    /** Everything a broker must show before the customer books: price, covers, extras, policies, stations and terms. */
    public record RateRule(Search search, Offer offer, List<Extra> extras, Location pickupLocation, Location returnLocation,
                           int minDriverAge, int maxDriverAge, int minLeadHours, int maxRentalDays,
                           BigDecimal modificationFee, String terms) {}

    /** One page of bookings for reconciliation. */
    public record ReservationPage(int page, int size, long total, List<Reservation> reservations) {}
}
