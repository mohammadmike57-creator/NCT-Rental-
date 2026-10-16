package com.carrental.backend.ota;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChannelDeliveryLogRepository extends JpaRepository<ChannelDeliveryLog, Long> {
    List<ChannelDeliveryLog> findByChannelIdOrderByCreatedAtDesc(String channelId, Pageable pageable);
}
