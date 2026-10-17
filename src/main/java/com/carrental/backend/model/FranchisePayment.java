package com.carrental.backend.model;

import jakarta.persistence.*;
import lombok.Data;

@Entity
@Table(name = "franchise_payments")
@Data
public class FranchisePayment {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(name = "payment_year")
    private int year;

    @Column(name = "payment_month")
    private String month;

    private double amount;
    private String currency; // "USD" or "JOD"
    private String datePaid;
    private String paidBy;
    private String referenceNote;
}
