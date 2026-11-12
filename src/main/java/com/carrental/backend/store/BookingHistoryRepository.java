package com.carrental.backend.store;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BookingHistoryRepository extends JpaRepository<BookingHistory, Long> {
    List<BookingHistory> findTop50ByBookingIdOrderByChangedAtDesc(String bookingId);
    List<BookingHistory> findTop50ByRowIdOrderByChangedAtDesc(String rowId);
    List<BookingHistory> findTop100ByActionOrderByChangedAtDesc(String action);
}
