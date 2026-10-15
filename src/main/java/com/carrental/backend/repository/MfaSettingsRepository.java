package com.carrental.backend.repository;

import com.carrental.backend.model.MfaSettings;
import com.carrental.backend.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface MfaSettingsRepository extends JpaRepository<MfaSettings, String> {
    Optional<MfaSettings> findByUser(User user);
}
