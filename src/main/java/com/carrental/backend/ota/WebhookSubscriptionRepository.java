package com.carrental.backend.ota;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface WebhookSubscriptionRepository extends JpaRepository<WebhookSubscription, Long> {
    Optional<WebhookSubscription> findByPublicId(String publicId);
    List<WebhookSubscription> findByChannelIdAndEnvironment(String channelId, String environment);
}
