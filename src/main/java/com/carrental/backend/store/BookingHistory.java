package com.carrental.backend.store;

import jakarta.persistence.*;

import java.time.Instant;

/** The previous version of a booking each time it was changed or deleted, so nothing is ever lost. */
@Entity
@Table(name = "store_booking_history", indexes = {
    @Index(name = "idx_store_history_row", columnList = "rowId,changedAt"),
    @Index(name = "idx_store_history_booking", columnList = "bookingId")
})
@jakarta.persistence.EntityListeners(com.carrental.backend.tenant.SupplierStamp.class)
public class BookingHistory implements com.carrental.backend.tenant.TenantOwned {
    /** The supplier this record belongs to (filled from the request's supplier when saved). */
    @jakarta.persistence.Column(name = "supplier_id", length = 40)
    private String supplierId;
    @Override public String getSupplierId() { return supplierId; }
    @Override public void setSupplierId(String supplierId) { this.supplierId = supplierId; }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(length = 120, nullable = false)
    private String rowId;
    @Column(length = 120)
    private String bookingId;
    /** CHANGED or DELETED. */
    @Column(length = 10, nullable = false)
    private String action;
    /** The booking as it was before the change. */
    @Column(columnDefinition = "TEXT", nullable = false)
    private String previous;
    @Column(nullable = false)
    private Instant changedAt;

    public Long getId() { return id; }
    public String getRowId() { return rowId; }
    public void setRowId(String rowId) { this.rowId = rowId; }
    public String getBookingId() { return bookingId; }
    public void setBookingId(String bookingId) { this.bookingId = bookingId; }
    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }
    public String getPrevious() { return previous; }
    public void setPrevious(String previous) { this.previous = previous; }
    public Instant getChangedAt() { return changedAt; }
    public void setChangedAt(Instant changedAt) { this.changedAt = changedAt; }
}
