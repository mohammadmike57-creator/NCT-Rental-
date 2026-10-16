package com.carrental.backend.repository;

import com.carrental.backend.model.Vehicle;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface VehicleRepository extends JpaRepository<Vehicle, String> {

    /**
     * Vehicles in the given status. Filtered in memory so rows saved before the
     * status column existed (NULL, treated as AVAILABLE) are included; fleets are small.
     */
    default List<Vehicle> findByStatus(Vehicle.VehicleStatus status) {
        return findAll().stream().filter(v -> v.getStatus() == status).toList();
    }

    default List<Vehicle> findByCategoryAndStatus(String category, Vehicle.VehicleStatus status) {
        return findByStatus(status).stream().filter(v -> category != null && category.equalsIgnoreCase(v.getCategory())).toList();
    }
}
