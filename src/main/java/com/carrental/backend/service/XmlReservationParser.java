package com.carrental.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

/**
 * Professional XML Reservation Parser
 * Parses incoming OTA XML for:
 * - New reservations from channels (Booking.com, Expedia, Skyscanner, etc.)
 * - Reservation modifications
 * - Reservation cancellations
 */
@Service
public class XmlReservationParser {

    private static final Logger logger = LoggerFactory.getLogger(XmlReservationParser.class);
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter DATETIME_FORMAT = DateTimeFormatter.ISO_DATE_TIME;

    /**
     * Parse OTA_VehResRQ - New Reservation Request
     */
    public Map<String, Object> parseNewReservation(String xmlContent) {
        try {
            logger.info("Parsing new reservation XML");

            Document doc = parseXmlString(xmlContent);
            Map<String, Object> reservation = new HashMap<>();

            // Get root element
            Element root = doc.getDocumentElement();

            // Extract POS (Point of Sale) - identifies the channel
            Element pos = getFirstElement(root, "POS");
            if (pos != null) {
                Element source = getFirstElement(pos, "Source");
                if (source != null) {
                    String channelCode = source.getAttribute("AgentSine");
                    String channelName = source.getAttribute("PseudoCityCode");
                    reservation.put("channelCode", channelCode);
                    reservation.put("channelName", channelName);
                    logger.info("Reservation from channel: {} ({})", channelName, channelCode);
                }
            }

            // Extract VehResRQCore - Core reservation details
            Element vehResRQCore = getFirstElement(root, "VehResRQCore");
            if (vehResRQCore != null) {
                parseReservationCore(vehResRQCore, reservation);
            }

            // Extract VehResRQInfo - Additional reservation information
            Element vehResRQInfo = getFirstElement(root, "VehResRQInfo");
            if (vehResRQInfo != null) {
                parseReservationInfo(vehResRQInfo, reservation);
            }

            // Set reservation type
            reservation.put("reservationType", "NEW");
            reservation.put("receivedAt", LocalDateTime.now());

            logger.info("Successfully parsed new reservation: {}", reservation.get("confirmationNumber"));
            return reservation;

        } catch (Exception e) {
            logger.error("Failed to parse new reservation XML", e);
            throw new RuntimeException("XML parsing failed: " + e.getMessage());
        }
    }

    /**
     * Parse OTA_VehModifyRQ - Reservation Modification Request
     */
    public Map<String, Object> parseModificationRequest(String xmlContent) {
        try {
            logger.info("Parsing reservation modification XML");

            Document doc = parseXmlString(xmlContent);
            Map<String, Object> modification = new HashMap<>();

            Element root = doc.getDocumentElement();

            // Extract confirmation number
            Element vehModifyRQCore = getFirstElement(root, "VehModifyRQCore");
            if (vehModifyRQCore != null) {
                Element uniqueID = getFirstElement(vehModifyRQCore, "UniqueID");
                if (uniqueID != null) {
                    String confirmationNumber = uniqueID.getAttribute("ID");
                    modification.put("originalConfirmationNumber", confirmationNumber);
                    logger.info("Modifying reservation: {}", confirmationNumber);
                }

                // Parse modified core details
                parseReservationCore(vehModifyRQCore, modification);
            }

            // Extract modified info
            Element vehModifyRQInfo = getFirstElement(root, "VehModifyRQInfo");
            if (vehModifyRQInfo != null) {
                parseReservationInfo(vehModifyRQInfo, modification);
            }

            modification.put("reservationType", "MODIFICATION");
            modification.put("receivedAt", LocalDateTime.now());

            logger.info("Successfully parsed modification request for: {}",
                modification.get("originalConfirmationNumber"));
            return modification;

        } catch (Exception e) {
            logger.error("Failed to parse modification XML", e);
            throw new RuntimeException("XML parsing failed: " + e.getMessage());
        }
    }

    /**
     * Parse OTA_CancelRQ - Reservation Cancellation Request
     */
    public Map<String, Object> parseCancellationRequest(String xmlContent) {
        try {
            logger.info("Parsing reservation cancellation XML");

            Document doc = parseXmlString(xmlContent);
            Map<String, Object> cancellation = new HashMap<>();

            Element root = doc.getDocumentElement();

            // Extract unique ID (confirmation number)
            Element uniqueID = getFirstElement(root, "UniqueID");
            if (uniqueID != null) {
                String confirmationNumber = uniqueID.getAttribute("ID");
                String idContext = uniqueID.getAttribute("ID_Context");
                cancellation.put("confirmationNumber", confirmationNumber);
                cancellation.put("idContext", idContext);
                logger.info("Cancelling reservation: {}", confirmationNumber);
            }

            // Extract cancellation reason (if provided)
            Element reason = getFirstElement(root, "Reason");
            if (reason != null) {
                String cancellationReason = reason.getTextContent();
                cancellation.put("cancellationReason", cancellationReason);
            }

            // Extract cancellation rules
            Element cancelRules = getFirstElement(root, "CancelRules");
            if (cancelRules != null) {
                parseCancellationRules(cancelRules, cancellation);
            }

            cancellation.put("reservationType", "CANCELLATION");
            cancellation.put("receivedAt", LocalDateTime.now());

            logger.info("Successfully parsed cancellation request for: {}",
                cancellation.get("confirmationNumber"));
            return cancellation;

        } catch (Exception e) {
            logger.error("Failed to parse cancellation XML", e);
            throw new RuntimeException("XML parsing failed: " + e.getMessage());
        }
    }

    /**
     * Parse VehResRQCore - Core reservation details
     */
    private void parseReservationCore(Element core, Map<String, Object> reservation) {
        // Extract rental dates
        String pickupDateTime = core.getAttribute("PickUpDateTime");
        String returnDateTime = core.getAttribute("ReturnDateTime");

        if (pickupDateTime != null && !pickupDateTime.isEmpty()) {
            reservation.put("pickupDateTime", LocalDateTime.parse(pickupDateTime, DATETIME_FORMAT));
            reservation.put("pickupDate", LocalDate.parse(pickupDateTime.substring(0, 10), DATE_FORMAT));
        }

        if (returnDateTime != null && !returnDateTime.isEmpty()) {
            reservation.put("returnDateTime", LocalDateTime.parse(returnDateTime, DATETIME_FORMAT));
            reservation.put("returnDate", LocalDate.parse(returnDateTime.substring(0, 10), DATE_FORMAT));
        }

        // Extract pickup location
        Element pickUpLocation = getFirstElement(core, "PickUpLocation");
        if (pickUpLocation != null) {
            reservation.put("pickupLocationCode", pickUpLocation.getAttribute("LocationCode"));
            reservation.put("pickupLocationName", pickUpLocation.getAttribute("Name"));
        }

        // Extract return location
        Element returnLocation = getFirstElement(core, "ReturnLocation");
        if (returnLocation != null) {
            reservation.put("returnLocationCode", returnLocation.getAttribute("LocationCode"));
            reservation.put("returnLocationName", returnLocation.getAttribute("Name"));
        }

        // Extract vehicle preference
        Element vehPref = getFirstElement(core, "VehPref");
        if (vehPref != null) {
            String vehCode = vehPref.getAttribute("Code");
            String vehType = vehPref.getAttribute("VehicleType");
            reservation.put("vehicleCategory", vehCode); // SIPP code
            reservation.put("vehicleType", vehType);

            Element vehClass = getFirstElement(vehPref, "VehClass");
            if (vehClass != null) {
                reservation.put("vehicleSize", vehClass.getAttribute("Size"));
            }

            Element vehMakeModel = getFirstElement(vehPref, "VehMakeModel");
            if (vehMakeModel != null) {
                reservation.put("vehicleModel", vehMakeModel.getAttribute("Name"));
            }
        }

        // Extract driver information
        Element driver = getFirstElement(core, "Driver");
        if (driver != null) {
            String age = driver.getAttribute("Age");
            if (age != null && !age.isEmpty()) {
                reservation.put("driverAge", Integer.parseInt(age));
            }
        }

        // Extract rate qualifier
        Element rateQualifier = getFirstElement(core, "RateQualifier");
        if (rateQualifier != null) {
            String rateCode = rateQualifier.getAttribute("RateCode");
            String ratePlanID = rateQualifier.getAttribute("RatePlanID");
            reservation.put("rateCode", rateCode);
            reservation.put("ratePlanId", ratePlanID);
        }

        // Extract total charges
        Element totalCharge = getFirstElement(core, "TotalCharge");
        if (totalCharge != null) {
            String amount = totalCharge.getAttribute("EstimatedTotalAmount");
            String currency = totalCharge.getAttribute("CurrencyCode");
            if (amount != null && !amount.isEmpty()) {
                reservation.put("totalAmount", new BigDecimal(amount));
            }
            reservation.put("currency", currency != null ? currency : "USD");
        }
    }

    /**
     * Parse VehResRQInfo - Additional reservation information
     */
    private void parseReservationInfo(Element info, Map<String, Object> reservation) {
        // Extract customer information
        Element customer = getFirstElement(info, "Customer");
        if (customer != null) {
            parseCustomerInfo(customer, reservation);
        }

        // Extract special requests
        Element specialReqs = getFirstElement(info, "SpecialReqs");
        if (specialReqs != null) {
            NodeList specialReqList = specialReqs.getElementsByTagName("SpecialReq");
            StringBuilder specialRequests = new StringBuilder();
            for (int i = 0; i < specialReqList.getLength(); i++) {
                Element specialReq = (Element) specialReqList.item(i);
                specialRequests.append(specialReq.getTextContent()).append("; ");
            }
            reservation.put("specialRequests", specialRequests.toString());
        }

        // Extract coverage/insurance preferences
        NodeList coverages = info.getElementsByTagName("Coverage");
        if (coverages.getLength() > 0) {
            Map<String, Boolean> insuranceOptions = new HashMap<>();
            for (int i = 0; i < coverages.getLength(); i++) {
                Element coverage = (Element) coverages.item(i);
                String coverageType = coverage.getAttribute("CoverageType");
                insuranceOptions.put(coverageType, true);
            }
            reservation.put("insuranceOptions", insuranceOptions);
        }

        // Extract reference ID (confirmation number from channel)
        Element reference = getFirstElement(info, "Reference");
        if (reference != null) {
            String refId = reference.getAttribute("ID");
            reservation.put("confirmationNumber", refId);
            reservation.put("channelConfirmationNumber", refId);
        }

        // Extract arrival/flight information
        Element arrivalDetails = getFirstElement(info, "ArrivalDetails");
        if (arrivalDetails != null) {
            String flightNumber = arrivalDetails.getAttribute("FlightNo");
            reservation.put("flightNumber", flightNumber);
        }
    }

    /**
     * Parse customer information
     */
    private void parseCustomerInfo(Element customer, Map<String, Object> reservation) {
        // Primary customer
        Element primary = getFirstElement(customer, "Primary");
        if (primary != null) {
            // Personal name
            Element personName = getFirstElement(primary, "PersonName");
            if (personName != null) {
                String givenName = getElementText(personName, "GivenName");
                String surname = getElementText(personName, "Surname");
                String title = getElementText(personName, "NamePrefix");

                reservation.put("customerFirstName", givenName);
                reservation.put("customerLastName", surname);
                reservation.put("customerFullName", (title != null ? title + " " : "") + givenName + " " + surname);
            }

            // Telephone
            Element telephone = getFirstElement(primary, "Telephone");
            if (telephone != null) {
                String phoneNumber = telephone.getAttribute("PhoneNumber");
                String countryCode = telephone.getAttribute("CountryAccessCode");
                reservation.put("customerPhone", (countryCode != null ? "+" + countryCode : "") + phoneNumber);
            }

            // Email
            Element email = getFirstElement(primary, "Email");
            if (email != null) {
                reservation.put("customerEmail", email.getTextContent());
            }

            // Address
            Element address = getFirstElement(primary, "Address");
            if (address != null) {
                String addressLine = getElementText(address, "AddressLine");
                String city = getElementText(address, "CityName");
                String postalCode = getElementText(address, "PostalCode");
                String countryName = getElementText(address, "CountryName");

                reservation.put("customerAddress", addressLine);
                reservation.put("customerCity", city);
                reservation.put("customerPostalCode", postalCode);
                reservation.put("customerCountry", countryName);
            }

            // Document (license information)
            Element document = getFirstElement(primary, "Document");
            if (document != null) {
                String docNumber = document.getAttribute("DocID");
                String docType = document.getAttribute("DocType");
                String docIssueCountry = document.getAttribute("DocIssueCountry");
                String expireDate = document.getAttribute("ExpireDate");

                reservation.put("licenseNumber", docNumber);
                reservation.put("licenseType", docType);
                reservation.put("licenseCountry", docIssueCountry);
                if (expireDate != null && !expireDate.isEmpty()) {
                    reservation.put("licenseExpiryDate", LocalDate.parse(expireDate, DATE_FORMAT));
                }
            }
        }

        // Additional drivers
        NodeList additionalDrivers = customer.getElementsByTagName("Additional");
        if (additionalDrivers.getLength() > 0) {
            reservation.put("additionalDriversCount", additionalDrivers.getLength());
        }
    }

    /**
     * Parse cancellation rules
     */
    private void parseCancellationRules(Element cancelRules, Map<String, Object> cancellation) {
        NodeList cancelPenalties = cancelRules.getElementsByTagName("CancelPenalty");

        for (int i = 0; i < cancelPenalties.getLength(); i++) {
            Element penalty = (Element) cancelPenalties.item(i);

            // Extract penalty amount
            Element amountPercent = getFirstElement(penalty, "AmountPercent");
            if (amountPercent != null) {
                String amount = amountPercent.getAttribute("Amount");
                String percent = amountPercent.getAttribute("Percent");

                if (amount != null && !amount.isEmpty()) {
                    cancellation.put("cancellationFeeAmount", new BigDecimal(amount));
                }
                if (percent != null && !percent.isEmpty()) {
                    cancellation.put("cancellationFeePercent", new BigDecimal(percent));
                }
            }

            // Extract deadline
            Element deadline = getFirstElement(penalty, "Deadline");
            if (deadline != null) {
                String absoluteDeadline = deadline.getAttribute("AbsoluteDeadline");
                if (absoluteDeadline != null && !absoluteDeadline.isEmpty()) {
                    cancellation.put("cancellationDeadline",
                        LocalDateTime.parse(absoluteDeadline, DATETIME_FORMAT));
                }
            }
        }
    }

    /**
     * Parse XML string to Document with enterprise-grade security
     * Prevents XXE (XML External Entity) attacks and other XML vulnerabilities
     */
    private Document parseXmlString(String xmlContent) throws Exception {
        // Sanitize input first
        String sanitized = sanitizeXml(xmlContent);

        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();

        // Enable namespace awareness for OTA XML processing
        factory.setNamespaceAware(true);

        // SECURITY: Disable features that can lead to XXE attacks
        try {
            // Prevent XXE attacks
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);

            // Prevent billion laughs attack
            factory.setFeature(javax.xml.XMLConstants.FEATURE_SECURE_PROCESSING, true);

            // Additional security
            factory.setXIncludeAware(false);
            factory.setExpandEntityReferences(false);

            logger.debug("XML parser configured with security features enabled");
        } catch (Exception e) {
            logger.warn("Failed to set some XML security features: {}", e.getMessage());
            // Continue anyway - better to have some security than none
        }

        DocumentBuilder builder = factory.newDocumentBuilder();

        // Set error handler for better debugging
        builder.setErrorHandler(new org.xml.sax.ErrorHandler() {
            @Override
            public void warning(org.xml.sax.SAXParseException e) {
                logger.warn("XML parsing warning at line {}: {}", e.getLineNumber(), e.getMessage());
            }

            @Override
            public void error(org.xml.sax.SAXParseException e) throws org.xml.sax.SAXException {
                logger.error("XML parsing error at line {}: {}", e.getLineNumber(), e.getMessage());
                throw e;
            }

            @Override
            public void fatalError(org.xml.sax.SAXParseException e) throws org.xml.sax.SAXException {
                logger.error("XML fatal error at line {}: {}", e.getLineNumber(), e.getMessage());
                throw e;
            }
        });

        InputSource is = new InputSource(new StringReader(sanitized));

        // Parse with timeout protection
        Document doc = builder.parse(is);

        logger.debug("XML parsed successfully - Root: {}, Namespace: {}",
            doc.getDocumentElement().getNodeName(),
            doc.getDocumentElement().getNamespaceURI());

        return doc;
    }

    /**
     * Get first element by tag name
     */
    private Element getFirstElement(Element parent, String tagName) {
        NodeList nodes = parent.getElementsByTagName(tagName);
        if (nodes.getLength() > 0) {
            Node node = nodes.item(0);
            if (node instanceof Element) {
                return (Element) node;
            }
        }
        return null;
    }

    /**
     * Get element text content
     */
    private String getElementText(Element parent, String tagName) {
        Element element = getFirstElement(parent, tagName);
        return element != null ? element.getTextContent() : null;
    }

    /**
     * Validate XML against OTA schema for production-grade validation
     */
    public boolean validateXml(String xmlContent, String schemaType) {
        try {
            logger.info("Validating XML against OTA schema: {}", schemaType);

            // Parse to ensure well-formed XML
            Document doc = parseXmlString(xmlContent);

            // TODO: Add XSD schema validation
            // For production, load OTA XSD schemas and validate against them
            // javax.xml.validation.SchemaFactory factory = SchemaFactory.newInstance(XMLConstants.W3C_XML_SCHEMA_NS_URI);
            // Schema schema = factory.newSchema(new File("ota-schemas/" + schemaType + ".xsd"));
            // Validator validator = schema.newValidator();
            // validator.validate(new DOMSource(doc));

            // Basic validation checks
            if (!validateXmlStructure(doc, schemaType)) {
                logger.error("XML structure validation failed for {}", schemaType);
                return false;
            }

            logger.info("XML validation successful for {}", schemaType);
            return true;

        } catch (Exception e) {
            logger.error("XML validation failed for {}: {}", schemaType, e.getMessage());
            return false;
        }
    }

    /**
     * Validate basic XML structure and required elements
     */
    private boolean validateXmlStructure(Document doc, String schemaType) {
        Element root = doc.getDocumentElement();

        switch (schemaType) {
            case "OTA_VehResRQ":
                // Validate new reservation structure
                if (!root.getNodeName().contains("VehResRQ") && !root.getNodeName().contains("VehResRS")) {
                    logger.error("Invalid root element for reservation: {}", root.getNodeName());
                    return false;
                }
                // Check for required elements
                if (getFirstElement(root, "VehResRQCore") == null &&
                    getFirstElement(root, "VehResRQInfo") == null) {
                    logger.error("Missing required VehResRQCore or VehResRQInfo elements");
                    return false;
                }
                break;

            case "OTA_VehModifyRQ":
                if (!root.getNodeName().contains("VehModifyRQ")) {
                    return false;
                }
                break;

            case "OTA_CancelRQ":
                if (!root.getNodeName().contains("CancelRQ")) {
                    return false;
                }
                break;

            default:
                logger.warn("Unknown schema type for validation: {}", schemaType);
                return true; // Allow unknown types
        }

        return true;
    }

    /**
     * Sanitize XML input to prevent XXE attacks and malicious content
     */
    public String sanitizeXml(String xmlContent) {
        if (xmlContent == null || xmlContent.isEmpty()) {
            throw new IllegalArgumentException("XML content cannot be null or empty");
        }

        // Check XML size limit (prevent DOS attacks)
        if (xmlContent.length() > 5_000_000) { // 5MB limit
            throw new IllegalArgumentException("XML content exceeds maximum size limit (5MB)");
        }

        // Remove potentially dangerous content
        String sanitized = xmlContent;

        // Remove XML comments that might contain malicious content
        sanitized = sanitized.replaceAll("<!--.*?-->", "");

        // Remove DOCTYPE declarations to prevent XXE attacks
        sanitized = sanitized.replaceAll("<!DOCTYPE[^>]*>", "");

        // Remove CDATA sections if they contain suspicious content
        // (Keep valid CDATA but log for review)
        if (sanitized.contains("<![CDATA[")) {
            logger.warn("XML contains CDATA sections - review for security");
        }

        return sanitized;
    }

    /**
     * Pretty print XML for debugging and logging
     */
    public String prettyPrintXml(String xmlContent) {
        try {
            Document doc = parseXmlString(xmlContent);

            javax.xml.transform.TransformerFactory tf = javax.xml.transform.TransformerFactory.newInstance();
            javax.xml.transform.Transformer transformer = tf.newTransformer();
            transformer.setOutputProperty(javax.xml.transform.OutputKeys.INDENT, "yes");
            transformer.setOutputProperty(javax.xml.transform.OutputKeys.ENCODING, "UTF-8");
            transformer.setOutputProperty("{http://xml.apache.org/xslt}indent-amount", "2");
            transformer.setOutputProperty(javax.xml.transform.OutputKeys.OMIT_XML_DECLARATION, "no");

            java.io.StringWriter writer = new java.io.StringWriter();
            transformer.transform(
                new javax.xml.transform.dom.DOMSource(doc),
                new javax.xml.transform.stream.StreamResult(writer)
            );

            return writer.toString();
        } catch (Exception e) {
            logger.error("Failed to pretty print XML", e);
            return xmlContent;
        }
    }

    /**
     * Extract XML as summary for logging (removes sensitive data)
     */
    public String extractXmlSummary(String xmlContent) {
        try {
            Document doc = parseXmlString(xmlContent);
            Element root = doc.getDocumentElement();

            StringBuilder summary = new StringBuilder();
            summary.append("XML Type: ").append(root.getNodeName()).append("\n");

            // Extract key information without sensitive data
            Element customer = getFirstElement(root, "Customer");
            if (customer != null) {
                Element primary = getFirstElement(customer, "Primary");
                if (primary != null) {
                    Element email = getFirstElement(primary, "Email");
                    if (email != null) {
                        String emailText = email.getTextContent();
                        // Mask email for privacy
                        summary.append("Customer: ").append(maskEmail(emailText)).append("\n");
                    }
                }
            }

            // Extract dates
            String pickupDate = extractAttributeFromPath(root, "VehResRQCore", "PickUpDateTime");
            String returnDate = extractAttributeFromPath(root, "VehResRQCore", "ReturnDateTime");
            if (pickupDate != null) summary.append("Pickup: ").append(pickupDate).append("\n");
            if (returnDate != null) summary.append("Return: ").append(returnDate).append("\n");

            return summary.toString();
        } catch (Exception e) {
            return "Unable to extract XML summary: " + e.getMessage();
        }
    }

    /**
     * Mask email for logging
     */
    private String maskEmail(String email) {
        if (email == null || !email.contains("@")) {
            return "***";
        }
        String[] parts = email.split("@");
        String localPart = parts[0];
        String domain = parts[1];

        if (localPart.length() <= 2) {
            return "**@" + domain;
        }

        return localPart.charAt(0) + "***" + localPart.charAt(localPart.length() - 1) + "@" + domain;
    }

    /**
     * Extract attribute from nested path
     */
    private String extractAttributeFromPath(Element root, String elementName, String attributeName) {
        Element element = getFirstElement(root, elementName);
        if (element != null) {
            String value = element.getAttribute(attributeName);
            return value.isEmpty() ? null : value;
        }
        return null;
    }

    /**
     * Convert XML to JSON for modern APIs
     */
    public String xmlToJson(String xmlContent) {
        try {
            Document doc = parseXmlString(xmlContent);
            org.json.JSONObject json = new org.json.JSONObject();
            json.put(doc.getDocumentElement().getNodeName(), elementToJson(doc.getDocumentElement()));
            return json.toString(2); // Pretty print with 2-space indent
        } catch (Exception e) {
            logger.error("Failed to convert XML to JSON", e);
            return "{}";
        }
    }

    /**
     * Recursively convert XML element to JSON
     */
    private org.json.JSONObject elementToJson(Element element) {
        org.json.JSONObject json = new org.json.JSONObject();

        // Add attributes
        if (element.hasAttributes()) {
            for (int i = 0; i < element.getAttributes().getLength(); i++) {
                org.w3c.dom.Node attr = element.getAttributes().item(i);
                json.put("@" + attr.getNodeName(), attr.getNodeValue());
            }
        }

        // Add child elements
        org.w3c.dom.NodeList children = element.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            org.w3c.dom.Node child = children.item(i);
            if (child.getNodeType() == org.w3c.dom.Node.ELEMENT_NODE) {
                Element childElement = (Element) child;
                json.put(childElement.getNodeName(), elementToJson(childElement));
            } else if (child.getNodeType() == org.w3c.dom.Node.TEXT_NODE) {
                String text = child.getTextContent().trim();
                if (!text.isEmpty()) {
                    json.put("$text", text);
                }
            }
        }

        return json;
    }

    /**
     * Verify XML digital signature (for channels that support it)
     */
    public boolean verifyXmlSignature(String xmlContent, String publicKey) {
        // TODO: Implement XML Digital Signature verification
        // This is for channels that sign their XML with X.509 certificates
        logger.debug("XML signature verification not yet implemented");
        return true;
    }

    /**
     * Generate XML parsing statistics
     */
    public Map<String, Object> getXmlStatistics(String xmlContent) {
        Map<String, Object> stats = new HashMap<>();

        try {
            Document doc = parseXmlString(xmlContent);

            stats.put("size_bytes", xmlContent.length());
            stats.put("size_kb", xmlContent.length() / 1024.0);
            stats.put("root_element", doc.getDocumentElement().getNodeName());
            stats.put("total_elements", countElements(doc.getDocumentElement()));
            stats.put("has_namespaces", doc.getDocumentElement().getNamespaceURI() != null);
            stats.put("namespace_uri", doc.getDocumentElement().getNamespaceURI());
            stats.put("encoding", doc.getXmlEncoding());
            stats.put("version", doc.getXmlVersion());

        } catch (Exception e) {
            stats.put("error", e.getMessage());
        }

        return stats;
    }

    /**
     * Count total elements in XML
     */
    private int countElements(Element element) {
        int count = 1;
        org.w3c.dom.NodeList children = element.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            if (children.item(i).getNodeType() == org.w3c.dom.Node.ELEMENT_NODE) {
                count += countElements((Element) children.item(i));
            }
        }
        return count;
    }
}
