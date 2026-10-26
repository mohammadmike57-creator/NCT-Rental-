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

public interface ChannelWebhookRepository extends JpaRepository<ChannelWebhookDelivery, Long> {
    List<ChannelWebhookDelivery> findTop50ByStatusAndNextAttemptAtBeforeOrderByNextAttemptAtAsc(ChannelWebhookDelivery.Status status, Instant now);
    List<ChannelWebhookDelivery> findByChannelIdOrderByCreatedAtDesc(String channelId, Pageable page);
}
