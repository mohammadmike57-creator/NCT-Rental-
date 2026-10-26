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
    @Query("select max(b.id) from ChannelBooking b")
    Long maxId();
}
