package com.carrental.backend.repository;

import com.carrental.backend.model.AppData;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface AppDataRepository extends JpaRepository<AppData, String> {
    default Optional<AppData> findMain() {
        return findById("main");
    }
}
