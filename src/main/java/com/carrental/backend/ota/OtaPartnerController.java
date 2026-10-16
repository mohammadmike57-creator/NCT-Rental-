package com.carrental.backend.ota;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;

/**
 * Public XML API for distribution partners (server-to-server, no browser session).
 *
 * Every request must carry the channel's feed key:
 *   Authorization: Bearer <key>   or   X-Api-Key: <key>
 *
 * Endpoints (channel = channel code, e.g. BKG):
 *   POST /ota/v1/{channel}/OTA_VehAvailRate   body: OTA_VehAvailRateRQ  -> OTA_VehAvailRateRS
 *   GET  /ota/v1/{channel}/OTA_VehAvailRate?pickUp=..&return=..&equip=13,ADD
 *   GET  /ota/v1/{channel}/ratesheet          -> published RateSheet
 *   GET  /ota/v1/{channel}/ping               -> connectivity check
 *
 * Partners only ever see the last *published* rate version.
 */
@RestController
@RequestMapping("/ota/v1/{channel}")
@RequiredArgsConstructor
public class OtaPartnerController {

    private static final MediaType XML = new MediaType("application", "xml", StandardCharsets.UTF_8);
    private static final int MAX_REQUESTS_PER_MINUTE = 120;

    private final ChannelStateReader channels;
    private final ChannelDeliveryService deliveries;

    private final Map<String, long[]> rateWindows = new ConcurrentHashMap<>();

    @PostMapping(value = "/OTA_VehAvailRate", consumes = {MediaType.APPLICATION_XML_VALUE, MediaType.TEXT_XML_VALUE, MediaType.ALL_VALUE})
    public ResponseEntity<String> vehAvailRate(@PathVariable String channel, @RequestBody(required = false) String body,
                                               @RequestHeader(value = "Authorization", required = false) String authorization,
                                               @RequestHeader(value = "X-Api-Key", required = false) String apiKey,
                                               HttpServletRequest request) {
        long bytes = body == null ? 0 : body.length();
        return handle(channel, authorization, apiKey, request, "OTA_VehAvailRateRS", "OTA_VehAvailRate", bytes, ch -> {
            OtaRequestParser.ParsedRequest parsed = OtaRequestParser.parse(body);
            if (!parsed.locationCode().isBlank() && !parsed.locationCode().equalsIgnoreCase(ch.locationCode())) {
                throw new OtaRequestParser.InvalidRequestException("Unknown pick-up location " + parsed.locationCode());
            }
            return OtaXml.vehAvailRateRS(ch, parsed.quote(), parsed.echoToken());
        });
    }

    @GetMapping("/OTA_VehAvailRate")
    public ResponseEntity<String> vehAvailRateGet(@PathVariable String channel,
                                                  @RequestParam String pickUp,
                                                  @RequestParam(name = "return") String dropOff,
                                                  @RequestParam(required = false) String equip,
                                                  @RequestHeader(value = "Authorization", required = false) String authorization,
                                                  @RequestHeader(value = "X-Api-Key", required = false) String apiKey,
                                                  HttpServletRequest request) {
        return handle(channel, authorization, apiKey, request, "OTA_VehAvailRateRS", "OTA_VehAvailRate", 0, ch -> {
            LocalDateTime from = OtaRequestParser.parseDateTime(pickUp, "pickUp");
            LocalDateTime to = OtaRequestParser.parseDateTime(dropOff, "return");
            OtaRequestParser.validateRange(from, to);
            List<String> codes = new ArrayList<>();
            if (equip != null) for (String c : equip.split(",")) if (!c.isBlank()) codes.add(c.trim());
            return OtaXml.vehAvailRateRS(ch, new OtaXml.QuoteRequest(from, to, codes), null);
        });
    }

    @GetMapping("/ratesheet")
    public ResponseEntity<String> rateSheet(@PathVariable String channel,
                                            @RequestHeader(value = "Authorization", required = false) String authorization,
                                            @RequestHeader(value = "X-Api-Key", required = false) String apiKey,
                                            HttpServletRequest request) {
        return handle(channel, authorization, apiKey, request, "RateSheetRS", "RateSheet", 0, OtaXml::rateSheet);
    }

    @GetMapping("/ping")
    public ResponseEntity<String> ping(@PathVariable String channel,
                                       @RequestHeader(value = "Authorization", required = false) String authorization,
                                       @RequestHeader(value = "X-Api-Key", required = false) String apiKey,
                                       HttpServletRequest request) {
        return handle(channel, authorization, apiKey, request, "OTA_PingRS", "Ping", 0, ch ->
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<OTA_PingRS xmlns=\"" + OtaXml.OTA_NAMESPACE + "\" Version=\"1.000\">\n"
                + "  <Success/>\n  <EchoData>" + OtaXml.escape(ch.name() + " v" + ch.publishedVersion()) + "</EchoData>\n</OTA_PingRS>");
    }

    private ResponseEntity<String> handle(String code, String authorization, String apiKey, HttpServletRequest request,
                                          String errorRoot, String messageType, long requestBytes,
                                          Function<ChannelSnapshot, String> action) {
        long start = System.nanoTime();
        String remote = request.getRemoteAddr();
        if (!allow(code + "|" + remote)) {
            return xml(HttpStatus.TOO_MANY_REQUESTS, OtaXml.errorRS(errorRoot, "429", "Rate limit exceeded, retry in a minute", null));
        }
        Optional<ChannelSnapshot> found = channels.find(code);
        String key = PartnerKeyVerifier.extractKey(authorization, apiKey);
        // Same answer for unknown channel and wrong key, so channel codes cannot be probed.
        if (found.isEmpty() || !PartnerKeyVerifier.matches(found.get(), key)) {
            found.ifPresent(ch -> deliveries.recordInbound(ch, messageType, 401, false, "Invalid or missing feed key",
                requestBytes, elapsed(start), remote));
            return xml(HttpStatus.UNAUTHORIZED, OtaXml.errorRS(errorRoot, "401", "Invalid or missing feed key", null));
        }
        ChannelSnapshot ch = found.get();
        if ("paused".equalsIgnoreCase(ch.status())) {
            deliveries.recordInbound(ch, messageType, 403, false, "Channel is paused", requestBytes, elapsed(start), remote);
            return xml(HttpStatus.FORBIDDEN, OtaXml.errorRS(errorRoot, "403", "Distribution to this channel is paused", null));
        }
        try {
            String body = action.apply(ch);
            deliveries.recordInbound(ch, messageType, 200, true, null, requestBytes, elapsed(start), remote);
            return xml(HttpStatus.OK, body);
        } catch (OtaRequestParser.InvalidRequestException e) {
            deliveries.recordInbound(ch, messageType, 400, false, e.getMessage(), requestBytes, elapsed(start), remote);
            return xml(HttpStatus.BAD_REQUEST, OtaXml.errorRS(errorRoot, "400", e.getMessage(), null));
        } catch (Exception e) {
            deliveries.recordInbound(ch, messageType, 500, false, e.getClass().getSimpleName(), requestBytes, elapsed(start), remote);
            return xml(HttpStatus.INTERNAL_SERVER_ERROR, OtaXml.errorRS(errorRoot, "500", "Internal error", null));
        }
    }

    /** Fixed one-minute window per channel + client address. */
    private boolean allow(String bucket) {
        long minute = System.currentTimeMillis() / 60_000;
        long[] w = rateWindows.compute(bucket, (k, v) -> (v == null || v[0] != minute) ? new long[]{minute, 1} : new long[]{minute, v[1] + 1});
        if (rateWindows.size() > 10_000) rateWindows.entrySet().removeIf(e -> e.getValue()[0] != minute);
        return w[1] <= MAX_REQUESTS_PER_MINUTE;
    }

    private static long elapsed(long start) {
        return (System.nanoTime() - start) / 1_000_000;
    }

    private static ResponseEntity<String> xml(HttpStatus status, String body) {
        return ResponseEntity.status(status).contentType(XML).header("Cache-Control", "no-store").body(body);
    }
}
