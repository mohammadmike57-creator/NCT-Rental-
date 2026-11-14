package com.carrental.backend.model;

import jakarta.persistence.*;
import java.time.Instant;

/** An uploaded image (e.g. a fleet vehicle photo). Stored base64 so it works on any database. */
@Entity
@Table(name = "media_files")
@jakarta.persistence.EntityListeners(com.carrental.backend.tenant.SupplierStamp.class)
public class MediaFile implements com.carrental.backend.tenant.TenantOwned {
    /** The supplier this record belongs to (filled from the request's supplier when saved). */
    @jakarta.persistence.Column(name = "supplier_id", length = 40)
    private String supplierId;
    @Override public String getSupplierId() { return supplierId; }
    @Override public void setSupplierId(String supplierId) { this.supplierId = supplierId; }

    @Id
    private String id;

    @Column(nullable = false, length = 64)
    private String contentType;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String data;

    private long sizeBytes;
    private String uploadedBy;
    private Instant uploadedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getContentType() { return contentType; }
    public void setContentType(String contentType) { this.contentType = contentType; }
    public String getData() { return data; }
    public void setData(String data) { this.data = data; }
    public long getSizeBytes() { return sizeBytes; }
    public void setSizeBytes(long sizeBytes) { this.sizeBytes = sizeBytes; }
    public String getUploadedBy() { return uploadedBy; }
    public void setUploadedBy(String uploadedBy) { this.uploadedBy = uploadedBy; }
    public Instant getUploadedAt() { return uploadedAt; }
    public void setUploadedAt(Instant uploadedAt) { this.uploadedAt = uploadedAt; }
}
