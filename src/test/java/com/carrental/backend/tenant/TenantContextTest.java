package com.carrental.backend.tenant;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class TenantContextTest {

    @AfterEach
    void clear() { TenantContext.clear(); }

    @Test
    void nothingSetMeansUrDriveJordanAsBefore() {
        assertFalse(TenantContext.isBound());
        assertEquals("urd", TenantContext.current());
    }

    @Test
    void aRequestCannotSwitchToAnotherSupplier() {
        TenantContext.bind("spx");
        TenantContext.bind("spx");   // the same again is fine
        assertThrows(TenantContext.CrossSupplierException.class, () -> TenantContext.bind("spa"));
        assertEquals("spx", TenantContext.current());
    }

    @Test
    void jobWorkRestoresWhatWasSetBefore() {
        TenantContext.run("spa", () -> assertEquals("spa", TenantContext.current()));
        assertFalse(TenantContext.isBound());
        TenantContext.bind("spx");
        assertEquals("spa", TenantContext.call("spa", TenantContext::current));
        assertEquals("spx", TenantContext.current());
    }

    @Test
    void withTheSwitchOffNoOtherSupplierCanBeCreatedOrUsed() {
        SupplierService s = new SupplierService(null, null, new PlatformSettings(false, ""), new com.fasterxml.jackson.databind.ObjectMapper());
        assertThrows(IllegalStateException.class, () -> s.create("SPX", "Supplier X", "USD", null, null));
        assertEquals(java.util.List.of("urd"), s.activeIds());
        assertTrue(s.isActive("urd"));
        assertFalse(s.isActive("spx"));
    }

    @Test
    void urDriveKeepsItsOriginalDocumentRow() {
        assertEquals("main", SupplierService.documentId("urd"));
        assertEquals("supplier-spx", SupplierService.documentId("spx"));
    }

    @Test
    void superAdminsComeFromTheServerSetting() {
        PlatformSettings p = new PlatformSettings(true, " Boss@Example.com , other@example.com");
        assertTrue(p.isSuperAdmin("boss@example.com"));
        assertFalse(p.isSuperAdmin("someone@example.com"));
        assertFalse(new PlatformSettings(true, "").isSuperAdmin("boss@example.com"));
    }
}
