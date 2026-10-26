package com.carrental.backend.ota;

import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Background work for live broker channels, every few minutes:
 *   - automatic no-shows (when the channel sets noShowAfterHours), and
 *   - inventory push: free cars per group per day for the next inventoryPushDays, sent as
 *     inventory.updated only when it differs from what the broker last received (checked at most
 *     every 15 minutes per channel, and re-sent once a day even when unchanged).
 * Channels in testing, paused channels and channels without a webhook are skipped.
 */
@Component
public class ChannelJobs {

    private static final Logger log = LoggerFactory.getLogger(ChannelJobs.class);
    static final Duration CHECK_EVERY = Duration.ofMinutes(15);
    static final Duration RESEND_EVERY = Duration.ofHours(24);

    private final ChannelStateReader channels;
    private final ChannelBookingService core;
    private final ChannelWebhookService webhooks;
    private final ChannelInventorySnapshotRepository snapshots;
    private final boolean enabled;
    private ScheduledExecutorService worker;

    public ChannelJobs(ChannelStateReader channels, ChannelBookingService core, ChannelWebhookService webhooks,
                       ChannelInventorySnapshotRepository snapshots, @Value("${channel.jobs.enabled:true}") boolean enabled) {
        this.channels = channels;
        this.core = core;
        this.webhooks = webhooks;
        this.snapshots = snapshots;
        this.enabled = enabled;
    }

    @PostConstruct
    void start() {
        if (!enabled) return;
        // Own timer: the application does not enable Spring scheduling globally.
        worker = Executors.newSingleThreadScheduledExecutor(r -> { Thread t = new Thread(r, "channel-jobs"); t.setDaemon(true); return t; });
        worker.scheduleWithFixedDelay(this::tick, 90, 300, TimeUnit.SECONDS);
    }

    @PreDestroy
    void stop() { if (worker != null) worker.shutdownNow(); }

    void tick() {
        try {
            for (ChannelSnapshot ch : channels.all()) {
                if ("paused".equalsIgnoreCase(ch.status()) || ch.urlCode().isBlank()) continue;
                try {
                    ChannelBookingService.Ctx c = core.context(ch, false);
                    if (c.sandbox()) continue;
                    core.markNoShows(c);
                    pushInventory(c, false);
                } catch (Exception e) {
                    log.warn("Channel jobs for {}: {}", ch.name(), e.getMessage());
                }
            }
        } catch (Exception e) {
            log.warn("Channel jobs: {}", e.getMessage());
        }
    }

    /** Sends inventory.updated when it changed (or force). Returns true when an event was queued. */
    public boolean pushInventory(ChannelBookingService.Ctx c, boolean force) {
        if (c.rules().webhookUrl().isBlank() || !c.rules().wantsEvent("inventory.updated")) return false;
        ChannelInventorySnapshot last = snapshots.findById(c.channel().id()).orElse(null);
        Instant now = Instant.now();
        if (!force && last != null && last.getCheckedAt().plus(CHECK_EVERY).isAfter(now)) return false;
        ObjectNode inv = core.inventory(c, c.rules().inventoryPushDays());
        ObjectNode compare = inv.deepCopy();
        compare.remove("from");   // the window moves daily; compare the numbers
        compare.remove("to");
        String hash = ChannelBookingService.sha256(ChannelBookingService.write(compare));
        boolean changed = last == null || !hash.equals(last.getHash()) || last.getSentAt().plus(RESEND_EVERY).isBefore(now);
        ChannelInventorySnapshot s = last == null ? new ChannelInventorySnapshot() : last;
        s.setChannelId(c.channel().id());
        s.setCheckedAt(now);
        if (force || changed) {
            if (!webhooks.emitData(c, "inventory.updated", inv)) return false;
            s.setHash(hash);
            s.setSentAt(now);
            snapshots.save(s);
            return true;
        }
        snapshots.save(s);
        return false;
    }
}
