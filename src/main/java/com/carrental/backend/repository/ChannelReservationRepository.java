package com.carrental.backend.repository;

import com.carrental.backend.model.ChannelReservation;
import com.carrental.backend.model.DistributionChannel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface ChannelReservationRepository extends JpaRepository<ChannelReservation, String> {

    // Find by confirmation numbers
    Optional<ChannelReservation> findByChannelConfirmationNumber(String channelConfirmationNumber);
    Optional<ChannelReservation> findByInternalConfirmationNumber(String internalConfirmationNumber);

    // Find by channel
    List<ChannelReservation> findByChannel(DistributionChannel channel);
    List<ChannelReservation> findByChannelCode(String channelCode);

    // Find by status
    List<ChannelReservation> findByReservationStatus(ChannelReservation.ReservationStatus status);
    List<ChannelReservation> findByRequiresManualReviewTrue();

    // Find by reservation type
    List<ChannelReservation> findByReservationType(ChannelReservation.ReservationType type);

    // Find by date ranges
    List<ChannelReservation> findByPickupDateBetween(LocalDate startDate, LocalDate endDate);
    List<ChannelReservation> findByReturnDateBetween(LocalDate startDate, LocalDate endDate);

    // Find by customer
    List<ChannelReservation> findByCustomerEmail(String email);
    List<ChannelReservation> findByCustomerPhone(String phone);

    // Complex queries
    @Query("SELECT cr FROM ChannelReservation cr WHERE cr.channel.id = :channelId " +
           "AND cr.reservationStatus = :status")
    List<ChannelReservation> findByChannelIdAndStatus(
        @Param("channelId") String channelId,
        @Param("status") ChannelReservation.ReservationStatus status
    );

    @Query("SELECT cr FROM ChannelReservation cr WHERE cr.pickupDate = :date " +
           "AND cr.reservationStatus IN :statuses")
    List<ChannelReservation> findByPickupDateAndStatusIn(
        @Param("date") LocalDate date,
        @Param("statuses") List<ChannelReservation.ReservationStatus> statuses
    );

    @Query("SELECT cr FROM ChannelReservation cr WHERE cr.channel.id = :channelId " +
           "AND cr.pickupDate BETWEEN :startDate AND :endDate")
    List<ChannelReservation> findByChannelAndDateRange(
        @Param("channelId") String channelId,
        @Param("startDate") LocalDate startDate,
        @Param("endDate") LocalDate endDate
    );

    // Statistics queries
    @Query("SELECT COUNT(cr) FROM ChannelReservation cr WHERE cr.channel.id = :channelId " +
           "AND cr.reservationStatus = 'CONFIRMED'")
    Long countConfirmedByChannel(@Param("channelId") String channelId);

    @Query("SELECT SUM(cr.totalAmount) FROM ChannelReservation cr WHERE cr.channel.id = :channelId " +
           "AND cr.reservationStatus IN ('CONFIRMED', 'ACTIVE', 'COMPLETED')")
    java.math.BigDecimal calculateTotalRevenueByChannel(@Param("channelId") String channelId);

    @Query("SELECT SUM(cr.channelCommissionAmount) FROM ChannelReservation cr " +
           "WHERE cr.channel.id = :channelId AND cr.reservationStatus IN ('CONFIRMED', 'ACTIVE', 'COMPLETED')")
    java.math.BigDecimal calculateTotalCommissionByChannel(@Param("channelId") String channelId);
}
