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
        return new Search(pick, ret, from, to, age, country.isEmpty() ? null : country, group, equipment(root), coverages(root), promo(root),
            currency(root));
    }

    /** The currency the broker sells in: POS/Source ISOCurrency (OTA standard) or TPA_Extensions/Currency. */
    static String currency(Element root) {
        String c = attr(first(first(root, "POS"), "Source"), "ISOCurrency");
        if (c.isEmpty()) c = text(first(first(root, "TPA_Extensions"), "Currency"));
        return c.isEmpty() ? null : c.toUpperCase();
    }

    /** CoveragePrefs/CoveragePref CoverageType (our cover code, e.g. SCDW). */
    private static List<String> coverages(Element root) {
        List<String> out = new ArrayList<>();
        for (Element e : all(root, "CoveragePref")) {
            String code = attr(e, "CoverageType");
            if (code.isEmpty()) code = attr(e, "Code");
            if (!code.isEmpty()) out.add(code.toUpperCase());
        }
        return out;
    }

    /** RateQualifier PromotionCode, as OTA sends it. */
    private static String promo(Element root) {
        for (Element q : all(root, "RateQualifier")) if (!attr(q, "PromotionCode").isEmpty()) return attr(q, "PromotionCode");
        return null;
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
        if (core != null || first(root, "VehPref") != null || first(root, "SpecialEquipPrefs") != null || first(root, "CoveragePrefs") != null
            || promo(root) != null) {
            LocalDateTime from = core == null ? null : dateTime(attr(core, "PickUpDateTime"), "PickUpDateTime");
            LocalDateTime to = core == null ? null : dateTime(attr(core, "ReturnDateTime"), "ReturnDateTime");
            String pick = core == null ? null : emptyToNull(attr(first(core, "PickUpLocation"), "LocationCode"));
            String ret = core == null ? null : emptyToNull(attr(first(core, "ReturnLocation"), "LocationCode"));
            Element pref = first(root, "VehPref");
            Element driver = first(root, "DriverType");
            s = new Search(pick, ret, from, to, driver == null || attr(driver, "Age").isEmpty() ? null : intOf(attr(driver, "Age"), "Age"), null,
                pref == null ? null : emptyToNull(attr(pref, "Code").toUpperCase()),
                first(root, "SpecialEquipPrefs") == null ? null : equipment(root),
                first(root, "CoveragePrefs") == null ? null : coverages(root), promo(root), null);
        }
        Customer c = first(root, "Primary") == null ? null : customer(root);
        return new ModifyRequest(id, s, c, c == null ? null : driver(root, c), expected(root), emptyToNull(text(first(root, "SpecialReqPref"))));
    }

    /** The offer id of a rate-rule or booking request: Reference Type="16" (or any OFF-… id). */
    public static String offerReference(Element root) {
        for (Element r : all(root, "Reference")) {
            String id = attr(r, "ID");
            if ("16".equals(attr(r, "Type")) || id.startsWith("OFF-")) return id;
        }
        return null;
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
            x.open("VehMatchedLoc");
            locationDetail(x, l, vendor);
            x.close();
        }
        return x.close().done();
    }

    /** OTA_VehLocDetailRS: one station in full. */
    public static String locationDetail(String echo, boolean prod, Location l, String vendor) {
        X x = open("OTA_VehLocDetailRS", echo, prod);
        x.line("<Success/>");
        locationDetail(x, l, vendor);
        return x.close().done();
    }

    /** OTA_PingRS: echoes EchoData, proving the credentials and the service work. */
    public static String ping(String echo, boolean prod, String data) {
        X x = open("OTA_PingRS", echo, prod);
        x.line("<Success/>").el("EchoData", data == null || data.isBlank() ? "pong" : data);
        return x.close().done();
    }

    private static void locationDetail(X x, Location l, String vendor) {
        {
            x.open("LocationDetail", "Code", l.code(), "Name", l.name(), "AtAirport", "AIRPORT".equals(l.type()),
                "CodeContext", "IATA");
            if (!l.address().isBlank()) x.open("Address").el("AddressLine", l.address()).close();
            if (l.phone() != null && !l.phone().isBlank()) x.el("Telephone", null, "PhoneNumber", l.phone(), "PhoneTechType", 1);
            if (l.latitude() != null && l.longitude() != null) x.el("Position", null, "Latitude", BigDecimal.valueOf(l.latitude()).toPlainString(), "Longitude", BigDecimal.valueOf(l.longitude()).toPlainString());
            x.open("AdditionalInfo").el("VehRentLocInfos", null);
            if (!l.openingHours().isEmpty()) {
                x.open("OperationSchedules").open("OperationSchedule").open("OperationTimes");
                for (OpeningHours h : l.openingHours()) {
                    String day = h.day().charAt(0) + h.day().substring(1).toLowerCase();   // Mon, Tue … as OTA attribute names
                    x.el("OperationTime", null, day, true, "Start", h.open(), "End", h.close());
                }
                x.close().close().close();
            }
            x.close();
            x.open("TPA_Extensions").el("PickUp", String.valueOf(l.pickup())).el("Return", String.valueOf(l.dropOff()))
             .el("LocationType", l.type()).el("AfterHours", null, "PickUp", l.afterHoursPickup(), "Return", l.afterHoursReturn(),
                 "Fee", l.afterHoursFee().signum() > 0 ? l.afterHoursFee() : null)
             .el("Vendor", null, "Code", vendor).close();
            x.close();
        }
    }

    /** OTA_VehRateRuleRS: price, covers, extras, payment and cancellation rules, age limits, stations and terms. */
    public static String rateRule(String echo, boolean prod, Search s, RateRule rr, String vendor) {
        Offer o = rr.offer();
        X x = open("OTA_VehRateRuleRS", echo, prod);
        x.line("<Success/>");
        rentalCore(x, s.pickupAt(), s.returnAt(), s.pickupLocation(), s.returnLocation());
        vehicle(x, o.vehicleGroup(), o.modelExample(), o.transmission(), o.airCon(), o.vehicle());
        Tax tax = new Tax(o.taxAmount(), o.taxIncluded(), o.taxName(), o.taxPercent());
        rate(x, o.baseAmount(), o.breakdown(), o.rentalDays(), o.currency(), o.cancellationPolicy(), o.mileage(), tax, o.promoCode());
        coverages(x, o.coverages(), o.currency(), o.rentalDays());
        x.open("PricedEquips");
        for (Extra e : rr.extras()) {
            x.open("PricedEquip").open("Equipment", "EquipType", e.code()).el("Description", e.name()).close()
             .open("Charge", "Amount", e.dailyPrice(), "CurrencyCode", o.currency(), "TaxInclusive", o.taxIncluded(), "IncludedInRate", false)
             .el("Calculation", null, "UnitCharge", e.dailyPrice(), "UnitName", "Day", "Quantity", 1, "Total", e.maxPerRental()).close().close();
        }
        x.close();
        fees(x, o.breakdown(), o.currency(), tax);
        x.el("TotalCharge", null, "RateTotalAmount", o.baseAmount(), "EstimatedTotalAmount", o.totalAmount(), "CurrencyCode", o.currency());
        x.open("RateRules", "MinimumKeep", null)
         .el("AdvanceBooking", null, "OffsetTimeUnit", "Hour", "OffsetUnitMultiplier", rr.minLeadHours())
         .el("MaximumRental", null, "UnitName", "Day", "Quantity", rr.maxRentalDays())
         .el("MinimumAge", null, "Age", rr.minDriverAge())
         .el("MaximumAge", null, "Age", rr.maxDriverAge() > 0 ? rr.maxDriverAge() : null);
        x.open("PaymentRules").el("PaymentRule", null, "RuleType", "BROKER_PREPAID".equals(o.paymentType()) ? 2 : 1,
            "Amount", o.totalAmount(), "CurrencyCode", o.currency()).close();
        penalties(x, o.penalties(), o.currency());
        if (rr.modificationFee() != null && rr.modificationFee().signum() > 0) {
            x.open("ModifyPenalties").el("ModifyPenalty", null, "Amount", rr.modificationFee(), "CurrencyCode", o.currency()).close();
        }
        x.close();
        x.open("LocationDetails");
        locationDetail(x, rr.pickupLocation(), vendor);
        if (!rr.returnLocation().code().equals(rr.pickupLocation().code())) locationDetail(x, rr.returnLocation(), vendor);
        x.close();
        if (rr.terms() != null && !rr.terms().isBlank()) x.open("RentalTerms").el("Text", rr.terms(), "Formatted", false).close();
        x.open("TPA_Extensions")
         .el("Deposit", null, "Amount", o.depositAmount(), "CurrencyCode", o.currency())
         .el("Excess", null, "Amount", o.excessAmount(), "CurrencyCode", o.currency())
         .el("PaymentType", o.paymentType())
         .el("CancellationPolicy", null, "Code", o.cancellationPolicy());
        if (o.offerId() != null) x.el("Reference", null, "Type", 16, "ID", o.offerId(), "DateTime", o.expiresAt() == null ? null : o.expiresAt().toString());
        if (o.exchangeRate() != null && o.exchangeRate().compareTo(BigDecimal.ONE) != 0) {
            x.el("Conversion", null, "SourceCurrencyCode", o.baseCurrency(), "RequestedCurrencyCode", o.currency(), "RateConversion", o.exchangeRate().stripTrailingZeros().toPlainString());
        }
        x.close();
        return x.close().done();
    }

    /** CancelPenalties: one CancelPenalty per step, with its absolute deadline and the fee. */
    private static void penalties(X x, List<Penalty> list, String cur) {
        if (list == null || list.isEmpty()) {
            x.open("CancelPenalties").el("CancelPenalty", null, "NonRefundable", false).close();
            return;
        }
        x.open("CancelPenalties");
        for (Penalty p : list) {
            x.open("CancelPenalty").el("Deadline", null, "AbsoluteDeadline", p.from().format(LOCAL), "OffsetTimeUnit", "Hour",
                "OffsetUnitMultiplier", p.hoursBefore(), "OffsetDropTime", "BeforeArrival")
             .el("AmountPercent", null, "Percent", p.percent().stripTrailingZeros().toPlainString(), "Amount", p.amount(), "CurrencyCode", cur).close();
        }
        x.close();
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
            vehicle(x, o.vehicleGroup(), o.modelExample(), o.transmission(), o.airCon(), o.vehicle());
            if ("Available".equals(o.status())) {
                Tax tax = new Tax(o.taxAmount(), o.taxIncluded(), o.taxName(), o.taxPercent());
                rate(x, o.baseAmount(), o.breakdown(), o.rentalDays(), o.currency(), o.cancellationPolicy(), o.mileage(), tax, o.promoCode());
                equips(x, o.breakdown(), o.currency(), o.rentalDays());
                coverages(x, o.coverages(), o.currency(), o.rentalDays());
                fees(x, o.breakdown(), o.currency(), tax);
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
            if ("Available".equals(o.status())) penalties(x, o.penalties(), o.currency());
            if (o.exchangeRate() != null && o.exchangeRate().compareTo(BigDecimal.ONE) != 0) {
                x.el("Conversion", null, "SourceCurrencyCode", o.baseCurrency(), "RequestedCurrencyCode", o.currency(),
                    "RateConversion", o.exchangeRate().stripTrailingZeros().toPlainString());
            }
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
        vehicle(x, r.vehicleGroup(), desc, null, OtaXml.sippAirCon(r.vehicleGroup()), r.vehicle());
        Tax tax = new Tax(r.taxAmount(), r.taxIncluded(), null, null);
        rate(x, r.baseAmount(), r.breakdown(), r.rentalDays(), r.currency(), r.cancellationPolicy(), r.mileage(), tax, r.promoCode());
        equips(x, r.breakdown(), r.currency(), r.rentalDays());
        if (r.coverages() != null) coverages(x, r.coverages(), r.currency(), r.rentalDays());
        fees(x, r.breakdown(), r.currency(), tax);
        x.el("TotalCharge", null, "RateTotalAmount", r.baseAmount(), "EstimatedTotalAmount", r.totalAmount(), "CurrencyCode", r.currency());
        x.close();
        x.open("VehSegmentInfo").open("PaymentRules").el("PaymentRule", null, "RuleType", "PREPAID".equals(r.paymentStatus()) || "BROKER_PREPAID".equals(r.paymentType()) ? 2 : 1,
            "Amount", r.totalAmount(), "CurrencyCode", r.currency()).close().close();
        x.close();
    }

    private static void tpa(X x, Reservation r) {
        x.open("TPA_Extensions");
        if (r.promoCode() != null) x.el("PromotionCode", r.promoCode());
        x
         .el("ReservationStatus", r.status())
         .el("PaymentStatus", r.paymentStatus())
         .el("PaymentType", r.paymentType())
         .el("CancellationPolicy", null, "Code", r.cancellationPolicy());
        if (r.penalties() != null && !"CANCELLED".equals(r.status())) penalties(x, r.penalties(), r.currency());
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

    private static void vehicle(X x, String sipp, String model, String transmission, boolean airCon, VehicleInfo v) {
        x.open("Vehicle", "AirConditionInd", airCon, "TransmissionType", transmission, "FuelType", v == null ? null : v.fuel(),
            "PassengerQuantity", v == null ? null : v.seats(), "BaggageQuantity", v == null ? null : v.largeBags() + v.smallBags(),
            "Code", sipp, "CodeContext", "SIPP");
        if (v != null) x.el("VehType", null, "VehicleCategory", OtaXml.sippVehicleCategory(sipp), "DoorCount", v.doors());
        x.el("VehClass", null, "Size", OtaXml.sippSize(sipp));
        x.el("VehMakeModel", null, "Name", model, "Code", sipp);
        if (v != null && v.pictureUrl() != null && !v.pictureUrl().isBlank()) x.el("PictureURL", v.pictureUrl());
        x.close();
    }

    /** Tax on an offer or booking: amount, whether it is inside the prices, and its name and rate when known. */
    record Tax(BigDecimal amount, boolean included, String name, BigDecimal percent) {}

    private static void rate(X x, BigDecimal base, List<PriceLine> lines, int days, String cur, String policy, Mileage km, Tax tax, String promo) {
        PriceLine b = lines.stream().filter(l -> "BASE".equals(l.type())).findFirst().orElse(null);
        boolean unlimited = km == null || km.unlimited();
        x.open("RentalRate").el("RateDistance", null, "Unlimited", unlimited, "Quantity", unlimited ? null : km.kmPerDay(), "DistUnitName", "Km",
            "VehiclePeriodUnitName", unlimited ? "RentalPeriod" : "Day");
        x.open("VehicleCharges").open("VehicleCharge", "Purpose", 1, "TaxInclusive", tax.included(), "IncludedInRate", false, "Amount", base, "CurrencyCode", cur);
        if (tax.amount() != null && tax.amount().signum() > 0) {
            x.open("TaxAmounts").el("TaxAmount", null, "Total", tax.amount(), "CurrencyCode", cur,
                "Percentage", tax.percent() == null ? null : tax.percent().stripTrailingZeros().toPlainString(), "Description", tax.name()).close();
        }
        x.el("Calculation", null, "UnitCharge", b == null ? null : b.unitAmount(), "UnitName", "Day", "Quantity", days).close().close();
        x.el("RateQualifier", null, "RateQualifier", policy, "RatePeriod", "Daily", "PromotionCode", promo);
        if (!unlimited && km.extraKmPrice() != null) {
            x.open("TPA_Extensions").el("ExtraDistanceCharge", null, "Amount", km.extraKmPrice(), "CurrencyCode", cur, "UnitName", "Km")
             .el("IncludedDistance", null, "Quantity", km.kmIncluded(), "DistUnitName", "Km").close();
        }
        x.close();
    }

    /** Insurance covers: included ones with IncludedInRate=true, optional ones with their daily price. */
    private static void coverages(X x, List<CoverageOffer> covers, String cur, int days) {
        if (covers == null || covers.isEmpty()) return;
        x.open("PricedCoverages");
        for (CoverageOffer c : covers) {
            x.open("PricedCoverage", "Required", c.included(), "Selected", c.selected())
             .open("Coverage", "CoverageType", c.code(), "Code", c.code()).el("Details", c.name(), "CoverageTextType", "Description");
            if (c.excess() != null) x.el("Deductible", null, "ExcessAmount", c.excess(), "CurrencyCode", cur);
            x.close();
            x.open("Charge", "Amount", c.included() ? BigDecimal.ZERO : c.dailyPrice().multiply(BigDecimal.valueOf(days)), "CurrencyCode", cur,
                    "TaxInclusive", true, "IncludedInRate", c.included())
             .el("Calculation", null, "UnitCharge", c.included() ? BigDecimal.ZERO : c.dailyPrice(), "UnitName", "Day", "Quantity", days).close();
            x.close();
        }
        x.close();
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

    private static void fees(X x, List<PriceLine> lines, String cur, Tax tax) {
        List<PriceLine> f = lines.stream().filter(l -> "FEE".equals(l.type()) || "DISCOUNT".equals(l.type()) || "TAX".equals(l.type())).toList();
        if (f.isEmpty()) return;
        x.open("Fees");
        for (PriceLine l : f) x.el("Fee", null, "Purpose", l.code(), "Description", l.description(), "Amount", l.amount(), "CurrencyCode", cur,
            "TaxInclusive", "TAX".equals(l.type()) ? null : tax.included(), "IncludedInEstTotalInd", true);
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
        /** An element only when it has a value (optional fields are left out, not sent empty). */
        X opt(String name, Object value) {
            if (value == null || value.toString().isBlank()) return this;
            return el(name, value instanceof BigDecimal d ? d.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString() : value.toString());
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
