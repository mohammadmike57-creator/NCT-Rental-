package com.carrental.backend.ota;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChannelDeliveryLogRepository extends JpaRepository<ChannelDeliveryLog, Long> {
    List<ChannelDeliveryLog> findByChannelIdOrderByCreatedAtDesc(String channelId, Pageable pageable);

    @org.springframework.data.jpa.repository.Modifying @org.springframework.transaction.annotation.Transactional
    @org.springframework.data.jpa.repository.Query("delete from ChannelDeliveryLog l where l.createdAt < :before")
    int purge(@org.springframework.data.repository.query.Param("before") java.time.Instant before);
}
