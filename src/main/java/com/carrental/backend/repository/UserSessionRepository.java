package com.carrental.backend.repository;

import com.carrental.backend.model.User;
import com.carrental.backend.model.UserSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface UserSessionRepository extends JpaRepository<UserSession, String> {

    Optional<UserSession> findBySessionToken(String sessionToken);

    List<UserSession> findByUserAndIsActiveTrue(User user);

    @Query("SELECT s FROM UserSession s WHERE s.user = :user AND s.isActive = true ORDER BY s.lastActivity DESC")
    List<UserSession> findActiveSessionsByUser(User user);

    @Modifying
    @Query("UPDATE UserSession s SET s.isActive = false, s.logoutAt = :logoutTime WHERE s.user = :user AND s.isActive = true")
    void deactivateAllUserSessions(User user, LocalDateTime logoutTime);

    @Modifying
    @Query("UPDATE UserSession s SET s.isActive = false, s.logoutAt = :logoutTime WHERE s.expiresAt < :now AND s.isActive = true")
    void deactivateExpiredSessions(LocalDateTime now, LocalDateTime logoutTime);

    @Query("SELECT COUNT(s) FROM UserSession s WHERE s.user = :user AND s.isActive = true")
    long countActiveSessionsByUser(User user);
}
