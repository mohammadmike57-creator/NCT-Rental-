package com.carrental.backend.model;

import jakarta.persistence.*;
import lombok.Data;

@Entity
@Table(name = "expenses")
@Data
public class Expense {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    private String date;
    @Enumerated(EnumType.STRING)
    private ExpenseCategory category;
    private String description;
    private Double amount;
    private Boolean isRecurring;
}
