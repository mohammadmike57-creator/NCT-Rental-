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
@jakarta.persistence.EntityListeners(com.carrental.backend.tenant.SupplierStamp.class)
public class StaffActivity implements com.carrental.backend.tenant.TenantOwned {
    /** The supplier this record belongs to (filled from the request's supplier when saved). */
    @jakarta.persistence.Column(name = "supplier_id", length = 40)
    private String supplierId;
    @Override public String getSupplierId() { return supplierId; }
    @Override public void setSupplierId(String supplierId) { this.supplierId = supplierId; }

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
    /** Where the action came from: the person's address, browser, and the request it was part of. */
    @Column(length = 64)
    private String ipAddress;
    @Column(length = 300)
    private String userAgent;
    @Column(length = 100)
    private String requestId;
}
