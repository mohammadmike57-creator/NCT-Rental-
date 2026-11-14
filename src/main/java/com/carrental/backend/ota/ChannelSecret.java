package com.carrental.backend.ota;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/** Webhook signing secret per channel. Kept on the server only; shown to staff once when created. */
@Entity
@Table(name = "channel_secret")
@Getter @Setter
@jakarta.persistence.EntityListeners(com.carrental.backend.tenant.SupplierStamp.class)
public class ChannelSecret implements com.carrental.backend.tenant.TenantOwned {
    /** The supplier this record belongs to (filled from the request's supplier when saved). */
    @jakarta.persistence.Column(name = "supplier_id", length = 40)
    private String supplierId;
    @Override public String getSupplierId() { return supplierId; }
    @Override public void setSupplierId(String supplierId) { this.supplierId = supplierId; }

    @Id @Column(length = 100) private String channelId;
    @Column(nullable = false, length = 100) private String webhookSecret;
    @Column(nullable = false) private Instant createdAt;
}
