package com.carrental.backend.repository;

import com.carrental.backend.model.AuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, String> {

    Page<AuditLog> findByUserId(String userId, Pageable pageable);

    Page<AuditLog> findByActionType(AuditLog.ActionType actionType, Pageable pageable);

    Page<AuditLog> findByEntityType(AuditLog.EntityType entityType, Pageable pageable);

    Page<AuditLog> findByTimestampBetween(LocalDateTime start, LocalDateTime end, Pageable pageable);

    @Query("SELECT a FROM AuditLog a WHERE a.userId = :userId AND a.timestamp BETWEEN :start AND :end ORDER BY a.timestamp DESC")
    List<AuditLog> findUserActivityInTimeRange(String userId, LocalDateTime start, LocalDateTime end);

    @Query("SELECT a FROM AuditLog a WHERE a.actionType = :actionType AND a.status = :status AND a.timestamp > :since")
    List<AuditLog> findRecentActionsByTypeAndStatus(AuditLog.ActionType actionType, AuditLog.Status status, LocalDateTime since);
}
