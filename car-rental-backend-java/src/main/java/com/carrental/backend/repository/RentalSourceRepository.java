package com.carrental.backend.repository;

import com.carrental.backend.model.RentalSource;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RentalSourceRepository extends JpaRepository<RentalSource, String> {
}
