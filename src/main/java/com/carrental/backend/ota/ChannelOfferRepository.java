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

public interface ChannelOfferRepository extends JpaRepository<ChannelOffer, String> {
    /** Live holds on a group that overlap a rental period (count against availability). */
    @Query("select count(o) from ChannelOffer o where o.status = :held and o.sandbox = false "
        + "and upper(o.sippCode) = upper(:sipp) and o.expiresAt > :now and o.pickupAt < :to and o.returnAt > :from and o.id <> :exclude")
    long countHolds(@Param("held") ChannelOffer.Status held, @Param("sipp") String sipp, @Param("from") LocalDateTime from,
                    @Param("to") LocalDateTime to, @Param("now") Instant now, @Param("exclude") String exclude);

    default long countHolds(String sipp, LocalDateTime from, LocalDateTime to, Instant now, String exclude) {
        return countHolds(ChannelOffer.Status.HELD, sipp, from, to, now, exclude);
    }

    @Modifying @Transactional
    @Query("update ChannelOffer o set o.status = :expired where o.status in :open and o.expiresAt < :now")
    int expire(@Param("expired") ChannelOffer.Status expired, @Param("open") List<ChannelOffer.Status> open, @Param("now") Instant now);

    default int expire(Instant now) {
        return expire(ChannelOffer.Status.EXPIRED, List.of(ChannelOffer.Status.QUOTED, ChannelOffer.Status.HELD), now);
    }

    @Modifying @Transactional
    @Query("delete from ChannelOffer o where o.createdAt < :before and o.status <> :converted")
    int purge(@Param("converted") ChannelOffer.Status converted, @Param("before") Instant before);

    default int purge(Instant before) {
        return purge(ChannelOffer.Status.CONVERTED, before);
    }
}
