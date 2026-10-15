package com.carrental.backend.repository;

import com.carrental.backend.model.NotificationLog;
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
}
