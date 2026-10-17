package com.carrental.backend.repository;

import com.carrental.backend.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, String> {
    Optional<User> findByEmail(String email);
    Optional<User> findByEmailIgnoreCase(String email);
    Optional<User> findFirstByUsernameIgnoreCase(String username);
    boolean existsByEmail(String email);
    boolean existsByUsername(String username);
}
