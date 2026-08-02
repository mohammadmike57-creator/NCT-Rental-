package com.carrental.backend.repository;

import com.carrental.backend.model.ActivityLog;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ActivityLogRepository extends JpaRepository<ActivityLog, String> {
}
