package com.carrental.backend.store;

import org.springframework.data.jpa.repository.JpaRepository;

public interface StoredBookingRepository extends JpaRepository<StoredBooking, String> {
}
