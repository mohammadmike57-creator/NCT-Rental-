package com.carrental.backend.audit;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

/** One thing a staff member did in the system, stamped by the server with who and when. */
@Entity
@Table(name = "staff_activity", indexes = {
    @Index(name = "idx_staff_activity_user", columnList = "userEmail"),
    @Index(name = "idx_staff_activity_time", columnList = "occurredAt"),
    @Index(name = "idx_staff_activity_booking", columnList = "bookingId")
})
@Data
public class StaffActivity {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;
    @Column(nullable = false)
    private Instant occurredAt;
    @Column(nullable = false)
    private String userEmail;
    private String userName;
    @Column(nullable = false, length = 64)
    private String action;
    @Column(length = 32)
    private String category;
    @Column(length = 500)
    private String summary;
    @Column(length = 64)
    private String bookingId;
    @Column(length = 4000)
    private String details;
}
