package com.carrental.backend.model;

import jakarta.persistence.*;
import lombok.Data;

@Entity
@Table(name = "rental_sources")
@Data
public class RentalSource {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    private String name;

    @Enumerated(EnumType.STRING)
    private PaymentType paymentType;
}
