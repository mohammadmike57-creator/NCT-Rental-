package com.carrental.backend.repository;

import com.carrental.backend.model.RentalLocation;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RentalLocationRepository extends JpaRepository<RentalLocation, String> {
}
