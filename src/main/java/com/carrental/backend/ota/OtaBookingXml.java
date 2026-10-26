package com.carrental.backend.ota;

import com.carrental.backend.ota.ChannelError.ChannelException;
import com.carrental.backend.ota.ChannelModels.*;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import java.io.StringReader;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * OpenTravel 2003/05 car-rental messages for the booking API:
 *   OTA_VehLocSearchRQ/RS, OTA_VehAvailRateRQ/RS (with offers and live availability),
 *   OTA_VehResRQ/RS, OTA_VehRetResRQ/RS, OTA_VehModifyRQ/RS, OTA_VehCancelRQ/RS.
 * Only what the core needs is read; unknown elements are ignored, as OTA allows.
 *
 * Booking references: our confirmation is UniqueID/ConfID Type="14"; the broker's own reference
 * travels as TPA_Extensions/BrokerReference (or Reference ID_Context="BROKER"); an offer from a
 * search is Reference Type="16".
 */
public final class OtaBookingXml {

    private OtaBookingXml() {}

    static final String NS = OtaXml.OTA_NAMESPACE;
    private static final DateTimeFormatter LOCAL = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'");

    // ================================================================== parsing

    public record Parsed(Element root, String echoToken) {}

    public static Parsed parse(String xml, String... expectedRoots) {
        if (xml == null || xml.isBlank()) throw ChannelError.INVALID_REQUEST.ex("Request body is empty");
        if (xml.length() > OtaRequestParser.MAX_REQUEST_BYTES) throw ChannelError.INVALID_REQUEST.ex("Request body is too large");
        Document doc;
        try {
            var b = OtaRequestParser.secureBuilder();
            b.setErrorHandler(null);
            doc = b.parse(new InputSource(new StringReader(xml)));
        } catch (Exception e) {
            throw ChannelError.INVALID_REQUEST.ex("Request is not well-formed XML");
        }
        Element root = doc.getDocumentElement();
        String name = root.getLocalName() == null ? root.getNodeName() : root.getLocalName();
        boolean ok = false;
        for (String r : expectedRoots) ok |= r.equals(name);
        if (!ok) throw ChannelError.INVALID_REQUEST.ex("Expected " + String.join(" or ", expectedRoots) + ", got " + name);
        return new Parsed(root, attr(root, "EchoToken"));
    }

    public static Search search(Element root, ChannelRules rules) {
        Element core = first(root, "VehRentalCore");
        if (core == null) throw ChannelError.INVALID_REQUEST.ex("VehRentalCore is required");
        LocalDateTime from = dateTime(attr(core, "PickUpDateTime"), "PickUpDateTime");
        LocalDateTime to = dateTime(attr(core, "ReturnDateTime"), "ReturnDateTime");
        String pick = attr(first(core, "PickUpLocation"), "LocationCode");
        String ret = attr(first(core, "ReturnLocation"), "LocationCode");
        String defaultLoc = rules.locations().get(0).code();
        if (pick.isEmpty()) pick = defaultLoc;
        if (ret.isEmpty()) ret = pick;
        Element driver = first(root, "DriverType");
        Integer age = driver == null || attr(driver, "Age").isEmpty() ? null : intOf(attr(driver, "Age"), "DriverType Age");
        Element pref = first(root, "VehPref");
        String group = pref == null ? null : (attr(pref, "Code").isEmpty() ? null : attr(pref, "Code").toUpperCase());
        String country = attr(first(first(root, "Address"), "CountryName"), "Code");
        return new Search(pick, ret, from, to, age, country.isEmpty() ? null : country, group, equipment(root));
    }

    private static List<ExtraRequest> equipment(Element root) {
        List<ExtraRequest> out = new ArrayList<>();
        for (Element e : all(root, "SpecialEquipPref")) {
            String code = attr(e, "EquipType");
            if (code.isEmpty()) continue;
            String q = attr(e, "Quantity");
            out.add(new ExtraRequest(code, q.isEmpty() ? 1 : intOf(q, "Quantity")));
        }
        return out;
    }

    public static Customer customer(Element root) {
        Element p = first(root, "Primary");
        if (p == null) p = first(root, "Customer");
        if (p == null) return null;
        Element name = first(p, "PersonName");
        String email = text(first(p, "Email"));
        Element phone = first(p, "Telephone");
        String country = attr(first(first(p, "Address"), "CountryName"), "Code");
        if (country.isEmpty()) country = attr(first(p, "CitizenCountryName"), "Code");
        return new Customer(text(first(name, "NamePrefix")), text(first(name, "GivenName")), text(first(name, "Surname")),
            email, phone == null ? "" : attr(phone, "PhoneNumber"), country);
    }

    public static Driver driver(Element root, Customer c) {
        Element p = first(root, "Primary");
        if (p == null) return null;
        Element doc = null;
        for (Element d : all(p, "Document")) if ("4".equals(attr(d, "DocType")) || doc == null) doc = d;
        return new Driver(c == null ? "" : c.firstName(), c == null ? "" : c.lastName(), attr(p, "BirthDate"),
            doc == null ? "" : attr(doc, "DocID"), doc == null ? "" : attr(doc, "DocIssueCountry"));
    }

    public static BookingRequest booking(Element root, ChannelRules rules, String idempotencyKey) {
        Customer c = customer(root);
        if (c == null) throw ChannelError.INVALID_REQUEST.ex("Customer/Primary is required");
        String offer = null, brokerRef = null;
        for (Element r : all(root, "Reference")) {
            String id = attr(r, "ID");
            if ("BROKER".equalsIgnoreCase(attr(r, "ID_Context"))) brokerRef = id;
            else if ("16".equals(attr(r, "Type")) || id.startsWith("OFF-")) offer = id;
        }
        String tpaRef = text(first(first(root, "TPA_Extensions"), "BrokerReference"));
        if (!tpaRef.isEmpty()) brokerRef = tpaRef;
        Element core = first(root, "VehRentalCore");
        Search s = core == null ? null : search(root, rules);
        Element arrival = first(root, "ArrivalDetails");
        return new BookingRequest(offer, brokerRef, idempotencyKey, s, c, driver(root, c), expected(root),
            text(first(root, "SpecialReqPref")), arrival == null ? null : attr(arrival, "Number"));
    }

    public static ModifyRequest modify(Element root, ChannelRules rules) {
        String id = uniqueId(root);
        Element core = first(root, "VehRentalCore");
        Search s = null;
        if (core != null || first(root, "VehPref") != null || first(root, "SpecialEquipPrefs") != null) {
            LocalDateTime from = core == null ? null : dateTime(attr(core, "PickUpDateTime"), "PickUpDateTime");
            LocalDateTime to = core == null ? null : dateTime(attr(core, "ReturnDateTime"), "ReturnDateTime");
            String pick = core == null ? null : emptyToNull(attr(first(core, "PickUpLocation"), "LocationCode"));
            String ret = core == null ? null : emptyToNull(attr(first(core, "ReturnLocation"), "LocationCode"));
            Element pref = first(root, "VehPref");
            Element driver = first(root, "DriverType");
            s = new Search(pick, ret, from, to, driver == null ? null : intOf(attr(driver, "Age"), "Age"), null,
                pref == null ? null : emptyToNull(attr(pref, "Code").toUpperCase()),
                first(root, "SpecialEquipPrefs") == null ? null : equipment(root));
        }
        Customer c = first(root, "Primary") == null ? null : customer(root);
        return new ModifyRequest(id, s, c, c == null ? null : driver(root, c), expected(root), emptyToNull(text(first(root, "SpecialReqPref"))));
    }

    /** Our reservation number (Type 14) or the broker reference, from UniqueID. */
    public static String uniqueId(Element root) {
        Element u = first(root, "UniqueID");
        if (u == null || attr(u, "ID").isEmpty()) throw ChannelError.INVALID_REQUEST.ex("UniqueID with the reservation number is required");
        return attr(u, "ID");
    }

    public static String surname(Element root) {
        return text(first(first(root, "PersonName"), "Surname"));
    }

    private static BigDecimal expected(Element root) {
        Element t = first(first(root, "TPA_Extensions"), "ExpectedTotal");
        if (t == null || attr(t, "Amount").isEmpty()) return null;
        try { return new BigDecimal(attr(t, "Amount")); } catch (Exception e) { throw ChannelError.INVALID_REQUEST.ex("ExpectedTotal Amount is not a number"); }
    }

    // ================================================================== responses

    public static String locations(String echo, boolean prod, List<Location> locs, String vendor) {
        X x = open("OTA_VehLocSearchRS", echo, prod);
        x.line("<Success/>").open("VehMatchedLocs");
        for (Location l : locs) {
            x.open("VehMatchedLoc").open("LocationDetail", "Code", l.code(), "Name", l.name(), "AtAirport", l.name().toLowerCase().contains("airport"));
            if (!l.address().isBlank()) x.open("Address").el("AddressLine", l.address()).close();
            x.open("AdditionalInfo").el("VehRentLocInfos", null).close()
             .line("<TPA_Extensions><PickUp>" + l.pickup() + "</PickUp><Return>" + l.dropOff() + "</Return><Vendor Code=\"" + OtaXml.escape(vendor) + "\"/></TPA_Extensions>")
             .close().close();
        }
        return x.close().done();
    }

    public static String availability(String echo, boolean prod, Search s, List<Offer> offers, String vendor, String warning) {
        X x = open("OTA_VehAvailRateRS", echo, prod);
        x.line("<Success/>");
        if (warning != null) x.line("<Warnings><Warning Type=\"3\" ShortText=\"" + OtaXml.escape(warning) + "\"/></Warnings>");
        x.open("VehAvailRSCore");
        rentalCore(x, s.pickupAt(), s.returnAt(), s.pickupLocation(), s.returnLocation());
        x.open("VehVendorAvails").open("VehVendorAvail").el("Vendor", "NCT Rental", "Code", vendor).open("VehAvails");
        for (Offer o : offers) {
            x.open("VehAvail").open("VehAvailCore", "Status", o.status());
            vehicle(x, o.vehicleGroup(), o.modelExample(), o.transmission(), o.airCon());
            if ("Available".equals(o.status())) {
                rate(x, o.baseAmount(), o.breakdown(), o.rentalDays(), o.currency(), o.cancellationPolicy());
                equips(x, o.breakdown(), o.currency(), o.rentalDays());
                fees(x, o.breakdown(), o.currency());
                x.el("TotalCharge", null, "RateTotalAmount", o.baseAmount(), "EstimatedTotalAmount", o.totalAmount(), "CurrencyCode", o.currency());
                if (o.offerId() != null) x.el("Reference", null, "Type", 16, "ID", o.offerId(), "DateTime", o.expiresAt() == null ? null : o.expiresAt().toString());
            }
            x.close();
            x.open("VehAvailInfo").open("TPA_Extensions")
             .el("Availability", null, "Count", o.available(), "Held", o.held() ? "true" : null)
             .el("Deposit", null, "Amount", o.depositAmount(), "CurrencyCode", o.currency())
             .el("Excess", null, "Amount", o.excessAmount(), "CurrencyCode", o.currency())
             .el("PaymentType", o.paymentType())
             .el("CancellationPolicy", null, "Code", o.cancellationPolicy());
            if (o.closedReason() != null && !"Available".equals(o.status())) x.el("ClosedReason", o.closedReason());
            x.close().close().close();
        }
        return x.close().close().close().close().close().done();
    }

    public static String reservation(String root, String echo, boolean prod, Reservation r, String vendor) {
        X x = open(root, echo, prod);
        x.line("<Success/>");
        switch (root) {
            case "OTA_VehResRS" -> { x.open("VehResRSCore"); vehReservation(x, r, vendor); x.close(); }
            case "OTA_VehModifyRS" -> { x.open("VehModifyRSCore", "ModifyStatus", "Modified"); vehReservation(x, r, vendor); x.close(); }
            case "OTA_VehRetResRS" -> { x.open("VehRetResRSCore"); vehReservation(x, r, vendor); x.close(); }
            case "OTA_VehCancelRS" -> {
                x.open("VehCancelRSCore", "CancelStatus", "Cancelled").el("UniqueID", null, "Type", 14, "ID", r.reservationId()).close();
                x.open("VehCancelRSInfo"); vehReservation(x, r, vendor); x.close();
            }
            default -> throw new IllegalArgumentException(root);
        }
        tpa(x, r);
        return x.close().done();
    }

    private static void vehReservation(X x, Reservation r, String vendor) {
        x.open("VehReservation", "ReservationStatus", otaStatus(r.status()), "CreateDateTime", r.createdAt() == null ? null : r.createdAt().toString());
        Customer c = r.customer();
        x.open("Customer").open("Primary").open("PersonName");
        if (c.firstName() != null && !c.firstName().isBlank()) x.el("GivenName", c.firstName());
        x.el("Surname", c.lastName()).close();
        if (c.phone() != null && !c.phone().isBlank()) x.el("Telephone", null, "PhoneNumber", c.phone());
        if (c.email() != null && !c.email().isBlank()) x.el("Email", c.email());
        x.close().close();
        x.open("VehSegmentCore");
        x.el("ConfID", null, "Type", 14, "ID", r.reservationId());
        if (r.brokerReference() != null) x.el("ConfID", null, "Type", 16, "ID", r.brokerReference(), "ID_Context", "BROKER");
        x.el("Vendor", "NCT Rental", "Code", vendor);
        rentalCore(x, r.pickupAt(), r.returnAt(), r.pickupLocation(), r.returnLocation());
        String desc = r.vehicleDescription() == null ? r.vehicleGroup() : r.vehicleDescription().replaceFirst("^[A-Z]{4} · ", "");
        vehicle(x, r.vehicleGroup(), desc, null, OtaXml.sippAirCon(r.vehicleGroup()));
        rate(x, r.baseAmount(), r.breakdown(), r.rentalDays(), r.currency(), r.cancellationPolicy());
        equips(x, r.breakdown(), r.currency(), r.rentalDays());
        fees(x, r.breakdown(), r.currency());
        x.el("TotalCharge", null, "RateTotalAmount", r.baseAmount(), "EstimatedTotalAmount", r.totalAmount(), "CurrencyCode", r.currency());
        x.close();
        x.open("VehSegmentInfo").open("PaymentRules").el("PaymentRule", null, "RuleType", "PREPAID".equals(r.paymentStatus()) || "BROKER_PREPAID".equals(r.paymentType()) ? 2 : 1,
            "Amount", r.totalAmount(), "CurrencyCode", r.currency()).close().close();
        x.close();
    }

    private static void tpa(X x, Reservation r) {
        x.open("TPA_Extensions")
         .el("ReservationStatus", r.status())
         .el("PaymentStatus", r.paymentStatus())
         .el("PaymentType", r.paymentType())
         .el("CancellationPolicy", null, "Code", r.cancellationPolicy());
        if (r.assignedVehicle() != null && !r.assignedVehicle().isBlank()) x.el("AssignedVehicle", r.assignedVehicle());
        if (r.cancellationFee() != null) {
            x.el("CancellationFee", null, "Amount", r.cancellationFee(), "CurrencyCode", r.currency());
            x.el("RefundAmount", null, "Amount", r.refundAmount(), "CurrencyCode", r.currency(), "Status", r.refundStatus());
        }
        if (r.sandbox()) x.el("Sandbox", "true");
        x.close();
    }

    public static String error(String root, String echo, boolean prod, ChannelException e, String requestId) {
        X x = open(root, echo, prod);
        x.open("Errors").el("Error", e.getMessage(), "Type", e.error.otaType, "Code", e.error.otaCode, "ShortText", e.error.name(),
            "Status", "NotProcessed", "Tag", requestId).close();
        return x.close().done();
    }

    private static void rentalCore(X x, LocalDateTime from, LocalDateTime to, String pick, String ret) {
        x.open("VehRentalCore", "PickUpDateTime", from.format(LOCAL), "ReturnDateTime", to.format(LOCAL))
         .el("PickUpLocation", null, "LocationCode", pick).el("ReturnLocation", null, "LocationCode", ret).close();
    }

    private static void vehicle(X x, String sipp, String model, String transmission, boolean airCon) {
        x.open("Vehicle", "AirConditionInd", airCon, "TransmissionType", transmission, "Code", sipp, "CodeContext", "SIPP")
         .el("VehMakeModel", null, "Name", model, "Code", sipp).close();
    }

    private static void rate(X x, BigDecimal base, List<PriceLine> lines, int days, String cur, String policy) {
        PriceLine b = lines.stream().filter(l -> "BASE".equals(l.type())).findFirst().orElse(null);
        x.open("RentalRate").el("RateDistance", null, "Unlimited", true, "DistUnitName", "Km", "VehiclePeriodUnitName", "RentalPeriod")
         .open("VehicleCharges").open("VehicleCharge", "Purpose", 1, "TaxInclusive", true, "IncludedInRate", false, "Amount", base, "CurrencyCode", cur)
         .el("Calculation", null, "UnitCharge", b == null ? null : b.unitAmount(), "UnitName", "Day", "Quantity", days).close().close()
         .el("RateQualifier", null, "RateQualifier", policy, "RatePeriod", "Daily").close();
    }

    private static void equips(X x, List<PriceLine> lines, String cur, int days) {
        List<PriceLine> ex = lines.stream().filter(l -> "EXTRA".equals(l.type())).toList();
        if (ex.isEmpty()) return;
        x.open("PricedEquips");
        for (PriceLine l : ex) {
            x.open("PricedEquip").open("Equipment", "EquipType", l.code(), "Quantity", l.quantity()).el("Description", l.description()).close()
             .open("Charge", "Amount", l.amount(), "CurrencyCode", cur, "TaxInclusive", true, "IncludedInRate", false)
             .el("Calculation", null, "UnitCharge", l.unitAmount(), "UnitName", "RentalPeriod", "Quantity", l.quantity()).close().close();
        }
        x.close();
    }

    private static void fees(X x, List<PriceLine> lines, String cur) {
        List<PriceLine> f = lines.stream().filter(l -> "FEE".equals(l.type())).toList();
        if (f.isEmpty()) return;
        x.open("Fees");
        for (PriceLine l : f) x.el("Fee", null, "Purpose", l.code(), "Description", l.description(), "Amount", l.amount(), "CurrencyCode", cur, "TaxInclusive", true);
        x.close();
    }

    /** OTA ReservationStatus wording for our external statuses. */
    static String otaStatus(String s) {
        return switch (s) {
            case "CANCELLED" -> "Cancelled";
            case "COMPLETED" -> "Completed";
            case "IN_PROGRESS", "PICKED_UP" -> "Confirmed";
            case "PENDING" -> "Pending";
            case "NO_SHOW" -> "NoShow";
            default -> "Reserved";
        };
    }

    // ================================================================== tiny XML helpers

    static X open(String root, String echo, boolean prod) {
        X x = new X();
        x.sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        return x.open(root, "xmlns", NS, "EchoToken", echo, "TimeStamp", OffsetDateTime.now(ZoneOffset.UTC).format(TS),
            "Target", prod ? "Production" : "Test", "Version", "2.000");
    }

    /** Minimal indenting XML writer; every value is escaped. */
    static final class X {
        final StringBuilder sb = new StringBuilder();
        private final List<String> stack = new ArrayList<>();

        X open(String name, Object... attrs) {
            indent().append('<').append(name).append(attrs(attrs)).append(">\n");
            stack.add(name);
            return this;
        }
        X close() {
            String name = stack.remove(stack.size() - 1);
            indent().append("</").append(name).append(">\n");
            return this;
        }
        X el(String name, String text, Object... attrs) {
            indent().append('<').append(name).append(attrs(attrs));
            if (text == null) sb.append("/>\n"); else sb.append('>').append(OtaXml.escape(text)).append("</").append(name).append(">\n");
            return this;
        }
        X line(String raw) { indent().append(raw).append('\n'); return this; }
        String done() {
            while (!stack.isEmpty()) close();
            return sb.toString().trim();
        }
        private StringBuilder indent() { return sb.append("  ".repeat(stack.size())); }
        private static String attrs(Object... p) {
            StringBuilder a = new StringBuilder();
            for (int i = 0; i + 1 < p.length; i += 2) {
                Object v = p[i + 1];
                if (v == null || v.toString().isEmpty()) continue;
                String s = v instanceof BigDecimal d ? d.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString() : v.toString();
                a.append(' ').append(p[i]).append("=\"").append(OtaXml.escape(s)).append('"');
            }
            return a.toString();
        }
    }

    static Element first(Element parent, String local) {
        if (parent == null) return null;
        NodeList all = parent.getElementsByTagNameNS("*", local);
        if (all.getLength() > 0) return (Element) all.item(0);
        all = parent.getElementsByTagName(local);
        return all.getLength() > 0 ? (Element) all.item(0) : null;
    }

    static List<Element> all(Element parent, String local) {
        List<Element> out = new ArrayList<>();
        if (parent == null) return out;
        NodeList l = parent.getElementsByTagNameNS("*", local);
        if (l.getLength() == 0) l = parent.getElementsByTagName(local);
        for (int i = 0; i < l.getLength(); i++) if (l.item(i).getNodeType() == Node.ELEMENT_NODE) out.add((Element) l.item(i));
        return out;
    }

    static String attr(Element e, String name) { return e == null ? "" : e.getAttribute(name).trim(); }
    static String text(Element e) { return e == null ? "" : e.getTextContent().trim(); }
    private static String emptyToNull(String s) { return s == null || s.isBlank() ? null : s; }

    static LocalDateTime dateTime(String v, String field) {
        if (v == null || v.isBlank()) throw ChannelError.INVALID_DATE.ex(field + " is required");
        try {
            return OtaRequestParser.parseDateTime(v, field);
        } catch (OtaRequestParser.InvalidRequestException e) {
            throw ChannelError.INVALID_DATE.ex(e.getMessage());
        }
    }

    static int intOf(String v, String field) {
        try { return Integer.parseInt(v.trim()); } catch (Exception e) { throw ChannelError.INVALID_REQUEST.ex(field + " must be a whole number"); }
    }
}
