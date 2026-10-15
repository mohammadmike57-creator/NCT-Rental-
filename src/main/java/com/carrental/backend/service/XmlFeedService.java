package com.carrental.backend.service;

import com.carrental.backend.model.*;
import com.carrental.backend.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
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
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * Professional XML Feed Service for Channel Distribution
 * Generates OTA-compliant XML feeds for:
 * - Rate updates (ARI - Availability, Rates, Inventory)
 * - Stop-sale notifications
 * - Vehicle catalog distribution
 * - Terms & conditions distribution
 */
@Service
public class XmlFeedService {

    private static final Logger logger = LoggerFactory.getLogger(XmlFeedService.class);
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter TIMESTAMP_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    @Autowired
    private ChannelRatePlanRepository ratePlanRepository;

    @Autowired
    private ChannelInventoryRepository inventoryRepository;

    @Autowired
    private VehicleRepository vehicleRepository;

    @Autowired
    private DistributionChannelRepository channelRepository;

    @Value("${app.name:NCT Rental CRM}")
    private String companyName;

    @Value("${app.base-url:https://www.nctrental.com}")
    private String baseUrl;

    /**
     * Generate OTA_VehAvailRateRQ - Professional Rate & Availability XML Feed
     * This is the industry standard for Booking.com, Expedia, Skyscanner, etc.
     */
    public String generateRateAvailabilityFeed(String channelId, LocalDate startDate, LocalDate endDate) {
        try {
            logger.info("Generating rate/availability XML feed for channel {} from {} to {}",
                channelId, startDate, endDate);

            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.newDocument();

            // Root element with OTA namespace
            Element root = doc.createElement("OTA_VehAvailRateRS");
            root.setAttribute("xmlns", "http://www.opentravel.org/OTA/2003/05");
            root.setAttribute("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance");
            root.setAttribute("Version", "1.0");
            root.setAttribute("TimeStamp", java.time.LocalDateTime.now().format(TIMESTAMP_FORMAT));
            doc.appendChild(root);

            // Success indicator
            Element success = doc.createElement("Success");
            root.appendChild(success);

            // Vehicle rental core
            Element vehRentalCore = doc.createElement("VehRentalCore");
            vehRentalCore.setAttribute("PickUpDateTime", startDate.format(DATE_FORMAT) + "T10:00:00");
            vehRentalCore.setAttribute("ReturnDateTime", endDate.format(DATE_FORMAT) + "T10:00:00");
            root.appendChild(vehRentalCore);

            // Pick up location
            Element pickUpLocation = doc.createElement("PickUpLocation");
            pickUpLocation.setAttribute("LocationCode", "NCTMAIN");
            pickUpLocation.setAttribute("Name", companyName);
            vehRentalCore.appendChild(pickUpLocation);

            // Return location
            Element returnLocation = doc.createElement("ReturnLocation");
            returnLocation.setAttribute("LocationCode", "NCTMAIN");
            returnLocation.setAttribute("Name", companyName);
            vehRentalCore.appendChild(returnLocation);

            // Vehicle availability rates section
            Element vehAvailRateList = doc.createElement("VehAvailRateList");
            root.appendChild(vehAvailRateList);

            // Get all active rate plans for this channel
            List<ChannelRatePlan> ratePlans = ratePlanRepository.findByChannelIdAndDateRange(
                channelId, startDate, endDate);

            for (ChannelRatePlan ratePlan : ratePlans) {
                Element vehAvailRate = createVehAvailRateElement(doc, ratePlan, startDate, endDate);
                vehAvailRateList.appendChild(vehAvailRate);
            }

            return documentToString(doc);

        } catch (Exception e) {
            logger.error("Failed to generate rate/availability XML feed", e);
            throw new RuntimeException("XML generation failed: " + e.getMessage());
        }
    }

    /**
     * Create individual vehicle availability rate element
     */
    private Element createVehAvailRateElement(Document doc, ChannelRatePlan ratePlan,
                                             LocalDate startDate, LocalDate endDate) {
        Element vehAvailRate = doc.createElement("VehAvailRate");

        // Vehicle info
        Element vehAvailCore = doc.createElement("VehAvailCore");
        vehAvailCore.setAttribute("Status", ratePlan.isStopSale() ? "ClosedOut" : "Available");
        vehAvailRate.appendChild(vehAvailCore);

        // Vehicle details
        Element vehicle = doc.createElement("Vehicle");
        vehicle.setAttribute("AirConditionInd", "true");
        vehicle.setAttribute("TransmissionType", "Automatic");
        vehicle.setAttribute("Code", ratePlan.getVehicleCategory()); // SIPP code
        vehAvailCore.appendChild(vehicle);

        // Vehicle class
        Element vehClass = doc.createElement("VehClass");
        vehClass.setAttribute("Size", String.valueOf(ratePlan.getVehicleCategory().charAt(0)));
        vehicle.appendChild(vehClass);

        // Vehicle make/model
        Element vehMakeModel = doc.createElement("VehMakeModel");
        vehMakeModel.setAttribute("Name", getCategoryName(ratePlan.getVehicleCategory()));
        vehicle.appendChild(vehMakeModel);

        // Rental rate (professional multi-tier pricing)
        Element rentalRate = doc.createElement("RentalRate");
        vehAvailCore.appendChild(rentalRate);

        // Add duration-based rates
        addRatePeriod(doc, rentalRate, "Daily", "1", "3", ratePlan.getDailyRate1To3Days());
        addRatePeriod(doc, rentalRate, "Daily", "4", "7", ratePlan.getDailyRate4To7Days());
        addRatePeriod(doc, rentalRate, "Daily", "8", "14", ratePlan.getDailyRate8To14Days());
        addRatePeriod(doc, rentalRate, "Daily", "15", "21", ratePlan.getDailyRate15To21Days());
        addRatePeriod(doc, rentalRate, "Daily", "22", "30", ratePlan.getDailyRate22To30Days());
        addRatePeriod(doc, rentalRate, "Daily", "31", "999", ratePlan.getDailyRate31PlusDays());

        // Additional fees
        Element fees = doc.createElement("Fees");
        vehAvailRate.appendChild(fees);

        if (ratePlan.getAirportFee() != null && ratePlan.getAirportFee().compareTo(BigDecimal.ZERO) > 0) {
            addFee(doc, fees, "Airport Fee", ratePlan.getAirportFee(), "AirportFee");
        }
        if (ratePlan.getYoungDriverFee() != null && ratePlan.getYoungDriverFee().compareTo(BigDecimal.ZERO) > 0) {
            addFee(doc, fees, "Young Driver Fee", ratePlan.getYoungDriverFee(), "YoungDriverFee");
        }
        if (ratePlan.getAdditionalDriverFee() != null && ratePlan.getAdditionalDriverFee().compareTo(BigDecimal.ZERO) > 0) {
            addFee(doc, fees, "Additional Driver Fee", ratePlan.getAdditionalDriverFee(), "AdditionalDriverFee");
        }
        if (ratePlan.getOneWayFee() != null && ratePlan.getOneWayFee().compareTo(BigDecimal.ZERO) > 0) {
            addFee(doc, fees, "One Way Fee", ratePlan.getOneWayFee(), "OneWayFee");
        }

        // Reference (rate plan ID)
        Element reference = doc.createElement("Reference");
        reference.setAttribute("Type", "RatePlanID");
        reference.setAttribute("ID", ratePlan.getId());
        reference.setAttribute("ID_Context", ratePlan.getRatePlanName());
        vehAvailRate.appendChild(reference);

        return vehAvailRate;
    }

    /**
     * Add rate period with duration-based pricing
     */
    private void addRatePeriod(Document doc, Element parent, String unitName,
                              String minDays, String maxDays, BigDecimal rate) {
        if (rate == null || rate.compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }

        Element vehicleCharges = doc.createElement("VehicleCharges");
        parent.appendChild(vehicleCharges);

        Element vehicleCharge = doc.createElement("VehicleCharge");
        vehicleCharge.setAttribute("Purpose", "1"); // Base rate
        vehicleCharge.setAttribute("Amount", rate.toString());
        vehicleCharge.setAttribute("CurrencyCode", "USD");
        vehicleCharge.setAttribute("UnitName", unitName);
        vehicleCharge.setAttribute("Quantity", "1");
        vehicleCharge.setAttribute("MinDays", minDays);
        vehicleCharge.setAttribute("MaxDays", maxDays);
        vehicleCharges.appendChild(vehicleCharge);
    }

    /**
     * Add fee element
     */
    private void addFee(Document doc, Element parent, String description,
                       BigDecimal amount, String purpose) {
        Element fee = doc.createElement("Fee");
        fee.setAttribute("Purpose", purpose);
        fee.setAttribute("Description", description);
        fee.setAttribute("Amount", amount.toString());
        fee.setAttribute("CurrencyCode", "USD");
        parent.appendChild(fee);
    }

    /**
     * Generate Stop-Sale Notification XML
     * Immediately notifies all channels when inventory is sold out
     */
    public String generateStopSaleNotification(String channelId, String vehicleCategory,
                                              LocalDate startDate, LocalDate endDate,
                                              String reason) {
        try {
            logger.info("Generating stop-sale XML for channel {} category {} from {} to {}",
                channelId, vehicleCategory, startDate, endDate);

            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.newDocument();

            Element root = doc.createElement("OTA_VehAvailRateNotifRQ");
            root.setAttribute("xmlns", "http://www.opentravel.org/OTA/2003/05");
            root.setAttribute("Version", "1.0");
            root.setAttribute("TimeStamp", java.time.LocalDateTime.now().format(TIMESTAMP_FORMAT));
            doc.appendChild(root);

            // Availability notification
            Element availStatusMessages = doc.createElement("AvailStatusMessages");
            root.appendChild(availStatusMessages);

            Element availStatusMessage = doc.createElement("AvailStatusMessage");
            availStatusMessages.appendChild(availStatusMessage);

            // Status application control (date range)
            Element statusAppControl = doc.createElement("StatusApplicationControl");
            statusAppControl.setAttribute("Start", startDate.format(DATE_FORMAT));
            statusAppControl.setAttribute("End", endDate.format(DATE_FORMAT));
            statusAppControl.setAttribute("InvTypeCode", vehicleCategory);
            availStatusMessage.appendChild(statusAppControl);

            // Stop-sale status
            Element restrictionStatus = doc.createElement("RestrictionStatus");
            restrictionStatus.setAttribute("Status", "Close");
            restrictionStatus.setAttribute("Restriction", "Arrival");
            if (reason != null) {
                restrictionStatus.setAttribute("Reason", reason);
            }
            availStatusMessage.appendChild(restrictionStatus);

            return documentToString(doc);

        } catch (Exception e) {
            logger.error("Failed to generate stop-sale notification XML", e);
            throw new RuntimeException("XML generation failed: " + e.getMessage());
        }
    }

    /**
     * Generate Vehicle Catalog XML Feed
     * Distributes complete vehicle inventory to channels
     */
    public String generateVehicleCatalogFeed(String channelId) {
        try {
            logger.info("Generating vehicle catalog XML feed for channel {}", channelId);

            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.newDocument();

            Element root = doc.createElement("OTA_VehDescriptiveInfoRS");
            root.setAttribute("xmlns", "http://www.opentravel.org/OTA/2003/05");
            root.setAttribute("Version", "1.0");
            root.setAttribute("TimeStamp", java.time.LocalDateTime.now().format(TIMESTAMP_FORMAT));
            doc.appendChild(root);

            Element success = doc.createElement("Success");
            root.appendChild(success);

            // Vehicle descriptive infos
            Element vehDescriptiveInfos = doc.createElement("VehDescriptiveInfos");
            root.appendChild(vehDescriptiveInfos);

            // Get all active vehicles
            List<Vehicle> vehicles = vehicleRepository.findByStatus(Vehicle.VehicleStatus.AVAILABLE);

            for (Vehicle vehicle : vehicles) {
                Element vehDescriptiveInfo = createVehicleDescriptiveInfo(doc, vehicle);
                vehDescriptiveInfos.appendChild(vehDescriptiveInfo);
            }

            return documentToString(doc);

        } catch (Exception e) {
            logger.error("Failed to generate vehicle catalog XML", e);
            throw new RuntimeException("XML generation failed: " + e.getMessage());
        }
    }

    /**
     * Create vehicle descriptive info element
     */
    private Element createVehicleDescriptiveInfo(Document doc, Vehicle vehicle) {
        Element vehDescriptiveInfo = doc.createElement("VehDescriptiveInfo");

        // Vehicle info
        Element vehInfo = doc.createElement("VehInfo");
        vehDescriptiveInfo.appendChild(vehInfo);

        Element vehType = doc.createElement("VehType");
        vehType.setAttribute("VehicleCategory", String.valueOf(vehicle.getCategory().charAt(0)));
        vehType.setAttribute("Code", vehicle.getCategory()); // SIPP code
        vehInfo.appendChild(vehType);

        Element vehClass = doc.createElement("VehClass");
        vehClass.setAttribute("Size", String.valueOf(vehicle.getCategory().charAt(0)));
        vehType.appendChild(vehClass);

        Element vehMakeModel = doc.createElement("VehMakeModel");
        vehMakeModel.setAttribute("Name", vehicle.getMake() + " " + vehicle.getModel());
        vehMakeModel.setAttribute("Code", vehicle.getModel());
        vehType.appendChild(vehMakeModel);

        // Vehicle attributes
        Element vehAttributes = doc.createElement("VehAttributes");
        vehInfo.appendChild(vehAttributes);

        addAttribute(doc, vehAttributes, "PassengerQuantity", String.valueOf(vehicle.getSeats()));
        addAttribute(doc, vehAttributes, "BaggageQuantity", "2");
        addAttribute(doc, vehAttributes, "AirConditionInd", "true");
        addAttribute(doc, vehAttributes, "TransmissionType", "Automatic");
        addAttribute(doc, vehAttributes, "FuelType", vehicle.getFuelType() != null ? vehicle.getFuelType() : "Gasoline");

        // Features
        if (vehicle.getFeatures() != null && !vehicle.getFeatures().isEmpty()) {
            Element vehFeatures = doc.createElement("VehFeatures");
            vehInfo.appendChild(vehFeatures);

            for (String feature : vehicle.getFeatures().split(",")) {
                Element vehFeature = doc.createElement("VehFeature");
                vehFeature.setAttribute("Type", feature.trim());
                vehFeatures.appendChild(vehFeature);
            }
        }

        // Images (if available)
        if (vehicle.getImageUrl() != null) {
            Element multimedia = doc.createElement("Multimedia");
            vehDescriptiveInfo.appendChild(multimedia);

            Element imageItems = doc.createElement("ImageItems");
            multimedia.appendChild(imageItems);

            Element imageItem = doc.createElement("ImageItem");
            imageItems.appendChild(imageItem);

            Element url = doc.createElement("URL");
            url.setTextContent(vehicle.getImageUrl());
            imageItem.appendChild(url);
        }

        return vehDescriptiveInfo;
    }

    /**
     * Add vehicle attribute
     */
    private void addAttribute(Document doc, Element parent, String name, String value) {
        Element attr = doc.createElement(name);
        attr.setTextContent(value);
        parent.appendChild(attr);
    }

    /**
     * Generate Terms & Conditions XML Feed
     * Distributes rental terms, policies, and cancellation rules
     */
    public String generateTermsAndConditionsFeed(String channelId) {
        try {
            logger.info("Generating terms & conditions XML feed for channel {}", channelId);

            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.newDocument();

            Element root = doc.createElement("OTA_VehPolicyRS");
            root.setAttribute("xmlns", "http://www.opentravel.org/OTA/2003/05");
            root.setAttribute("Version", "1.0");
            root.setAttribute("TimeStamp", java.time.LocalDateTime.now().format(TIMESTAMP_FORMAT));
            doc.appendChild(root);

            Element success = doc.createElement("Success");
            root.appendChild(success);

            // Rental conditions
            Element rentalConditions = doc.createElement("RentalConditions");
            root.appendChild(rentalConditions);

            // Age requirements
            Element ageRestrictions = doc.createElement("AgeRestrictions");
            rentalConditions.appendChild(ageRestrictions);

            Element minAge = doc.createElement("Age");
            minAge.setAttribute("Minimum", "21");
            minAge.setAttribute("Maximum", "99");
            ageRestrictions.appendChild(minAge);

            // Cancellation policy
            Element cancellationPolicy = doc.createElement("CancellationPolicy");
            rentalConditions.appendChild(cancellationPolicy);

            Element cancelPenalty = doc.createElement("CancelPenalty");
            cancelPenalty.setAttribute("PenaltyDescription", "Free cancellation up to 48 hours before pickup. 50% charge within 48 hours. 100% charge for no-show.");
            cancellationPolicy.appendChild(cancelPenalty);

            // Payment rules
            Element paymentRules = doc.createElement("PaymentRules");
            rentalConditions.appendChild(paymentRules);

            Element paymentRule = doc.createElement("PaymentRule");
            paymentRule.setAttribute("PaymentType", "CreditCard");
            paymentRule.setAttribute("RequiredForReservation", "true");
            paymentRules.appendChild(paymentRule);

            // Fuel policy
            Element fuelPolicy = doc.createElement("FuelPolicy");
            rentalConditions.appendChild(fuelPolicy);

            Element fuel = doc.createElement("Fuel");
            fuel.setAttribute("Type", "FullToFull");
            fuel.setTextContent("Vehicle provided with full tank. Return with full tank or refueling charges apply.");
            fuelPolicy.appendChild(fuel);

            // Mileage policy
            Element mileagePolicy = doc.createElement("MileagePolicy");
            rentalConditions.appendChild(mileagePolicy);

            Element mileage = doc.createElement("Mileage");
            mileage.setAttribute("UnlimitedMileage", "true");
            mileagePolicy.appendChild(mileage);

            // Insurance requirements
            Element coverages = doc.createElement("Coverages");
            rentalConditions.appendChild(coverages);

            addCoverage(doc, coverages, "CDW", "Collision Damage Waiver", "25.00");
            addCoverage(doc, coverages, "TP", "Theft Protection", "15.00");
            addCoverage(doc, coverages, "PAI", "Personal Accident Insurance", "10.00");

            return documentToString(doc);

        } catch (Exception e) {
            logger.error("Failed to generate terms & conditions XML", e);
            throw new RuntimeException("XML generation failed: " + e.getMessage());
        }
    }

    /**
     * Add coverage element
     */
    private void addCoverage(Document doc, Element parent, String code, String description, String dailyCost) {
        Element coverage = doc.createElement("Coverage");
        coverage.setAttribute("Code", code);
        coverage.setAttribute("Description", description);
        coverage.setAttribute("DailyCost", dailyCost);
        coverage.setAttribute("CurrencyCode", "USD");
        parent.appendChild(coverage);
    }

    /**
     * Generate Inventory Update XML (for real-time availability sync)
     */
    public String generateInventoryUpdateFeed(String channelId, LocalDate date) {
        try {
            logger.info("Generating inventory update XML for channel {} on {}", channelId, date);

            List<ChannelInventory> inventoryList = inventoryRepository.findByChannelIdAndDate(channelId, date);

            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.newDocument();

            Element root = doc.createElement("OTA_HotelAvailNotifRQ");
            root.setAttribute("xmlns", "http://www.opentravel.org/OTA/2003/05");
            root.setAttribute("Version", "1.0");
            root.setAttribute("TimeStamp", java.time.LocalDateTime.now().format(TIMESTAMP_FORMAT));
            doc.appendChild(root);

            Element availStatusMessages = doc.createElement("AvailStatusMessages");
            root.appendChild(availStatusMessages);

            for (ChannelInventory inventory : inventoryList) {
                Element availStatusMessage = doc.createElement("AvailStatusMessage");
                availStatusMessages.appendChild(availStatusMessage);

                Element statusAppControl = doc.createElement("StatusApplicationControl");
                statusAppControl.setAttribute("Start", date.format(DATE_FORMAT));
                statusAppControl.setAttribute("End", date.format(DATE_FORMAT));
                statusAppControl.setAttribute("InvTypeCode", inventory.getVehicleCategory());
                availStatusMessage.appendChild(statusAppControl);

                Element availCount = doc.createElement("AvailCount");
                availCount.setAttribute("Count", String.valueOf(inventory.getTotalAvailable() - inventory.getTotalBooked()));
                availStatusMessage.appendChild(availCount);

                if (inventory.isStopSale()) {
                    Element restrictionStatus = doc.createElement("RestrictionStatus");
                    restrictionStatus.setAttribute("Status", "Close");
                    restrictionStatus.setAttribute("Restriction", "Master");
                    if (inventory.getStopSaleReason() != null) {
                        restrictionStatus.setAttribute("Reason", inventory.getStopSaleReason());
                    }
                    availStatusMessage.appendChild(restrictionStatus);
                }
            }

            return documentToString(doc);

        } catch (Exception e) {
            logger.error("Failed to generate inventory update XML", e);
            throw new RuntimeException("XML generation failed: " + e.getMessage());
        }
    }

    /**
     * Get category display name from SIPP code
     */
    private String getCategoryName(String sippCode) {
        if (sippCode == null || sippCode.length() < 4) {
            return "Standard Vehicle";
        }

        String categoryMap = switch (sippCode.charAt(0)) {
            case 'M' -> "Mini";
            case 'E' -> "Economy";
            case 'C' -> "Compact";
            case 'I' -> "Intermediate";
            case 'S' -> "Standard";
            case 'F' -> "Fullsize";
            case 'P' -> "Premium";
            case 'L' -> "Luxury";
            case 'X' -> "Special";
            default -> "Standard";
        };

        return categoryMap + " Vehicle";
    }

    /**
     * Convert XML document to formatted string
     */
    private String documentToString(Document doc) throws Exception {
        TransformerFactory tf = TransformerFactory.newInstance();
        Transformer transformer = tf.newTransformer();
        transformer.setOutputProperty(OutputKeys.INDENT, "yes");
        transformer.setOutputProperty(OutputKeys.ENCODING, "UTF-8");
        transformer.setOutputProperty("{http://xml.apache.org/xslt}indent-amount", "2");

        StringWriter writer = new StringWriter();
        transformer.transform(new DOMSource(doc), new StreamResult(writer));
        return writer.toString();
    }
}
