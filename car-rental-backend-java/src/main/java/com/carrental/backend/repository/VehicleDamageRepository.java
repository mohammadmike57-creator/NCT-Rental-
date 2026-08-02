package com.carrental.backend.repository;

import com.carrental.backend.model.VehicleDamage;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VehicleDamageRepository extends JpaRepository<VehicleDamage, String> {
}
