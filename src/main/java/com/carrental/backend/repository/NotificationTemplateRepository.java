package com.carrental.backend.repository;

import com.carrental.backend.model.NotificationTemplate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface NotificationTemplateRepository extends JpaRepository<NotificationTemplate, String> {

    Optional<NotificationTemplate> findByNameAndLanguage(String name, String language);

    List<NotificationTemplate> findByIsActiveTrue();

    List<NotificationTemplate> findByType(NotificationTemplate.NotificationType type);
}
