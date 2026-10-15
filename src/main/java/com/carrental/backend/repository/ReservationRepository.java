package com.carrental.backend.repository;

import com.carrental.backend.model.Reservation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

/**
 * Professional Reservation Repository
 * Provides advanced query methods for reservation management and analytics
 */
public interface ReservationRepository extends JpaRepository<Reservation, String> {

    /**
     * Find all reservations within a date range
     */
    @Query("SELECT r FROM Reservation r WHERE r.startDate <= :endDate AND r.endDate >= :startDate")
    List<Reservation> findByDateRange(@Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate);

    /**
     * Find reservations that conflict with given date range (for availability checking)
     */
    @Query("SELECT r FROM Reservation r WHERE " +
           "r.status IN ('CONFIRMED', 'ACTIVE') AND " +
           "r.startDate <= :endDate AND r.endDate >= :startDate")
    List<Reservation> findConflictingReservations(@Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate);

    /**
     * Find reservations by customer email
     */
    List<Reservation> findByCustomerEmail(String customerEmail);

    /**
     * Find reservations by booking ID
     */
    Reservation findByBookingId(String bookingId);

    /**
     * Find active reservations (currently in progress)
     */
    @Query("SELECT r FROM Reservation r WHERE r.status = 'ACTIVE' AND r.startDate <= CURRENT_DATE AND r.endDate >= CURRENT_DATE")
    List<Reservation> findActiveReservations();

    /**
     * Find upcoming reservations (confirmed but not started)
     */
    @Query("SELECT r FROM Reservation r WHERE r.status = 'CONFIRMED' AND r.startDate > CURRENT_DATE")
    List<Reservation> findUpcomingReservations();

    /**
     * Find overdue reservations (should have been completed but not marked as such)
     */
    @Query("SELECT r FROM Reservation r WHERE r.status = 'ACTIVE' AND r.endDate < CURRENT_DATE")
    List<Reservation> findOverdueReservations();
}

