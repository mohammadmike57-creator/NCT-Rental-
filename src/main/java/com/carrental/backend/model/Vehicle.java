package com.carrental.backend.model;

import jakarta.persistence.*;
import lombok.Data;

@Entity
@Table(name = "vehicles")
@Data
public class Vehicle {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    private String modelName;
    private String licensePlate;
    private String registrationExpiry;
    private String category;
    private Double securityDeposit;
    private Double excess;
    private String sippCode;

    @Enumerated(EnumType.STRING)
    private TransmissionType transmission;

    // Optional catalogue / operational details (nullable, so existing rows stay valid)
    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private VehicleStatus status;

    @Column(name = "model_year")
    private Integer year;

    private Integer seats;
    private String fuelType;

    @Column(length = 1000)
    private String features; // comma-separated, e.g. "Bluetooth,Cruise control"

    private String imageUrl;

    public enum VehicleStatus {
        AVAILABLE,
        RESERVED,
        RENTED,
        MAINTENANCE
    }

    /** Vehicles saved before the status column existed are treated as available. */
    public VehicleStatus getStatus() {
        return status == null ? VehicleStatus.AVAILABLE : status;
    }

    /** Manufacturer, derived from the model name ("Toyota Corolla" -> "Toyota"). */
    public String getMake() {
        if (modelName == null || modelName.isBlank()) return "";
        String trimmed = modelName.trim();
        int space = trimmed.indexOf(' ');
        return space < 0 ? trimmed : trimmed.substring(0, space);
    }

    /** Model without the manufacturer ("Toyota Corolla" -> "Corolla"). */
    public String getModel() {
        if (modelName == null || modelName.isBlank()) return "";
        String trimmed = modelName.trim();
        int space = trimmed.indexOf(' ');
        return space < 0 ? trimmed : trimmed.substring(space + 1).trim();
    }
}
