package com.carrental.backend.ota;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface ChannelBookingRepository extends JpaRepository<ChannelBooking, Long> {
    Optional<ChannelBooking> findByChannelIdAndIdempotencyKey(String channelId, String key);
    Optional<ChannelBooking> findFirstByChannelIdAndBrokerReference(String channelId, String ref);
    Optional<ChannelBooking> findByReservationNumber(String number);
    Optional<ChannelBooking> findFirstByStateReservationId(String id);
    List<ChannelBooking> findByChannelIdOrderByCreatedAtDesc(String channelId, Pageable page);
    List<ChannelBooking> findBySandboxFalseAndStatusIn(List<String> statuses);
    List<ChannelBooking> findByChannelIdAndSandboxFalseAndStatusInAndPickupAtBefore(String channelId, List<String> statuses, LocalDateTime before);
    List<ChannelBooking> findByChannelIdAndSandboxAndPickupAtBetweenOrderByPickupAtAsc(String channelId, boolean sandbox, LocalDateTime from, LocalDateTime to);

    /** This broker's active bookings of a group overlapping a period (for allotment caps). */
    @Query("select count(b) from ChannelBooking b where b.channelId = :ch and b.sandbox = :sb and b.sippCode = :sipp"
        + " and b.status not in ('CANCELLED', 'NO_SHOW', 'COMPLETED') and b.pickupAt < :to and b.returnAt > :from"
        + " and (b.stateReservationId is null or b.stateReservationId <> :exclude)")
    long countOverlapping(@Param("ch") String channelId, @Param("sb") boolean sandbox, @Param("sipp") String sipp,
                          @Param("from") LocalDateTime from, @Param("to") LocalDateTime to, @Param("exclude") String excludeReservation);

    @Query("select max(b.id) from ChannelBooking b")
    Long maxId();
}
