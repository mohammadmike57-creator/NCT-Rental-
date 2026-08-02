package com.carrental.backend.model;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Entity
@Table(name = "reservations")
public class Reservation {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    private String personName;
    private String contactNumber;
    private String bookingId;

    @ManyToOne
    private RentalSource source;

    private LocalDate bookingDate;
    private LocalDate startDate;
    private LocalDate endDate;
    private String reservationVehicle;

    @ManyToOne
    private Vehicle assignedVehicle;

    private String locationName;
    private String notes;

    @Enumerated(EnumType.STRING)
    private ReservationStatus status;

    private Double amount;
    private Double baseAmount;
    private Boolean voucherSubmitted;
    private Boolean dropOffCompleted;
    private String customerEmail;

    private LocalDateTime pickupDateTime;
    private String pickupRenterSignature;
    private String pickupAgentSignature;
    private String pickupAgentName;
    private Integer pickupFuelLevel;
    private Integer pickupKmOut;
    private String pickupNotes;

    private LocalDateTime dropOffDateTime;
    private String dropOffRenterSignature;
    private String dropOffAgentSignature;
    private String dropOffAgentName;
    private Integer dropOffFuelLevel;
    private Integer dropOffKmIn;
    private String dropOffNotes;

    @ManyToOne
    private User createdBy;

    @ManyToOne
    private User lastEditedBy;

    // Getters and Setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getPersonName() { return personName; }
    public void setPersonName(String personName) { this.personName = personName; }

    public String getContactNumber() { return contactNumber; }
    public void setContactNumber(String contactNumber) { this.contactNumber = contactNumber; }

    public String getBookingId() { return bookingId; }
    public void setBookingId(String bookingId) { this.bookingId = bookingId; }

    public RentalSource getSource() { return source; }
    public void setSource(RentalSource source) { this.source = source; }

    public LocalDate getBookingDate() { return bookingDate; }
    public void setBookingDate(LocalDate bookingDate) { this.bookingDate = bookingDate; }

    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate startDate) { this.startDate = startDate; }

    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate endDate) { this.endDate = endDate; }

    public String getReservationVehicle() { return reservationVehicle; }
    public void setReservationVehicle(String reservationVehicle) { this.reservationVehicle = reservationVehicle; }

    public Vehicle getAssignedVehicle() { return assignedVehicle; }
    public void setAssignedVehicle(Vehicle assignedVehicle) { this.assignedVehicle = assignedVehicle; }

    public String getLocationName() { return locationName; }
    public void setLocationName(String locationName) { this.locationName = locationName; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public ReservationStatus getStatus() { return status; }
    public void setStatus(ReservationStatus status) { this.status = status; }

    public Double getAmount() { return amount; }
    public void setAmount(Double amount) { this.amount = amount; }

    public Double getBaseAmount() { return baseAmount; }
    public void setBaseAmount(Double baseAmount) { this.baseAmount = baseAmount; }

    public Boolean getVoucherSubmitted() { return voucherSubmitted; }
    public void setVoucherSubmitted(Boolean voucherSubmitted) { this.voucherSubmitted = voucherSubmitted; }

    public Boolean getDropOffCompleted() { return dropOffCompleted; }
    public void setDropOffCompleted(Boolean dropOffCompleted) { this.dropOffCompleted = dropOffCompleted; }

    public String getCustomerEmail() { return customerEmail; }
    public void setCustomerEmail(String customerEmail) { this.customerEmail = customerEmail; }

    public LocalDateTime getPickupDateTime() { return pickupDateTime; }
    public void setPickupDateTime(LocalDateTime pickupDateTime) { this.pickupDateTime = pickupDateTime; }

    public String getPickupRenterSignature() { return pickupRenterSignature; }
    public void setPickupRenterSignature(String pickupRenterSignature) { this.pickupRenterSignature = pickupRenterSignature; }

    public String getPickupAgentSignature() { return pickupAgentSignature; }
    public void setPickupAgentSignature(String pickupAgentSignature) { this.pickupAgentSignature = pickupAgentSignature; }

    public String getPickupAgentName() { return pickupAgentName; }
    public void setPickupAgentName(String pickupAgentName) { this.pickupAgentName = pickupAgentName; }

    public Integer getPickupFuelLevel() { return pickupFuelLevel; }
    public void setPickupFuelLevel(Integer pickupFuelLevel) { this.pickupFuelLevel = pickupFuelLevel; }

    public Integer getPickupKmOut() { return pickupKmOut; }
    public void setPickupKmOut(Integer pickupKmOut) { this.pickupKmOut = pickupKmOut; }

    public String getPickupNotes() { return pickupNotes; }
    public void setPickupNotes(String pickupNotes) { this.pickupNotes = pickupNotes; }

    public LocalDateTime getDropOffDateTime() { return dropOffDateTime; }
    public void setDropOffDateTime(LocalDateTime dropOffDateTime) { this.dropOffDateTime = dropOffDateTime; }

    public String getDropOffRenterSignature() { return dropOffRenterSignature; }
    public void setDropOffRenterSignature(String dropOffRenterSignature) { this.dropOffRenterSignature = dropOffRenterSignature; }

    public String getDropOffAgentSignature() { return dropOffAgentSignature; }
    public void setDropOffAgentSignature(String dropOffAgentSignature) { this.dropOffAgentSignature = dropOffAgentSignature; }

    public String getDropOffAgentName() { return dropOffAgentName; }
    public void setDropOffAgentName(String dropOffAgentName) { this.dropOffAgentName = dropOffAgentName; }

    public Integer getDropOffFuelLevel() { return dropOffFuelLevel; }
    public void setDropOffFuelLevel(Integer dropOffFuelLevel) { this.dropOffFuelLevel = dropOffFuelLevel; }

    public Integer getDropOffKmIn() { return dropOffKmIn; }
    public void setDropOffKmIn(Integer dropOffKmIn) { this.dropOffKmIn = dropOffKmIn; }

    public String getDropOffNotes() { return dropOffNotes; }
    public void setDropOffNotes(String dropOffNotes) { this.dropOffNotes = dropOffNotes; }

    public User getCreatedBy() { return createdBy; }
    public void setCreatedBy(User createdBy) { this.createdBy = createdBy; }

    public User getLastEditedBy() { return lastEditedBy; }
    public void setLastEditedBy(User lastEditedBy) { this.lastEditedBy = lastEditedBy; }
}
