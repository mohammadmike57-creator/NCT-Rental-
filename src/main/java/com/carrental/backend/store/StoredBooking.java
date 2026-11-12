package com.carrental.backend.store;

import jakarta.persistence.*;

import java.time.Instant;

/** One booking (one entry of the reservations section), with the fields reports need as real columns. */
@Entity
@Table(name = "store_bookings", indexes = {
    @Index(name = "idx_store_bookings_booking_id", columnList = "bookingId"),
    @Index(name = "idx_store_bookings_month", columnList = "yearKey,monthKey")
})
public class StoredBooking {
    @Id
    @Column(length = 120)
    private String id;
    @Column(nullable = false, length = 10)
    private String yearKey;
    @Column(nullable = false, length = 20)
    private String monthKey;
    /** Place in its month's list, so the list comes back in exactly the same order. */
    private int position;
    @Column(length = 120)
    private String bookingId;
    @Column(length = 40)
    private String status;
    @Column(length = 40)
    private String startDate;
    @Column(length = 40)
    private String endDate;
    @Column(length = 120)
    private String source;
    @Column(length = 120)
    private String locationName;
    @Column(length = 120)
    private String carModel;
    @Column(length = 40)
    private String licensePlate;
    private Double amount;
    @Column(length = 120)
    private String channelReservationNumber;
    /** The whole booking exactly as saved, so no field is ever lost. */
    @Column(columnDefinition = "TEXT", nullable = false)
    private String data;
    private Instant updatedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getYearKey() { return yearKey; }
    public void setYearKey(String yearKey) { this.yearKey = yearKey; }
    public String getMonthKey() { return monthKey; }
    public void setMonthKey(String monthKey) { this.monthKey = monthKey; }
    public int getPosition() { return position; }
    public void setPosition(int position) { this.position = position; }
    public String getBookingId() { return bookingId; }
    public void setBookingId(String bookingId) { this.bookingId = bookingId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getStartDate() { return startDate; }
    public void setStartDate(String startDate) { this.startDate = startDate; }
    public String getEndDate() { return endDate; }
    public void setEndDate(String endDate) { this.endDate = endDate; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public String getLocationName() { return locationName; }
    public void setLocationName(String locationName) { this.locationName = locationName; }
    public String getCarModel() { return carModel; }
    public void setCarModel(String carModel) { this.carModel = carModel; }
    public String getLicensePlate() { return licensePlate; }
    public void setLicensePlate(String licensePlate) { this.licensePlate = licensePlate; }
    public Double getAmount() { return amount; }
    public void setAmount(Double amount) { this.amount = amount; }
    public String getChannelReservationNumber() { return channelReservationNumber; }
    public void setChannelReservationNumber(String v) { this.channelReservationNumber = v; }
    public String getData() { return data; }
    public void setData(String data) { this.data = data; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
