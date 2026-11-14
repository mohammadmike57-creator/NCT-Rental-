package com.carrental.backend.tenant;

import jakarta.persistence.PrePersist;

/** Fills {@code supplier_id} on every new record from the supplier the request or job works for. */
public class SupplierStamp {
    @PrePersist
    public void stamp(Object entity) {
        if (entity instanceof TenantOwned t && (t.getSupplierId() == null || t.getSupplierId().isBlank())) {
            t.setSupplierId(TenantContext.current());
        }
    }
}
