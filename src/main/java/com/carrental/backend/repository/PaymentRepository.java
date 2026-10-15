package com.carrental.backend.repository;

import com.carrental.backend.model.Payment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface PaymentRepository extends JpaRepository<Payment, String> {

    Optional<Payment> findByStripePaymentId(String stripePaymentId);

    Optional<Payment> findByStripeCheckoutSessionId(String sessionId);

    List<Payment> findByReservationId(String reservationId);

    Page<Payment> findByStatus(Payment.PaymentStatus status, Pageable pageable);

    @Query("SELECT p FROM Payment p WHERE p.status = :status AND p.createdAt BETWEEN :start AND :end")
    List<Payment> findByStatusAndDateRange(
            Payment.PaymentStatus status,
            LocalDateTime start,
            LocalDateTime end
    );

    @Query("SELECT SUM(p.amount) FROM Payment p WHERE p.status = 'SUCCEEDED' AND p.createdAt BETWEEN :start AND :end")
    Double getTotalRevenueInPeriod(LocalDateTime start, LocalDateTime end);

    @Query("SELECT p FROM Payment p WHERE p.status = 'PENDING' AND p.createdAt < :threshold")
    List<Payment> findStalePayments(LocalDateTime threshold);
}
