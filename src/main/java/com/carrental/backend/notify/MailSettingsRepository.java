package com.carrental.backend.notify;

import org.springframework.data.jpa.repository.JpaRepository;

public interface MailSettingsRepository extends JpaRepository<MailSettings, Long> {
    java.util.Optional<MailSettings> findFirstBySupplierId(String supplierId);

    @org.springframework.data.jpa.repository.Query("select coalesce(max(m.id), 1) from MailSettings m")
    Long maxId();
}
