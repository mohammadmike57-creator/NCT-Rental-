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
}
