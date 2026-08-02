package com.carrental.backend.model;

import jakarta.persistence.*;
import lombok.Data;

@Entity
@Table(name = "stop_sales")
@Data
public class StopSale {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    private String type; // "vehicle" or "category"
    private String target; // vehicle.id or category name
    private String startDate;
    private String endDate;
    private String reason;
}
