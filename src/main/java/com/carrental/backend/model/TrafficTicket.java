package com.carrental.backend.model;

import jakarta.persistence.*;
import lombok.Data;

@Entity
@Table(name = "traffic_tickets")
@Data
public class TrafficTicket {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    private String bookingId;
    private String ticketDate;
    private Double amount;
    private String details;

    @Enumerated(EnumType.STRING)
    private TrafficTicketStatus status;

    @Lob
    private String ticketDocument;
    private String ticketDocumentFilename;
}
