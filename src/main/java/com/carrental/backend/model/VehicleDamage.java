package com.carrental.backend.model;

import jakarta.persistence.*;
import lombok.Data;

@Entity
@Table(name = "vehicle_damages")
@Data
public class VehicleDamage {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    private String bookingId;
    private Double amount;
    private String details;

    @Enumerated(EnumType.STRING)
    private VehicleDamageStatus status;

    private String policeReportNumber;
    private Double policeReportAmount;

    @Lob
    private String repairInvoice;
    private String repairInvoiceFilename;

    @Lob
    private String policeReportFile;
    private String policeReportFilename;

    @Lob
    private String damageImage;
    private String damageImageFilename;
}
