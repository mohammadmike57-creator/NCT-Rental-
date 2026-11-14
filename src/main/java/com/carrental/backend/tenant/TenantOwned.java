package com.carrental.backend.tenant;

/** A stored record that belongs to one supplier ({@code supplier_id}). */
public interface TenantOwned {
    String getSupplierId();
    void setSupplierId(String supplierId);
}
