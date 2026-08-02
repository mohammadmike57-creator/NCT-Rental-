package com.carrental.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import java.util.List;

@Entity
@Table(name = "invoices")
@Data
public class InvoiceData {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    private String invoiceNumber;
    private String issueDate;
    private String billToName;
    private String startDate;
    private String endDate;

    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true)
    @JoinColumn(name = "invoice_id")
    private List<InvoiceReservationItem> reservations;

    private Double totalSubtotal;
    private Double totalTax;
    private Double grandTotal;
    private String grandTotalInWords;
    private String generatedAt;
}
