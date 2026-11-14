package com.carrental.backend.audit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface StaffActivityRepository extends JpaRepository<StaffActivity, String>, JpaSpecificationExecutor<StaffActivity> {

    /** Per person of one supplier ({@code supplier}: see SupplierScope). */
    @Query("select a.userEmail, max(a.userName), count(a), max(a.occurredAt) from StaffActivity a where a.occurredAt >= :since"
        + " and (a.supplierId = :supplier or (:supplier = 'urd' and a.supplierId is null)) group by a.userEmail")
    List<Object[]> summarySince(@Param("since") Instant since, @Param("supplier") String supplier);

    @Query("select a.userEmail, a.category, count(a) from StaffActivity a where a.occurredAt >= :since"
        + " and (a.supplierId = :supplier or (:supplier = 'urd' and a.supplierId is null)) group by a.userEmail, a.category")
    List<Object[]> categoriesSince(@Param("since") Instant since, @Param("supplier") String supplier);
}
