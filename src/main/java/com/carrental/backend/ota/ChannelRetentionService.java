package com.carrental.backend.ota;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * How long the XML gateway keeps its own working records, and the daily clean-up. Only gateway
 * tables are touched: delivered and dead-lettered webhooks, the delivery log and test (sandbox)
 * bookings. Live broker bookings, reservations and agreements are never removed here.
 * Traffic logs (30 days) and old quotes (3 days) already have their own clean-up.
 */
@Service
public class ChannelRetentionService {

    private static final Logger log = LoggerFactory.getLogger(ChannelRetentionService.class);

    private final ChannelWebhookRepository webhooks;
    private final ChannelDeliveryLogRepository deliveryLog;
    private final ChannelBookingRepository bookings;
    private ConnectorSendRepository connectorSends;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setConnectorSends(ConnectorSendRepository r) { this.connectorSends = r; }
    final int deliveredDays, deadLetterDays, deliveryLogDays, sandboxDays, trafficDays;
    private volatile Map<String, Object> last = Map.of();

    public ChannelRetentionService(ChannelWebhookRepository webhooks, ChannelDeliveryLogRepository deliveryLog, ChannelBookingRepository bookings,
                                   @Value("${channel.retention.delivered-webhook-days:90}") int deliveredDays,
                                   @Value("${channel.retention.dead-letter-days:180}") int deadLetterDays,
                                   @Value("${channel.retention.delivery-log-days:180}") int deliveryLogDays,
                                   @Value("${channel.retention.sandbox-booking-days:90}") int sandboxDays,
                                   @Value("${channel.traffic.retention-days:30}") int trafficDays) {
        this.webhooks = webhooks;
        this.deliveryLog = deliveryLog;
        this.bookings = bookings;
        this.deliveredDays = Math.max(7, deliveredDays);
        this.deadLetterDays = Math.max(30, deadLetterDays);
        this.deliveryLogDays = Math.max(30, deliveryLogDays);
        this.sandboxDays = Math.max(7, sandboxDays);
        this.trafficDays = Math.max(1, trafficDays);
    }

    /** Runs the clean-up and returns how many rows each step removed. */
    public Map<String, Object> run() {
        Instant now = Instant.now();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("deliveredWebhooks", webhooks.purge(ChannelWebhookDelivery.Status.DELIVERED, now.minus(deliveredDays, ChronoUnit.DAYS)));
        out.put("deadLetterWebhooks", webhooks.purge(ChannelWebhookDelivery.Status.FAILED, now.minus(deadLetterDays, ChronoUnit.DAYS)));
        out.put("deliveryLog", deliveryLog.purge(now.minus(deliveryLogDays, ChronoUnit.DAYS)));
        out.put("sandboxBookings", bookings.purgeSandbox(LocalDateTime.now(ZoneId.of("Asia/Amman")).minusDays(sandboxDays)));
        if (connectorSends != null) out.put("connectorMessages", connectorSends.purge(ConnectorSend.Status.PENDING, now.minus(deliveredDays, ChronoUnit.DAYS)));
        out.put("ranAt", now.toString());
        last = Map.copyOf(out);
        log.info("Gateway retention clean-up: {}", out);
        return out;
    }

    /** The policy and the last run, for the console. */
    public Map<String, Object> policy() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("trafficLogDays", trafficDays);
        out.put("quoteDays", 3);
        out.put("deliveredWebhookDays", deliveredDays);
        out.put("deadLetterDays", deadLetterDays);
        out.put("deliveryLogDays", deliveryLogDays);
        out.put("sandboxBookingDays", sandboxDays);
        out.put("lastRun", last);
        return out;
    }
}
