package com.carrental.backend.model;

import jakarta.persistence.*;
import lombok.Data;

@Entity
@Table(name = "activity_log")
@Data
public class ActivityLog {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    private String timestamp;
    private String userId;
    private String userName;
    private String action;
    private String details;
}
