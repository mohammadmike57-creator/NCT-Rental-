package com.carrental.backend.tenant;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface PasswordSetupRepository extends JpaRepository<PasswordSetupToken, String> {
    /** A new link replaces the person's earlier unused ones. */
    @Modifying
    @Transactional
    @Query("delete from PasswordSetupToken t where lower(t.email) = lower(:email) and t.usedAt is null")
    int deleteOpenFor(@Param("email") String email);
}
