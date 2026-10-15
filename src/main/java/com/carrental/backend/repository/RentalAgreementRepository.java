package com.carrental.backend.repository;

import com.carrental.backend.model.RentalAgreement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface RentalAgreementRepository extends JpaRepository<RentalAgreement, String> {

    Optional<RentalAgreement> findByAgreementNumber(String agreementNumber);

    Optional<RentalAgreement> findByReservationId(String reservationId);

    List<RentalAgreement> findByCustomerEmail(String customerEmail);

    List<RentalAgreement> findByAgreementStatus(RentalAgreement.AgreementStatus status);

    @Query("SELECT a FROM RentalAgreement a WHERE a.agreementStatus = :status AND a.isActive = true")
    List<RentalAgreement> findActiveByStatus(RentalAgreement.AgreementStatus status);

    @Query("SELECT a FROM RentalAgreement a WHERE a.pickupDate BETWEEN :start AND :end")
    List<RentalAgreement> findByPickupDateRange(LocalDateTime start, LocalDateTime end);

    @Query("SELECT a FROM RentalAgreement a WHERE a.isActive = true AND a.isSigned = false")
    List<RentalAgreement> findUnsignedAgreements();
}
