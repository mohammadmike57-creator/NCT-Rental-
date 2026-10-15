package com.carrental.backend.service;

import com.carrental.backend.model.*;
import com.carrental.backend.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.w3c.dom.Document;
import org.w3c.dom.Element;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import java.io.StringWriter;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Professional Channel Reservation Service
 * Processes incoming reservations, modifications, and cancellations from external channels
 */
@Service
public class ChannelReservationService {

    private static final Logger logger = LoggerFactory.getLogger(ChannelReservationService.class);
    private static final DateTimeFormatter TIMESTAMP_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    @Autowired
    private ChannelReservationRepository channelReservationRepository;

    @Autowired
    private DistributionChannelRepository distributionChannelRepository;

    @Autowired
    private ChannelRatePlanRepository ratePlanRepository;

    @Autowired
    private VehicleRepository vehicleRepository;

    @Autowired
    private ChannelInventoryRepository inventoryRepository;

    @Autowired
    private XmlReservationParser xmlParser;

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private ObjectMapper objectMapper;

    /**
     * Process new reservation from channel
     */
    @Transactional
    public Map<String, Object> processNewReservation(String xmlContent) {
        try {
            logger.info("Processing new channel reservation");

            // Parse XML
            Map<String, Object> reservationData = xmlParser.parseNewReservation(xmlContent);

            // Create channel reservation
            ChannelReservation channelReservation = new ChannelReservation();
            mapDataToReservation(reservationData, channelReservation);
            channelReservation.setReservationType(ChannelReservation.ReservationType.NEW);
            channelReservation.setRawXmlRequest(xmlContent);

            // Find channel
            String channelCode = (String) reservationData.get("channelCode");
            if (channelCode != null) {
                Optional<DistributionChannel> channelOpt = distributionChannelRepository.findByChannelCode(channelCode);
                channelOpt.ifPresent(channelReservation::setChannel);
            }

            // Generate internal confirmation number
            String internalConfirmation = generateConfirmationNumber();
            channelReservation.setInternalConfirmationNumber(internalConfirmation);

            // Check availability
            boolean available = checkAvailability(channelReservation);

            if (available) {
                // Try to assign vehicle
                Optional<Vehicle> vehicleOpt = findSuitableVehicle(channelReservation);
                vehicleOpt.ifPresent(channelReservation::setAssignedVehicle);

                // Calculate commission
                calculateCommission(channelReservation);

                // Set status
                channelReservation.setReservationStatus(ChannelReservation.ReservationStatus.CONFIRMED);
                channelReservation.setConfirmedAt(LocalDateTime.now());
                channelReservation.setProcessedAt(LocalDateTime.now());

                logger.info("Reservation confirmed: {}", internalConfirmation);
            } else {
                // No availability - requires manual review or rejection
                channelReservation.setReservationStatus(ChannelReservation.ReservationStatus.PENDING_REVIEW);
                channelReservation.setRequiresManualReview(true);
                channelReservation.setReviewReason("No availability for requested vehicle category");

                logger.warn("Reservation requires review - no availability: {}", internalConfirmation);
            }

            // Save reservation
            channelReservation = channelReservationRepository.save(channelReservation);

            // Update inventory
            if (available) {
                updateInventory(channelReservation, 1); // Decrease available by 1
            }

            // Generate XML response
            String responseXml = generateReservationResponse(channelReservation, available);
            channelReservation.setRawXmlResponse(responseXml);
            channelReservationRepository.save(channelReservation);

            // Send notifications
            sendConfirmationNotifications(channelReservation);

            // Return result
            Map<String, Object> result = new HashMap<>();
            result.put("success", available);
            result.put("reservationId", channelReservation.getId());
            result.put("confirmationNumber", internalConfirmation);
            result.put("status", channelReservation.getReservationStatus());
            result.put("xmlResponse", responseXml);

            return result;

        } catch (Exception e) {
            logger.error("Failed to process new reservation", e);
            throw new RuntimeException("Reservation processing failed: " + e.getMessage());
        }
    }

    /**
     * Process reservation modification
     */
    @Transactional
    public Map<String, Object> processModification(String xmlContent) {
        try {
            logger.info("Processing reservation modification");

            // Parse XML
            Map<String, Object> modificationData = xmlParser.parseModificationRequest(xmlContent);

            String originalConfirmation = (String) modificationData.get("originalConfirmationNumber");

            // Find original reservation
            Optional<ChannelReservation> originalOpt =
                channelReservationRepository.findByChannelConfirmationNumber(originalConfirmation);

            if (originalOpt.isEmpty()) {
                logger.error("Original reservation not found: {}", originalConfirmation);
                throw new RuntimeException("Original reservation not found");
            }

            ChannelReservation original = originalOpt.get();

            // Create new reservation record for modification
            ChannelReservation modified = new ChannelReservation();
            mapDataToReservation(modificationData, modified);
            modified.setReservationType(ChannelReservation.ReservationType.MODIFICATION);
            modified.setOriginalReservationId(original.getId());
            modified.setChannel(original.getChannel());
            modified.setRawXmlRequest(xmlContent);

            // Generate new confirmation
            String newConfirmation = generateConfirmationNumber();
            modified.setInternalConfirmationNumber(newConfirmation);

            // Check availability for modified dates/vehicle
            boolean available = checkAvailability(modified);

            if (available) {
                // Release old inventory
                updateInventory(original, -1); // Increase available by 1

                // Reserve new inventory
                updateInventory(modified, 1); // Decrease available by 1

                // Try to assign vehicle
                Optional<Vehicle> vehicleOpt = findSuitableVehicle(modified);
                vehicleOpt.ifPresent(modified::setAssignedVehicle);

                // Calculate commission
                calculateCommission(modified);

                // Set status
                modified.setReservationStatus(ChannelReservation.ReservationStatus.CONFIRMED);
                modified.setModifiedAt(LocalDateTime.now());
                modified.setProcessedAt(LocalDateTime.now());

                // Update original
                original.setReservationStatus(ChannelReservation.ReservationStatus.MODIFIED);
                channelReservationRepository.save(original);

                logger.info("Modification confirmed: {} -> {}", originalConfirmation, newConfirmation);
            } else {
                modified.setReservationStatus(ChannelReservation.ReservationStatus.PENDING_REVIEW);
                modified.setRequiresManualReview(true);
                modified.setReviewReason("No availability for modified reservation");

                logger.warn("Modification requires review: {}", originalConfirmation);
            }

            // Save modified reservation
            modified = channelReservationRepository.save(modified);

            // Generate response
            String responseXml = generateModificationResponse(modified, available);
            modified.setRawXmlResponse(responseXml);
            channelReservationRepository.save(modified);

            // Send notifications
            sendModificationNotifications(modified, original);

            Map<String, Object> result = new HashMap<>();
            result.put("success", available);
            result.put("reservationId", modified.getId());
            result.put("confirmationNumber", newConfirmation);
            result.put("status", modified.getReservationStatus());
            result.put("xmlResponse", responseXml);

            return result;

        } catch (Exception e) {
            logger.error("Failed to process modification", e);
            throw new RuntimeException("Modification processing failed: " + e.getMessage());
        }
    }

    /**
     * Process reservation cancellation
     */
    @Transactional
    public Map<String, Object> processCancellation(String xmlContent) {
        try {
            logger.info("Processing reservation cancellation");

            // Parse XML
            Map<String, Object> cancellationData = xmlParser.parseCancellationRequest(xmlContent);

            String confirmationNumber = (String) cancellationData.get("confirmationNumber");

            // Find reservation
            Optional<ChannelReservation> reservationOpt =
                channelReservationRepository.findByChannelConfirmationNumber(confirmationNumber);

            if (reservationOpt.isEmpty()) {
                logger.error("Reservation not found for cancellation: {}", confirmationNumber);
                throw new RuntimeException("Reservation not found");
            }

            ChannelReservation reservation = reservationOpt.get();

            // Calculate cancellation fees
            BigDecimal cancellationFee = calculateCancellationFee(reservation, cancellationData);
            BigDecimal refundAmount = reservation.getTotalAmount().subtract(cancellationFee);

            // Update reservation
            reservation.setReservationStatus(ChannelReservation.ReservationStatus.CANCELLED);
            reservation.setCancelledAt(LocalDateTime.now());
            reservation.setCancellationReason((String) cancellationData.get("cancellationReason"));
            reservation.setCancellationFeeAmount(cancellationFee);
            reservation.setRefundAmount(refundAmount);
            reservation.setRawXmlRequest(xmlContent);

            // Release inventory
            updateInventory(reservation, -1); // Increase available by 1

            // Save
            reservation = channelReservationRepository.save(reservation);

            // Generate response
            String responseXml = generateCancellationResponse(reservation);
            reservation.setRawXmlResponse(responseXml);
            channelReservationRepository.save(reservation);

            // Send notifications
            sendCancellationNotifications(reservation);

            logger.info("Cancellation processed: {} (Fee: {}, Refund: {})",
                confirmationNumber, cancellationFee, refundAmount);

            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("reservationId", reservation.getId());
            result.put("confirmationNumber", confirmationNumber);
            result.put("cancellationFee", cancellationFee);
            result.put("refundAmount", refundAmount);
            result.put("xmlResponse", responseXml);

            return result;

        } catch (Exception e) {
            logger.error("Failed to process cancellation", e);
            throw new RuntimeException("Cancellation processing failed: " + e.getMessage());
        }
    }

    /**
     * Map parsed data to ChannelReservation entity
     */
    private void mapDataToReservation(Map<String, Object> data, ChannelReservation reservation) {
        // Channel info
        reservation.setChannelCode((String) data.get("channelCode"));
        reservation.setChannelName((String) data.get("channelName"));
        reservation.setChannelConfirmationNumber((String) data.get("confirmationNumber"));

        // Dates
        reservation.setPickupDate((java.time.LocalDate) data.get("pickupDate"));
        reservation.setPickupDateTime((LocalDateTime) data.get("pickupDateTime"));
        reservation.setReturnDate((java.time.LocalDate) data.get("returnDate"));
        reservation.setReturnDateTime((LocalDateTime) data.get("returnDateTime"));

        // Locations
        reservation.setPickupLocationCode((String) data.get("pickupLocationCode"));
        reservation.setPickupLocationName((String) data.get("pickupLocationName"));
        reservation.setReturnLocationCode((String) data.get("returnLocationCode"));
        reservation.setReturnLocationName((String) data.get("returnLocationName"));

        // Vehicle
        reservation.setVehicleCategory((String) data.get("vehicleCategory"));
        reservation.setVehicleType((String) data.get("vehicleType"));
        reservation.setVehicleSize((String) data.get("vehicleSize"));
        reservation.setVehicleModel((String) data.get("vehicleModel"));

        // Customer
        reservation.setCustomerFirstName((String) data.get("customerFirstName"));
        reservation.setCustomerLastName((String) data.get("customerLastName"));
        reservation.setCustomerFullName((String) data.get("customerFullName"));
        reservation.setCustomerEmail((String) data.get("customerEmail"));
        reservation.setCustomerPhone((String) data.get("customerPhone"));
        reservation.setCustomerAddress((String) data.get("customerAddress"));
        reservation.setCustomerCity((String) data.get("customerCity"));
        reservation.setCustomerPostalCode((String) data.get("customerPostalCode"));
        reservation.setCustomerCountry((String) data.get("customerCountry"));

        // License
        reservation.setLicenseNumber((String) data.get("licenseNumber"));
        reservation.setLicenseType((String) data.get("licenseType"));
        reservation.setLicenseCountry((String) data.get("licenseCountry"));
        reservation.setLicenseExpiryDate((java.time.LocalDate) data.get("licenseExpiryDate"));

        // Driver
        reservation.setDriverAge((Integer) data.get("driverAge"));
        reservation.setAdditionalDriversCount((Integer) data.get("additionalDriversCount"));

        // Pricing
        reservation.setRateCode((String) data.get("rateCode"));
        reservation.setRatePlanId((String) data.get("ratePlanId"));
        reservation.setTotalAmount((BigDecimal) data.get("totalAmount"));
        reservation.setCurrency((String) data.get("currency"));

        // Additional info
        reservation.setSpecialRequests((String) data.get("specialRequests"));
        reservation.setFlightNumber((String) data.get("flightNumber"));

        // Insurance options
        if (data.containsKey("insuranceOptions")) {
            try {
                reservation.setInsuranceOptions(objectMapper.writeValueAsString(data.get("insuranceOptions")));
            } catch (Exception e) {
                logger.error("Failed to serialize insurance options", e);
            }
        }

        reservation.setReceivedAt((LocalDateTime) data.getOrDefault("receivedAt", LocalDateTime.now()));
    }

    /**
     * Check availability for reservation
     */
    private boolean checkAvailability(ChannelReservation reservation) {
        try {
            List<ChannelInventory> inventory = inventoryRepository.findByChannelIdAndVehicleCategoryAndDateRange(
                reservation.getChannel() != null ? reservation.getChannel().getId() : null,
                reservation.getVehicleCategory(),
                reservation.getPickupDate(),
                reservation.getReturnDate()
            );

            // Check if any date in range has stop-sale or no availability
            for (ChannelInventory inv : inventory) {
                if (inv.isStopSale()) {
                    logger.warn("Stop-sale active for {} on {}", inv.getVehicleCategory(), inv.getInventoryDate());
                    return false;
                }

                int available = inv.getTotalAvailable() - inv.getTotalBooked();
                if (available <= 0) {
                    logger.warn("No availability for {} on {}", inv.getVehicleCategory(), inv.getInventoryDate());
                    return false;
                }
            }

            return true;

        } catch (Exception e) {
            logger.error("Error checking availability", e);
            return false;
        }
    }

    /**
     * Find suitable vehicle for reservation
     */
    private Optional<Vehicle> findSuitableVehicle(ChannelReservation reservation) {
        List<Vehicle> vehicles = vehicleRepository.findByCategoryAndStatus(
            reservation.getVehicleCategory(),
            Vehicle.VehicleStatus.AVAILABLE
        );

        return vehicles.stream().findFirst();
    }

    /**
     * Calculate channel commission
     */
    private void calculateCommission(ChannelReservation reservation) {
        if (reservation.getChannel() == null) {
            return;
        }

        DistributionChannel channel = reservation.getChannel();
        BigDecimal totalAmount = reservation.getTotalAmount();

        if (totalAmount == null) {
            return;
        }

        BigDecimal commission = BigDecimal.ZERO;

        if (channel.getCommissionType() == DistributionChannel.CommissionType.PERCENTAGE) {
            commission = totalAmount.multiply(
                BigDecimal.valueOf(channel.getCommissionValue()).divide(BigDecimal.valueOf(100))
            );
        } else if (channel.getCommissionType() == DistributionChannel.CommissionType.FIXED_AMOUNT) {
            commission = BigDecimal.valueOf(channel.getCommissionValue());
        }

        reservation.setChannelCommissionAmount(commission);
        reservation.setChannelCommissionPercent(
            channel.getCommissionType() == DistributionChannel.CommissionType.PERCENTAGE ?
                BigDecimal.valueOf(channel.getCommissionValue()) : null
        );
        reservation.setNetRevenue(totalAmount.subtract(commission));
    }

    /**
     * Calculate cancellation fee
     */
    private BigDecimal calculateCancellationFee(ChannelReservation reservation, Map<String, Object> cancellationData) {
        // Check if fee info provided in XML
        if (cancellationData.containsKey("cancellationFeeAmount")) {
            return (BigDecimal) cancellationData.get("cancellationFeeAmount");
        }

        if (cancellationData.containsKey("cancellationFeePercent")) {
            BigDecimal percent = (BigDecimal) cancellationData.get("cancellationFeePercent");
            return reservation.getTotalAmount().multiply(percent.divide(BigDecimal.valueOf(100)));
        }

        // Default cancellation policy: 48 hours
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime pickupTime = reservation.getPickupDateTime();

        if (pickupTime == null) {
            return BigDecimal.ZERO;
        }

        long hoursUntilPickup = java.time.Duration.between(now, pickupTime).toHours();

        if (hoursUntilPickup >= 48) {
            return BigDecimal.ZERO; // Free cancellation
        } else if (hoursUntilPickup >= 24) {
            return reservation.getTotalAmount().multiply(BigDecimal.valueOf(0.5)); // 50% fee
        } else {
            return reservation.getTotalAmount(); // 100% fee (no-show)
        }
    }

    /**
     * Update inventory counts
     */
    private void updateInventory(ChannelReservation reservation, int delta) {
        try {
            List<ChannelInventory> inventoryList = inventoryRepository.findByChannelIdAndVehicleCategoryAndDateRange(
                reservation.getChannel() != null ? reservation.getChannel().getId() : null,
                reservation.getVehicleCategory(),
                reservation.getPickupDate(),
                reservation.getReturnDate()
            );

            for (ChannelInventory inv : inventoryList) {
                inv.setTotalBooked(inv.getTotalBooked() + delta);
                inventoryRepository.save(inv);
            }

        } catch (Exception e) {
            logger.error("Failed to update inventory", e);
        }
    }

    /**
     * Generate confirmation number
     */
    private String generateConfirmationNumber() {
        String prefix = "RSV";
        String year = String.valueOf(java.time.Year.now().getValue());
        long count = channelReservationRepository.count() + 1;
        return String.format("%s-%s-%05d", prefix, year, count);
    }

    /**
     * Generate XML reservation response
     */
    private String generateReservationResponse(ChannelReservation reservation, boolean success) {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.newDocument();

            Element root = doc.createElement("OTA_VehResRS");
            root.setAttribute("xmlns", "http://www.opentravel.org/OTA/2003/05");
            root.setAttribute("Version", "1.0");
            root.setAttribute("TimeStamp", LocalDateTime.now().format(TIMESTAMP_FORMAT));
            doc.appendChild(root);

            if (success) {
                Element successEl = doc.createElement("Success");
                root.appendChild(successEl);

                Element vehResRSCore = doc.createElement("VehResRSCore");
                root.appendChild(vehResRSCore);

                Element confID = doc.createElement("VehReservation");
                Element uniqueID = doc.createElement("UniqueID");
                uniqueID.setAttribute("Type", "14");
                uniqueID.setAttribute("ID", reservation.getInternalConfirmationNumber());
                confID.appendChild(uniqueID);
                vehResRSCore.appendChild(confID);
            } else {
                Element errors = doc.createElement("Errors");
                root.appendChild(errors);

                Element error = doc.createElement("Error");
                error.setAttribute("Type", "3");
                error.setAttribute("Code", "322");
                error.setTextContent("No availability for requested vehicle category");
                errors.appendChild(error);
            }

            return documentToString(doc);

        } catch (Exception e) {
            logger.error("Failed to generate reservation response XML", e);
            return "";
        }
    }

    /**
     * Generate modification response
     */
    private String generateModificationResponse(ChannelReservation reservation, boolean success) {
        return generateReservationResponse(reservation, success);
    }

    /**
     * Generate cancellation response
     */
    private String generateCancellationResponse(ChannelReservation reservation) {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.newDocument();

            Element root = doc.createElement("OTA_CancelRS");
            root.setAttribute("xmlns", "http://www.opentravel.org/OTA/2003/05");
            root.setAttribute("Version", "1.0");
            root.setAttribute("TimeStamp", LocalDateTime.now().format(TIMESTAMP_FORMAT));
            doc.appendChild(root);

            Element success = doc.createElement("Success");
            root.appendChild(success);

            Element uniqueID = doc.createElement("UniqueID");
            uniqueID.setAttribute("Type", "14");
            uniqueID.setAttribute("ID", reservation.getInternalConfirmationNumber());
            root.appendChild(uniqueID);

            Element cancelConfirmNumber = doc.createElement("CancelConfirmNumber");
            cancelConfirmNumber.setTextContent("CNCL-" + reservation.getInternalConfirmationNumber());
            root.appendChild(cancelConfirmNumber);

            return documentToString(doc);

        } catch (Exception e) {
            logger.error("Failed to generate cancellation response XML", e);
            return "";
        }
    }

    /**
     * Send confirmation notifications
     */
    private void sendConfirmationNotifications(ChannelReservation reservation) {
        if (reservation.getCustomerEmail() != null) {
            try {
                Map<String, String> variables = new HashMap<>();
                variables.put("customerName", reservation.getCustomerFullName());
                variables.put("confirmationNumber", reservation.getInternalConfirmationNumber());
                variables.put("pickupDate", reservation.getPickupDate().toString());
                variables.put("vehicleCategory", reservation.getVehicleCategory());

                notificationService.sendNotification(
                    reservation.getCustomerEmail(),
                    "Channel Reservation Confirmed",
                    "Your reservation {{confirmationNumber}} has been confirmed for {{pickupDate}}.",
                    variables
                );

                reservation.setEmailConfirmationSent(true);
            } catch (Exception e) {
                logger.error("Failed to send confirmation email", e);
            }
        }
    }

    /**
     * Send modification notifications
     */
    private void sendModificationNotifications(ChannelReservation modified, ChannelReservation original) {
        // Similar to confirmation
        sendConfirmationNotifications(modified);
    }

    /**
     * Send cancellation notifications
     */
    private void sendCancellationNotifications(ChannelReservation reservation) {
        if (reservation.getCustomerEmail() != null) {
            try {
                Map<String, String> variables = new HashMap<>();
                variables.put("customerName", reservation.getCustomerFullName());
                variables.put("confirmationNumber", reservation.getInternalConfirmationNumber());
                variables.put("refundAmount", reservation.getRefundAmount() != null ?
                    reservation.getRefundAmount().toString() : "0.00");

                notificationService.sendNotification(
                    reservation.getCustomerEmail(),
                    "Reservation Cancelled",
                    "Your reservation {{confirmationNumber}} has been cancelled. Refund: ${{refundAmount}}",
                    variables
                );
            } catch (Exception e) {
                logger.error("Failed to send cancellation email", e);
            }
        }
    }

    /**
     * Convert XML document to string
     */
    private String documentToString(Document doc) throws Exception {
        TransformerFactory tf = TransformerFactory.newInstance();
        Transformer transformer = tf.newTransformer();
        transformer.setOutputProperty(OutputKeys.INDENT, "yes");
        transformer.setOutputProperty(OutputKeys.ENCODING, "UTF-8");

        StringWriter writer = new StringWriter();
        transformer.transform(new DOMSource(doc), new StreamResult(writer));
        return writer.toString();
    }
}
