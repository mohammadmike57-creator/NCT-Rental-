package com.carrental.backend.ota;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.List;

/**
 * Pushes the published rate sheet to a partner's endpoint and records every
 * exchange (outbound pushes and inbound partner requests) in the delivery log.
 */
@Service
@RequiredArgsConstructor
public class ChannelDeliveryService {

    private static final Logger log = LoggerFactory.getLogger(ChannelDeliveryService.class);

    private final ChannelDeliveryLogRepository repository;

    private final HttpClient http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .followRedirects(HttpClient.Redirect.NEVER) // a redirect could point at an internal host
        .build();

    public ChannelDeliveryLog pushRateSheet(ChannelSnapshot ch, String actor) {
        ChannelDeliveryLog entry = newEntry(ch, ChannelDeliveryLog.Direction.OUTBOUND, "RateSheet", actor);
        entry.setVersion(ch.publishedVersion());
        long start = System.nanoTime();
        try {
            if ("paused".equalsIgnoreCase(ch.status())) throw new IllegalStateException("Channel is paused");
            if (ch.publishedVersion() == 0) throw new IllegalStateException("Nothing has been published for this channel yet");
            if (ch.endpointUrl().isBlank()) throw new IllegalStateException("No endpoint URL configured");
            URI uri = OutboundUrlGuard.check(ch.endpointUrl());

            String body = OtaXml.rateSheet(ch);
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            entry.setRequestBytes(bytes.length);

            HttpRequest.Builder req = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(ch.timeoutSeconds()))
                .header("Content-Type", "application/xml; charset=UTF-8")
                .header("Accept", "application/xml, text/xml, */*")
                .header("User-Agent", "NCT-Rental-ChannelManager/1.0")
                .header("X-Message-Type", "RateSheet")
                .header("X-Rate-Version", String.valueOf(ch.publishedVersion()))
                .POST(HttpRequest.BodyPublishers.ofByteArray(bytes));
            String auth = authorizationHeader(ch);
            if (auth != null) req.header("Authorization", auth);

            HttpResponse<String> res = http.send(req.build(), HttpResponse.BodyHandlers.ofString());
            entry.setHttpStatus(res.statusCode());
            entry.setResponseSnippet(res.body());
            entry.setSuccess(res.statusCode() >= 200 && res.statusCode() < 300);
            if (!entry.isSuccess()) entry.setError("Partner responded with HTTP " + res.statusCode());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            entry.setError("Delivery interrupted");
        } catch (Exception e) {
            entry.setError(e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
        } finally {
            entry.setDurationMs((System.nanoTime() - start) / 1_000_000);
        }
        log.info("Rate sheet push to {} v{}: success={} status={} error={}", ch.id(), entry.getVersion(),
            entry.isSuccess(), entry.getHttpStatus(), entry.getError());
        return repository.save(entry);
    }

    /** Basic auth when both username and key are set, otherwise a bearer token. */
    static String authorizationHeader(ChannelSnapshot ch) {
        String user = ch.username();
        String key = ch.apiKey();
        if (!key.isBlank() && !user.isBlank()) {
            return "Basic " + Base64.getEncoder().encodeToString((user + ":" + key).getBytes(StandardCharsets.UTF_8));
        }
        if (!key.isBlank()) return "Bearer " + key;
        return null;
    }

    public void recordInbound(ChannelSnapshot ch, String messageType, int status, boolean success, String error,
                              long requestBytes, long durationMs, String remote) {
        try {
            ChannelDeliveryLog entry = newEntry(ch, ChannelDeliveryLog.Direction.INBOUND, messageType, remote);
            entry.setVersion(ch.publishedVersion());
            entry.setHttpStatus(status);
            entry.setSuccess(success);
            entry.setError(error);
            entry.setRequestBytes(requestBytes);
            entry.setDurationMs(durationMs);
            repository.save(entry);
        } catch (Exception e) {
            // Logging must never break a partner response.
            log.warn("Could not record inbound request for {}: {}", ch.id(), e.getMessage());
        }
    }

    public List<ChannelDeliveryLog> recent(String channelId, int limit) {
        return repository.findByChannelIdOrderByCreatedAtDesc(channelId, PageRequest.of(0, Math.max(1, Math.min(limit, 200))));
    }

    private static ChannelDeliveryLog newEntry(ChannelSnapshot ch, ChannelDeliveryLog.Direction dir, String type, String actor) {
        ChannelDeliveryLog e = new ChannelDeliveryLog();
        e.setChannelId(ch.id());
        e.setChannelName(ch.name());
        e.setDirection(dir);
        e.setMessageType(type);
        e.setActor(actor);
        return e;
    }
}
