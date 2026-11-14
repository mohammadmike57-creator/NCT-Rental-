package com.carrental.backend.tenant;

import java.util.concurrent.Callable;

/**
 * The supplier the current request or job works for. It is set only by the server: from the signed-in person's
 * account (never from anything the browser sends), from the broker channel a gateway call is addressed to, or
 * explicitly by a background job for each supplier it handles. Once set for a request it cannot be changed to
 * another supplier, so a request can never mix two suppliers' data.
 *
 * Nothing set means the work is the platform's own (start-up, legacy single-company paths): it then uses the
 * first supplier, UR-Drive Jordan, exactly as before suppliers existed.
 */
public final class TenantContext {

    /** UR-Drive Jordan: owner of every record from before suppliers existed. */
    public static final String DEFAULT = "urd";

    private static final ThreadLocal<String> CURRENT = new ThreadLocal<>();

    private TenantContext() { }

    /** The supplier this work is for (UR-Drive Jordan when nothing is set). */
    public static String current() {
        String s = CURRENT.get();
        return s == null ? DEFAULT : s;
    }

    /** True when a request or job has been tied to a supplier. */
    public static boolean isBound() { return CURRENT.get() != null; }

    /**
     * Ties the current request to a supplier. Binding the same supplier again is fine; binding another one is
     * refused, so a request cannot switch suppliers halfway.
     */
    public static void bind(String supplierId) {
        if (supplierId == null || supplierId.isBlank()) throw new IllegalArgumentException("supplier required");
        String now = CURRENT.get();
        if (now != null && !now.equals(supplierId)) throw new CrossSupplierException();
        CURRENT.set(supplierId);
    }

    /** Ends the request's supplier (called by {@link TenantFilter} when every request ends). */
    public static void clear() { CURRENT.remove(); }

    /** Runs background work for one supplier, then restores what was set before. */
    public static void run(String supplierId, Runnable work) {
        String before = CURRENT.get();
        CURRENT.set(supplierId);
        try {
            work.run();
        } finally {
            if (before == null) CURRENT.remove(); else CURRENT.set(before);
        }
    }

    public static <T> T call(String supplierId, Callable<T> work) {
        String before = CURRENT.get();
        CURRENT.set(supplierId);
        try {
            return work.call();
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        } finally {
            if (before == null) CURRENT.remove(); else CURRENT.set(before);
        }
    }

    /** A request tried to reach a second supplier. Never shown to anyone as such: callers answer "not found". */
    @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.NOT_FOUND)
    public static final class CrossSupplierException extends RuntimeException {
        public CrossSupplierException() { super("Not found"); }
    }
}
