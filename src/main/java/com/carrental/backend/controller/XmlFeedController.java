package com.carrental.backend.controller;

import com.carrental.backend.service.XmlFeedService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

/**
 * Professional XML Feed Controller
 * Serves XML feeds to external distribution channels
 *
 * Endpoints:
 * - GET /api/feeds/rates - Rate & availability feed (ARI)
 * - GET /api/feeds/vehicles - Vehicle catalog feed
 * - GET /api/feeds/terms - Terms & conditions feed
 * - GET /api/feeds/inventory - Real-time inventory feed
 * - POST /api/feeds/stop-sale - Stop-sale notification
 *
 * Supports: Booking.com, Expedia, Skyscanner, DiscoverCars, Rentalcars.com, etc.
 */
@RestController
@RequestMapping("/api/feeds")
public class XmlFeedController {

    private static final Logger logger = LoggerFactory.getLogger(XmlFeedController.class);

    @Autowired
    private XmlFeedService xmlFeedService;

    /**
     * Generate Rate & Availability Feed (ARI - Availability, Rates, Inventory)
     *
     * This is the primary feed for distributing rates to channels
     *
     * Query Parameters:
     * - channelId: Distribution channel ID
     * - startDate: Start date for rate period
     * - endDate: End date for rate period
     *
     * Returns: OTA_VehAvailRateRS XML
     */
    @GetMapping(value = "/rates", produces = MediaType.APPLICATION_XML_VALUE)
    public ResponseEntity<String> getRateFeed(
            @RequestParam(required = true) String channelId,
            @RequestParam(required = true) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = true) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestHeader(value = "X-Api-Key", required = false) String apiKey) {

        try {
            logger.info("Rate feed requested - Channel: {}, Period: {} to {}", channelId, startDate, endDate);

            // Validate API key (for production security)
            if (!validateApiKey(apiKey, channelId)) {
                logger.error("Invalid API key for channel: {}", channelId);
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(generateErrorXml("401", "Invalid API key"));
            }

            // Validate date range
            if (endDate.isBefore(startDate)) {
                logger.error("Invalid date range: {} to {}", startDate, endDate);
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(generateErrorXml("400", "End date must be after start date"));
            }

            // Generate feed
            String xmlFeed = xmlFeedService.generateRateAvailabilityFeed(channelId, startDate, endDate);

            logger.info("Rate feed generated successfully - {} bytes", xmlFeed.length());

            return ResponseEntity
                .ok()
                .contentType(MediaType.APPLICATION_XML)
                .header("X-Feed-Type", "ARI")
                .header("X-Feed-Version", "1.0")
                .body(xmlFeed);

        } catch (Exception e) {
            logger.error("Error generating rate feed", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(generateErrorXml("500", "Failed to generate rate feed: " + e.getMessage()));
        }
    }

    /**
     * Generate Vehicle Catalog Feed
     *
     * Distributes complete vehicle inventory to channels
     *
     * Returns: OTA_VehDescriptiveInfoRS XML
     */
    @GetMapping(value = "/vehicles", produces = MediaType.APPLICATION_XML_VALUE)
    public ResponseEntity<String> getVehicleCatalogFeed(
            @RequestParam(required = true) String channelId,
            @RequestHeader(value = "X-Api-Key", required = false) String apiKey) {

        try {
            logger.info("Vehicle catalog feed requested - Channel: {}", channelId);

            if (!validateApiKey(apiKey, channelId)) {
                logger.error("Invalid API key for channel: {}", channelId);
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(generateErrorXml("401", "Invalid API key"));
            }

            String xmlFeed = xmlFeedService.generateVehicleCatalogFeed(channelId);

            logger.info("Vehicle catalog feed generated - {} bytes", xmlFeed.length());

            return ResponseEntity
                .ok()
                .contentType(MediaType.APPLICATION_XML)
                .header("X-Feed-Type", "VehicleCatalog")
                .header("X-Feed-Version", "1.0")
                .body(xmlFeed);

        } catch (Exception e) {
            logger.error("Error generating vehicle catalog feed", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(generateErrorXml("500", "Failed to generate vehicle catalog: " + e.getMessage()));
        }
    }

    /**
     * Generate Terms & Conditions Feed
     *
     * Distributes rental terms, policies, and cancellation rules
     *
     * Returns: OTA_VehPolicyRS XML
     */
    @GetMapping(value = "/terms", produces = MediaType.APPLICATION_XML_VALUE)
    public ResponseEntity<String> getTermsFeed(
            @RequestParam(required = true) String channelId,
            @RequestHeader(value = "X-Api-Key", required = false) String apiKey) {

        try {
            logger.info("Terms & conditions feed requested - Channel: {}", channelId);

            if (!validateApiKey(apiKey, channelId)) {
                logger.error("Invalid API key for channel: {}", channelId);
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(generateErrorXml("401", "Invalid API key"));
            }

            String xmlFeed = xmlFeedService.generateTermsAndConditionsFeed(channelId);

            logger.info("Terms feed generated - {} bytes", xmlFeed.length());

            return ResponseEntity
                .ok()
                .contentType(MediaType.APPLICATION_XML)
                .header("X-Feed-Type", "TermsAndConditions")
                .header("X-Feed-Version", "1.0")
                .body(xmlFeed);

        } catch (Exception e) {
            logger.error("Error generating terms feed", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(generateErrorXml("500", "Failed to generate terms feed: " + e.getMessage()));
        }
    }

    /**
     * Generate Real-Time Inventory Feed
     *
     * Provides current availability for a specific date
     *
     * Returns: OTA_HotelAvailNotifRQ XML (adapted for car rental)
     */
    @GetMapping(value = "/inventory", produces = MediaType.APPLICATION_XML_VALUE)
    public ResponseEntity<String> getInventoryFeed(
            @RequestParam(required = true) String channelId,
            @RequestParam(required = true) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestHeader(value = "X-Api-Key", required = false) String apiKey) {

        try {
            logger.info("Inventory feed requested - Channel: {}, Date: {}", channelId, date);

            if (!validateApiKey(apiKey, channelId)) {
                logger.error("Invalid API key for channel: {}", channelId);
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(generateErrorXml("401", "Invalid API key"));
            }

            String xmlFeed = xmlFeedService.generateInventoryUpdateFeed(channelId, date);

            logger.info("Inventory feed generated - {} bytes", xmlFeed.length());

            return ResponseEntity
                .ok()
                .contentType(MediaType.APPLICATION_XML)
                .header("X-Feed-Type", "Inventory")
                .header("X-Feed-Version", "1.0")
                .body(xmlFeed);

        } catch (Exception e) {
            logger.error("Error generating inventory feed", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(generateErrorXml("500", "Failed to generate inventory feed: " + e.getMessage()));
        }
    }

    /**
     * Post Stop-Sale Notification
     *
     * Immediately notifies channels when a vehicle category is sold out
     *
     * Request Body (JSON):
     * {
     *   "channelId": "channel-123",
     *   "vehicleCategory": "ECAR",
     *   "startDate": "2025-06-01",
     *   "endDate": "2025-06-15",
     *   "reason": "Sold out"
     * }
     *
     * Returns: OTA_VehAvailRateNotifRQ XML
     */
    @PostMapping(value = "/stop-sale",
                 consumes = MediaType.APPLICATION_JSON_VALUE,
                 produces = MediaType.APPLICATION_XML_VALUE)
    public ResponseEntity<String> postStopSale(
            @RequestBody Map<String, Object> request,
            @RequestHeader(value = "X-Api-Key", required = false) String apiKey) {

        try {
            String channelId = (String) request.get("channelId");
            String vehicleCategory = (String) request.get("vehicleCategory");
            LocalDate startDate = LocalDate.parse((String) request.get("startDate"));
            LocalDate endDate = LocalDate.parse((String) request.get("endDate"));
            String reason = (String) request.get("reason");

            logger.info("Stop-sale notification - Channel: {}, Category: {}, Period: {} to {}",
                channelId, vehicleCategory, startDate, endDate);

            if (!validateApiKey(apiKey, channelId)) {
                logger.error("Invalid API key for channel: {}", channelId);
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(generateErrorXml("401", "Invalid API key"));
            }

            String xmlNotification = xmlFeedService.generateStopSaleNotification(
                channelId, vehicleCategory, startDate, endDate, reason
            );

            logger.info("Stop-sale notification generated - {} bytes", xmlNotification.length());

            return ResponseEntity
                .ok()
                .contentType(MediaType.APPLICATION_XML)
                .header("X-Feed-Type", "StopSale")
                .header("X-Feed-Version", "1.0")
                .body(xmlNotification);

        } catch (Exception e) {
            logger.error("Error generating stop-sale notification", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(generateErrorXml("500", "Failed to generate stop-sale: " + e.getMessage()));
        }
    }

    /**
     * Get feed status and statistics
     */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getFeedStatus(
            @RequestParam(required = true) String channelId,
            @RequestHeader(value = "X-Api-Key", required = false) String apiKey) {

        try {
            logger.info("Feed status requested - Channel: {}", channelId);

            if (!validateApiKey(apiKey, channelId)) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(null);
            }

            Map<String, Object> status = new HashMap<>();
            status.put("channelId", channelId);
            status.put("status", "ACTIVE");
            status.put("lastUpdate", LocalDate.now());
            status.put("availableFeeds", new String[]{
                "rates", "vehicles", "terms", "inventory", "stop-sale"
            });
            status.put("feedVersion", "1.0");
            status.put("otaVersion", "2003/05");

            return ResponseEntity.ok(status);

        } catch (Exception e) {
            logger.error("Error getting feed status", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(null);
        }
    }

    /**
     * Test feed endpoint for channel integration testing
     */
    @GetMapping(value = "/test", produces = MediaType.APPLICATION_XML_VALUE)
    public ResponseEntity<String> testFeed(
            @RequestParam(required = false) String channelId,
            @RequestParam(required = false) String feedType) {

        logger.info("Test feed requested - Channel: {}, Type: {}", channelId, feedType);

        String testXml = """
            <?xml version="1.0" encoding="UTF-8"?>
            <OTA_TestRS xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0">
                <Success/>
                <TestInfo>
                    <ChannelId>%s</ChannelId>
                    <FeedType>%s</FeedType>
                    <Status>OK</Status>
                    <Message>Feed endpoint is operational</Message>
                    <Timestamp>%s</Timestamp>
                </TestInfo>
            </OTA_TestRS>
            """.formatted(
                channelId != null ? channelId : "test-channel",
                feedType != null ? feedType : "test",
                java.time.LocalDateTime.now()
            );

        return ResponseEntity
            .ok()
            .contentType(MediaType.APPLICATION_XML)
            .body(testXml);
    }

    /**
     * Validate API key for channel
     */
    private boolean validateApiKey(String apiKey, String channelId) {
        // TODO: Implement proper API key validation
        // Each channel should have a unique API key stored in database
        // Compare provided key with stored key for the channel

        logger.debug("API key validation for channel: {} - Implementation pending", channelId);

        // For now, accept all (implement in production!)
        return true;
    }

    /**
     * Generate error XML in OTA format
     */
    private String generateErrorXml(String code, String message) {
        return String.format("""
            <?xml version="1.0" encoding="UTF-8"?>
            <OTA_ErrorRS xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0" TimeStamp="%s">
                <Errors>
                    <Error Type="3" Code="%s">%s</Error>
                </Errors>
            </OTA_ErrorRS>
            """,
            java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ISO_DATE_TIME),
            code,
            escapeXml(message)
        );
    }

    /**
     * Escape XML special characters
     */
    private String escapeXml(String text) {
        if (text == null) return "";
        return text.replace("&", "&amp;")
                   .replace("<", "&lt;")
                   .replace(">", "&gt;")
                   .replace("\"", "&quot;")
                   .replace("'", "&apos;");
    }
}
