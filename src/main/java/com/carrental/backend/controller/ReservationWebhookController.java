package com.carrental.backend.controller;

import com.carrental.backend.service.ChannelReservationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * Professional Reservation Webhook Controller
 * Receives incoming reservations, modifications, and cancellations from external channels
 *
 * Endpoints:
 * - POST /api/webhook/reservation - New reservation
 * - POST /api/webhook/modification - Reservation modification
 * - POST /api/webhook/cancellation - Reservation cancellation
 *
 * Supports channels: Booking.com, Expedia, Skyscanner, DiscoverCars, Rentalcars.com, etc.
 */
@RestController
@RequestMapping("/api/webhook")
public class ReservationWebhookController {

    private static final Logger logger = LoggerFactory.getLogger(ReservationWebhookController.class);

    @Autowired
    private ChannelReservationService channelReservationService;

    /**
     * Receive new reservation from external channel
     *
     * Accepts OTA_VehResRQ XML format
     * Returns OTA_VehResRS XML response
     *
     * Professional XML Processing:
     * - Validates XML structure and schema
     * - Prevents XXE and injection attacks
     * - Logs detailed debugging information
     * - Handles errors gracefully with OTA-compliant responses
     */
    @PostMapping(value = "/reservation",
                 consumes = {MediaType.APPLICATION_XML_VALUE, MediaType.TEXT_XML_VALUE},
                 produces = {MediaType.APPLICATION_XML_VALUE})
    public ResponseEntity<String> receiveReservation(
            @RequestBody String xmlContent,
            @RequestHeader(value = "X-Channel-Code", required = false) String channelCode,
            @RequestHeader(value = "X-Channel-Signature", required = false) String signature,
            @RequestHeader(value = "X-Request-ID", required = false) String requestId) {

        long startTime = System.currentTimeMillis();
        String correlationId = requestId != null ? requestId : java.util.UUID.randomUUID().toString();

        try {
            logger.info("[{}] Received new reservation webhook from channel: {}", correlationId, channelCode);

            // Log XML summary (without sensitive data)
            String xmlSummary = xmlParser.extractXmlSummary(xmlContent);
            logger.info("[{}] XML Summary:\n{}", correlationId, xmlSummary);

            // Get XML statistics
            Map<String, Object> xmlStats = xmlParser.getXmlStatistics(xmlContent);
            logger.debug("[{}] XML Statistics: {}", correlationId, xmlStats);

            // Validate XML structure
            boolean isValid = xmlParser.validateXml(xmlContent, "OTA_VehResRQ");
            if (!isValid) {
                logger.error("[{}] XML validation failed for OTA_VehResRQ", correlationId);
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(generateErrorXml("400", "Invalid XML structure - does not conform to OTA_VehResRQ schema"));
            }

            // Validate signature (if provided)
            if (signature != null) {
                boolean validSignature = validateSignature(xmlContent, signature, channelCode);
                if (!validSignature) {
                    logger.error("[{}] Invalid signature for channel: {}", correlationId, channelCode);
                    return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(generateErrorXml("401", "Invalid signature"));
                }
            }

            // Process reservation
            Map<String, Object> result = channelReservationService.processNewReservation(xmlContent);

            String xmlResponse = (String) result.get("xmlResponse");
            boolean success = (boolean) result.get("success");

            long duration = System.currentTimeMillis() - startTime;
            logger.info("[{}] Reservation processed in {}ms - Success: {}, Confirmation: {}",
                correlationId, duration, success, result.get("confirmationNumber"));

            // Log formatted response for debugging
            if (logger.isDebugEnabled()) {
                String prettyResponse = xmlParser.prettyPrintXml(xmlResponse);
                logger.debug("[{}] XML Response:\n{}", correlationId, prettyResponse);
            }

            return ResponseEntity
                .status(success ? HttpStatus.OK : HttpStatus.CONFLICT)
                .contentType(MediaType.APPLICATION_XML)
                .header("X-Correlation-ID", correlationId)
                .header("X-Processing-Time-Ms", String.valueOf(duration))
                .body(xmlResponse);

        } catch (IllegalArgumentException e) {
            // XML validation or sanitization errors
            long duration = System.currentTimeMillis() - startTime;
            logger.error("[{}] XML validation error after {}ms: {}", correlationId, duration, e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .header("X-Correlation-ID", correlationId)
                .body(generateErrorXml("400", "Invalid XML: " + e.getMessage()));

        } catch (Exception e) {
            long duration = System.currentTimeMillis() - startTime;
            logger.error("[{}] Error processing reservation webhook after {}ms", correlationId, duration, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .header("X-Correlation-ID", correlationId)
                .body(generateErrorXml("500", "Internal server error: " + e.getMessage()));
        }
    }

    /**
     * Receive reservation modification from external channel
     *
     * Accepts OTA_VehModifyRQ XML format
     * Returns OTA_VehModifyRS XML response
     */
    @PostMapping(value = "/modification",
                 consumes = {MediaType.APPLICATION_XML_VALUE, MediaType.TEXT_XML_VALUE},
                 produces = {MediaType.APPLICATION_XML_VALUE})
    public ResponseEntity<String> receiveModification(
            @RequestBody String xmlContent,
            @RequestHeader(value = "X-Channel-Code", required = false) String channelCode,
            @RequestHeader(value = "X-Channel-Signature", required = false) String signature) {

        try {
            logger.info("Received modification webhook from channel: {}", channelCode);
            logger.debug("XML Content: {}", xmlContent);

            // Validate signature
            if (signature != null && !validateSignature(xmlContent, signature, channelCode)) {
                logger.error("Invalid signature for channel: {}", channelCode);
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(generateErrorXml("401", "Invalid signature"));
            }

            // Process modification
            Map<String, Object> result = channelReservationService.processModification(xmlContent);

            String xmlResponse = (String) result.get("xmlResponse");
            boolean success = (boolean) result.get("success");

            logger.info("Modification processed - Success: {}, Confirmation: {}",
                success, result.get("confirmationNumber"));

            return ResponseEntity
                .status(success ? HttpStatus.OK : HttpStatus.CONFLICT)
                .contentType(MediaType.APPLICATION_XML)
                .body(xmlResponse);

        } catch (Exception e) {
            logger.error("Error processing modification webhook", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(generateErrorXml("500", "Internal server error: " + e.getMessage()));
        }
    }

    /**
     * Receive reservation cancellation from external channel
     *
     * Accepts OTA_CancelRQ XML format
     * Returns OTA_CancelRS XML response
     */
    @PostMapping(value = "/cancellation",
                 consumes = {MediaType.APPLICATION_XML_VALUE, MediaType.TEXT_XML_VALUE},
                 produces = {MediaType.APPLICATION_XML_VALUE})
    public ResponseEntity<String> receiveCancellation(
            @RequestBody String xmlContent,
            @RequestHeader(value = "X-Channel-Code", required = false) String channelCode,
            @RequestHeader(value = "X-Channel-Signature", required = false) String signature) {

        try {
            logger.info("Received cancellation webhook from channel: {}", channelCode);
            logger.debug("XML Content: {}", xmlContent);

            // Validate signature
            if (signature != null && !validateSignature(xmlContent, signature, channelCode)) {
                logger.error("Invalid signature for channel: {}", channelCode);
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(generateErrorXml("401", "Invalid signature"));
            }

            // Process cancellation
            Map<String, Object> result = channelReservationService.processCancellation(xmlContent);

            String xmlResponse = (String) result.get("xmlResponse");

            logger.info("Cancellation processed - Confirmation: {}, Refund: {}",
                result.get("confirmationNumber"), result.get("refundAmount"));

            return ResponseEntity
                .ok()
                .contentType(MediaType.APPLICATION_XML)
                .body(xmlResponse);

        } catch (Exception e) {
            logger.error("Error processing cancellation webhook", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(generateErrorXml("500", "Internal server error: " + e.getMessage()));
        }
    }

    /**
     * Receive reservation via JSON (alternative format for modern APIs)
     */
    @PostMapping(value = "/reservation/json",
                 consumes = MediaType.APPLICATION_JSON_VALUE,
                 produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> receiveReservationJson(
            @RequestBody Map<String, Object> reservationData,
            @RequestHeader(value = "X-Channel-Code", required = false) String channelCode) {

        try {
            logger.info("Received JSON reservation from channel: {}", channelCode);

            // Convert JSON to internal format and process
            // This is a simplified endpoint for channels that don't support XML

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "JSON webhook received - implementation in progress");
            response.put("channelCode", channelCode);

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            logger.error("Error processing JSON reservation", e);
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }

    /**
     * Health check endpoint for channels to verify webhook availability
     */
    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> healthCheck() {
        Map<String, Object> response = new HashMap<>();
        response.put("status", "OK");
        response.put("service", "NCT Rental Webhook Service");
        response.put("version", "2.0.0");
        response.put("timestamp", java.time.LocalDateTime.now());
        response.put("endpoints", new String[]{
            "POST /api/webhook/reservation",
            "POST /api/webhook/modification",
            "POST /api/webhook/cancellation",
            "POST /api/webhook/reservation/json"
        });

        logger.debug("Health check requested");
        return ResponseEntity.ok(response);
    }

    /**
     * Test endpoint for webhook verification (used during channel setup)
     */
    @PostMapping("/test")
    public ResponseEntity<Map<String, Object>> testWebhook(
            @RequestBody(required = false) String content,
            @RequestHeader(value = "X-Channel-Code", required = false) String channelCode) {

        logger.info("Test webhook received from channel: {}", channelCode);

        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("message", "Webhook test successful");
        response.put("channelCode", channelCode);
        response.put("receivedContent", content != null ? content.substring(0, Math.min(100, content.length())) : null);
        response.put("timestamp", java.time.LocalDateTime.now());

        return ResponseEntity.ok(response);
    }

    /**
     * Validate webhook signature for security
     * Different channels use different signature mechanisms
     */
    private boolean validateSignature(String payload, String signature, String channelCode) {
        // TODO: Implement channel-specific signature validation
        // Booking.com: HMAC-SHA256 with shared secret
        // Expedia: Custom header-based validation
        // Others: Various methods

        logger.debug("Signature validation for channel: {} - Implementation pending", channelCode);

        // For now, accept all (implement in production!)
        return true;
    }

    /**
     * Generate error XML response in OTA format
     */
    private String generateErrorXml(String code, String message) {
        return String.format("""
            <?xml version="1.0" encoding="UTF-8"?>
            <OTA_VehResRS xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0" TimeStamp="%s">
                <Errors>
                    <Error Type="3" Code="%s">%s</Error>
                </Errors>
            </OTA_VehResRS>
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
