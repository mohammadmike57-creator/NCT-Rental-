package com.carrental.backend.repository;

import com.carrental.backend.model.NotificationLog;
import com.carrental.backend.model.NotificationTemplate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface NotificationLogRepository extends JpaRepository<NotificationLog, String> {

    Page<NotificationLog> findByUserId(String userId, Pageable pageable);

    List<NotificationLog> findByStatus(NotificationLog.NotificationStatus status);

    List<NotificationLog> findByStatusAndCreatedAtBefore(
            NotificationLog.NotificationStatus status,
            LocalDateTime threshold
    );

    Page<NotificationLog> findByType(NotificationTemplate.NotificationType type, Pageable pageable);

    Page<NotificationLog> findByTypeAndStatus(
            NotificationTemplate.NotificationType type,
            String status,
            Pageable pageable
    );

    long countByTypeAndStatusAndSentAtBetween(
            NotificationTemplate.NotificationType type,
            String status,
            LocalDateTime startDate,
            LocalDateTime endDate
    );
}
