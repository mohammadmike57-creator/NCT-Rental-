package com.carrental.backend.ota;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

public interface ChannelMessageRepository extends JpaRepository<ChannelMessage, Long> {

    /** Newest first, filtered; body text is searched only when q is given. */
    @Query("select m from ChannelMessage m where m.channelId = :ch and m.createdAt >= :since"
        + " and (:op = '' or m.operation = :op)"
        + " and (:result = '' or (:result = 'ok' and m.success = true) or (:result = 'error' and m.success = false))"
        + " and (:q = '' or m.requestId = :q or m.reservationNumber = :q or m.errorCode = :q"
        + "      or lower(m.requestBody) like :like or lower(m.responseBody) like :like)"
        + " order by m.createdAt desc")
    List<ChannelMessage> search(@Param("ch") String channelId, @Param("since") Instant since, @Param("op") String operation,
                                @Param("result") String result, @Param("q") String q, @Param("like") String like, Pageable page);

    /** duration, operation, success, errorCode, createdAt for the statistics. */
    @Query("select m.durationMs, m.operation, m.success, m.errorCode, m.createdAt, m.sandbox from ChannelMessage m"
        + " where m.channelId = :ch and m.createdAt >= :since")
    List<Object[]> statsRows(@Param("ch") String channelId, @Param("since") Instant since);

    @Modifying
    @Transactional
    @Query("delete from ChannelMessage m where m.createdAt < :before")
    int purge(@Param("before") Instant before);
}
