package com.carrental.backend.ota;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

/** Parses OTA_VehAvailRateRQ messages sent by partners. */
public final class OtaRequestParser {

    public static final int MAX_REQUEST_BYTES = 64 * 1024;

    private OtaRequestParser() {}

    public static class InvalidRequestException extends RuntimeException {
        public InvalidRequestException(String message) { super(message); }
    }

    public record ParsedRequest(OtaXml.QuoteRequest quote, String echoToken, String locationCode) {}

    /** Hardened parser: no DTDs, no external entities, no XInclude (prevents XXE / entity expansion). */
    static DocumentBuilder secureBuilder() throws Exception {
        DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
        f.setNamespaceAware(true);
        f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        f.setFeature("http://xml.org/sax/features/external-general-entities", false);
        f.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        f.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
        f.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        f.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        f.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        f.setXIncludeAware(false);
        f.setExpandEntityReferences(false);
        return f.newDocumentBuilder();
    }

    public static ParsedRequest parse(String xml) {
        if (xml == null || xml.isBlank()) throw new InvalidRequestException("Request body is empty");
        if (xml.length() > MAX_REQUEST_BYTES) throw new InvalidRequestException("Request body is too large");
        Document doc;
        try {
            DocumentBuilder b = secureBuilder();
            b.setErrorHandler(null);
            doc = b.parse(new InputSource(new StringReader(xml)));
        } catch (Exception e) {
            throw new InvalidRequestException("Request is not well-formed XML");
        }
        Element root = doc.getDocumentElement();
        if (!"OTA_VehAvailRateRQ".equals(root.getLocalName())) {
            throw new InvalidRequestException("Expected OTA_VehAvailRateRQ, got " + root.getLocalName());
        }
        Element core = first(root, "VehRentalCore");
        if (core == null) throw new InvalidRequestException("VehRentalCore is required");
        LocalDateTime pickUp = parseDateTime(core.getAttribute("PickUpDateTime"), "PickUpDateTime");
        LocalDateTime dropOff = parseDateTime(core.getAttribute("ReturnDateTime"), "ReturnDateTime");
        validateRange(pickUp, dropOff);

        Element pickUpLoc = first(core, "PickUpLocation");
        String location = pickUpLoc == null ? "" : pickUpLoc.getAttribute("LocationCode");

        List<String> equip = new ArrayList<>();
        NodeList prefs = root.getElementsByTagNameNS("*", "SpecialEquipPref");
        for (int i = 0; i < prefs.getLength(); i++) {
            String type = ((Element) prefs.item(i)).getAttribute("EquipType");
            if (!type.isBlank()) equip.add(type.trim());
        }
        return new ParsedRequest(new OtaXml.QuoteRequest(pickUp, dropOff, equip), root.getAttribute("EchoToken"), location);
    }

    public static void validateRange(LocalDateTime pickUp, LocalDateTime dropOff) {
        if (!dropOff.isAfter(pickUp)) throw new InvalidRequestException("ReturnDateTime must be after PickUpDateTime");
        if (pickUp.isAfter(LocalDateTime.now().plusYears(2))) throw new InvalidRequestException("PickUpDateTime is too far in the future");
        if (dropOff.isAfter(pickUp.plusDays(365))) throw new InvalidRequestException("Rental cannot exceed 365 days");
    }

    public static LocalDateTime parseDateTime(String value, String field) {
        if (value == null || value.isBlank()) throw new InvalidRequestException(field + " is required");
        try {
            return OffsetDateTime.parse(value).toLocalDateTime(); // with offset / Z
        } catch (DateTimeParseException ignored) {
            // fall through to local date-time
        }
        try {
            return LocalDateTime.parse(value);
        } catch (DateTimeParseException e) {
            throw new InvalidRequestException(field + " must be an ISO date-time, e.g. 2026-11-03T10:00:00");
        }
    }

    private static Element first(Element parent, String localName) {
        NodeList nl = parent.getElementsByTagNameNS("*", localName);
        return nl.getLength() == 0 ? null : (Element) nl.item(0);
    }
}
