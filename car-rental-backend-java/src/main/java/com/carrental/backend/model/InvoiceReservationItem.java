package com.carrental.backend.model;

import jakarta.persistence.*;
import lombok.Data;

@Entity
@Table(name = "invoice_reservation_items")
@Data
public class InvoiceReservationItem {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @ManyToOne
    private Reservation reservation;

    private Double subtotal;
    private Double tax;
    private Double total;
}
