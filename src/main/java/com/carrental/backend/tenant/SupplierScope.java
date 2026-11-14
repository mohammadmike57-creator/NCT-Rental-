package com.carrental.backend.tenant;

import org.springframework.data.jpa.domain.Specification;

/**
 * Query filters for records with a {@code supplierId}: only the current supplier's. Records saved before suppliers
 * existed have no supplier yet (until the start-up fill gives them UR-Drive Jordan's); they count as UR-Drive's.
 */
public final class SupplierScope {

    private SupplierScope() { }

    /** JPQL condition on {@code alias}; the query passes {@code :supplier} = {@link #current()}. */
    public static String jpql(String alias) {
        return "(" + alias + ".supplierId = :supplier or (:supplier = '" + TenantContext.DEFAULT + "' and " + alias + ".supplierId is null))";
    }

    public static String current() { return TenantContext.current(); }

    /** True when a record with this supplier id belongs to the current supplier. */
    public static boolean mine(String supplierId) {
        String s = supplierId == null || supplierId.isBlank() ? TenantContext.DEFAULT : supplierId;
        return s.equals(TenantContext.current());
    }

    public static <T> Specification<T> mine() {
        String s = TenantContext.current();
        return (root, query, cb) -> TenantContext.DEFAULT.equals(s)
            ? cb.or(cb.equal(root.get("supplierId"), s), cb.isNull(root.get("supplierId")))
            : cb.equal(root.get("supplierId"), s);
    }
}
