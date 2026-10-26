package com.carrental.backend.ota;

import com.carrental.backend.ota.ChannelError.ChannelException;
import com.carrental.backend.ota.ChannelModels.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.w3c.dom.Element;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * Native XML adapter (the supplier's own message format, for partners that do not use OTA):
 *
 *   POST /xml/v1/Locations           LocationsRequest           → LocationsResponse
 *   POST /xml/v1/VehicleGroups       VehicleGroupsRequest       → VehicleGroupsResponse
 *   POST /xml/v1/Extras              ExtrasRequest              → ExtrasResponse
 *   POST /xml/v1/Coverages           CoveragesRequest           → CoveragesResponse
 *   POST /xml/v1/Inventory           InventoryRequest           → InventoryResponse (free cars per group per day)
 *   POST /xml/v1/Availability        AvailabilityRequest        → AvailabilityResponse
 *   POST /xml/v1/Quote               QuoteRequest               → QuoteResponse (holds the car)
 *   POST /xml/v1/ReservationCreate   ReservationCreateRequest   → ReservationCreateResponse
 *   POST /xml/v1/ReservationStatus   ReservationStatusRequest   → ReservationStatusResponse
 *   POST /xml/v1/ReservationModify   ReservationModifyRequest   → ReservationModifyResponse
 *   POST /xml/v1/ReservationCancel   ReservationCancelRequest   → ReservationCancelResponse
 *
 * Every request carries Header/ChannelCode (and RequestID, IdempotencyKey for writes) and the
 * API key in Credentials/ApiKey or the X-Api-Key header. Every response has Header/Status
 * SUCCESS|ERROR, ErrorCode, ErrorMessage, RequestID and Timestamp. The XSD is at GET /xml/v1/schema.xsd.
 */
@RestController
@RequestMapping("/xml/v1")
public class NativeXmlController {

    private static final MediaType XML = new MediaType("application", "xml", StandardCharsets.UTF_8);
    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'");
    private static final DateTimeFormatter LOCAL = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final Map<String, String> ROOTS = Map.ofEntries(
        Map.entry("Locations", "LocationsRequest"), Map.entry("VehicleGroups", "VehicleGroupsRequest"), Map.entry("Extras", "ExtrasRequest"),
        Map.entry("Coverages", "CoveragesRequest"), Map.entry("Inventory", "InventoryRequest"),
        Map.entry("Availability", "AvailabilityRequest"), Map.entry("Quote", "QuoteRequest"), Map.entry("ReservationCreate", "ReservationCreateRequest"),
        Map.entry("ReservationStatus", "ReservationStatusRequest"), Map.entry("ReservationModify", "ReservationModifyRequest"),
        Map.entry("ReservationCancel", "ReservationCancelRequest"));

    private final ChannelGateway gateway;
    private final ChannelBookingService core;

    public NativeXmlController(ChannelGateway gateway, ChannelBookingService core) {
        this.gateway = gateway;
        this.core = core;
    }

    @GetMapping(value = "/schema.xsd", produces = "application/xml")
    public ResponseEntity<String> schema() {
        return ResponseEntity.ok().contentType(XML).header("Cache-Control", "public, max-age=3600").body(ChannelSchemas.nativeXsd());
    }

    @PostMapping(value = "/{operation}", consumes = {MediaType.APPLICATION_XML_VALUE, MediaType.TEXT_XML_VALUE, MediaType.ALL_VALUE})
    public ResponseEntity<String> handle(@PathVariable String operation, @RequestBody(required = false) String body, HttpServletRequest http) {
        String root = ROOTS.get(operation);
        String responseRoot = (root == null ? operation + "Request" : root).replace("Request", "Response");
        // Header values are needed before the gateway (channel, key, request id), so parse first.
        OtaBookingXml.Parsed p;
        try {
            if (root == null) throw ChannelError.INVALID_REQUEST.ex("Unknown operation " + operation);
            p = OtaBookingXml.parse(body, root);
        } catch (ChannelException e) {
            return ResponseEntity.status(e.error.http).contentType(XML).body(error(responseRoot, e, null));
        }
        Element h = OtaBookingXml.first(p.root(), "Header");
        Element cred = OtaBookingXml.first(p.root(), "Credentials");
        String channel = OtaBookingXml.text(OtaBookingXml.first(h, "ChannelCode"));
        if (channel.isEmpty()) channel = OtaBookingXml.text(OtaBookingXml.first(cred, "Username"));
        String key = PartnerKeyVerifier.extractKey(http.getHeader("Authorization"), http.getHeader("X-Api-Key"));
        if (key == null || key.isBlank()) key = OtaBookingXml.text(OtaBookingXml.first(cred, "ApiKey"));
        if (key == null || key.isBlank()) key = OtaBookingXml.text(OtaBookingXml.first(cred, "PasswordHash"));
        String rid = OtaBookingXml.text(OtaBookingXml.first(h, "RequestID"));
        String idem = OtaBookingXml.text(OtaBookingXml.first(h, "IdempotencyKey"));
        if (idem.isEmpty() && http.getHeader("Idempotency-Key") != null) idem = http.getHeader("Idempotency-Key");
        final String idemKey = idem;
        Element r = p.root();
        Function<ChannelGateway.Call, String> action = switch (operation) {
            case "Locations" -> c -> ok(responseRoot, c, x -> {
                x.open("Locations");
                for (Location l : core.locations(c.ctx())) {
                    x.open("Location").el("Code", l.code()).el("Name", l.name()).el("Type", l.type()).opt("Address", l.address())
                     .opt("Phone", l.phone())
                     .opt("Latitude", plain(l.latitude())).opt("Longitude", plain(l.longitude()))
                     .el("PickupAllowed", String.valueOf(l.pickup())).el("ReturnAllowed", String.valueOf(l.dropOff()));
                    x.open("OpeningHours");
                    for (OpeningHours oh : l.openingHours()) x.el("Day", null, "Name", oh.day(), "Open", oh.open(), "Close", oh.close());
                    x.close();
                    x.el("AfterHours", null, "Pickup", l.afterHoursPickup(), "Return", l.afterHoursReturn(), "Fee", l.afterHoursFee().signum() > 0 ? l.afterHoursFee() : null);
                    x.close();
                }
                x.close();
            });
            case "VehicleGroups" -> c -> ok(responseRoot, c, x -> {
                x.open("VehicleGroups");
                for (VehicleGroup g : core.vehicleGroups(c.ctx())) {
                    x.open("VehicleGroup").el("Code", g.code()).el("SippCode", g.code()).el("Name", g.name())
                    .el("Example", g.modelExample()).el("Transmission", g.transmission()).el("AirConditioning", String.valueOf(g.airCon()))
                    .el("DepositAmount", money(g.depositAmount())).el("ExcessAmount", money(g.excessAmount()));
                    vehicle(x, g.vehicle());
                    x.close();
                }
                x.close();
            });
            case "Extras" -> c -> ok(responseRoot, c, x -> {
                x.open("Extras");
                for (Extra e : core.extras(c.ctx())) x.open("Extra").el("Code", e.code()).el("Name", e.name()).el("DailyPrice", money(e.dailyPrice()))
                    .opt("MaxPerRental", e.maxPerRental()).close();
                x.close();
            });
            case "Coverages" -> c -> ok(responseRoot, c, x -> {
                x.open("Coverages");
                for (Coverage v : core.coverages(c.ctx())) x.open("Coverage").el("Code", v.code()).el("Name", v.name())
                    .el("Included", String.valueOf(v.included())).el("DailyPrice", money(v.dailyPrice()))
                    .opt("ExcessAmount", v.excess()).opt("DepositAmount", v.deposit()).close();
                x.close();
            });
            case "Inventory" -> c -> {
                String d = val(r, "Days");
                int days = d.isEmpty() ? c.ctx().rules().inventoryPushDays() : Math.max(1, Math.min(365, OtaBookingXml.intOf(d, "Days")));
                var inv = core.inventory(c.ctx(), days);
                return ok(responseRoot, c, x -> {
                    x.open("Inventory", "From", inv.path("from").asText(), "To", inv.path("to").asText());
                    for (var g : inv.path("groups")) {
                        x.open("VehicleGroup", "Code", g.path("vehicle_group").asText(), "FleetSize", g.path("fleet_size").asInt());
                        for (var day : g.path("days")) x.el("Day", null, "Date", day.path("date").asText(), "Available", day.path("available").asInt(),
                            "Status", day.path("status").asText(), "Reason", day.path("reason").asText(null));
                        x.close();
                    }
                    x.close();
                });
            };
            case "Availability" -> c -> {
                List<Offer> offers = core.search(c.ctx(), search(r, c.ctx().rules()));
                if (offers.stream().noneMatch(o -> "Available".equals(o.status()))) throw ChannelError.NO_AVAILABILITY.ex(null);
                boolean onlyAvailable = !"false".equalsIgnoreCase(OtaBookingXml.text(OtaBookingXml.first(r, "OnlyAvailable")));
                return ok(responseRoot, c, x -> {
                    x.open("Offers");
                    for (Offer o : offers) if (!onlyAvailable || "Available".equals(o.status())) offer(x, o);
                    x.close();
                });
            };
            case "Quote" -> c -> {
                Offer o = core.quote(c.ctx(), OtaBookingXml.text(OtaBookingXml.first(r, "OfferID")));
                return ok(responseRoot, c, x -> offer(x, o));
            };
            case "ReservationCreate" -> c -> {
                Reservation res = core.create(c.ctx(), booking(r, c.ctx().rules(), idemKey));
                return ok(responseRoot, c, x -> reservation(x, res));
            };
            case "ReservationStatus" -> c -> {
                Reservation res = core.get(c.ctx(), reference(r));
                return ok(responseRoot, c, x -> reservation(x, res));
            };
            case "ReservationModify" -> c -> {
                Reservation res = core.modify(c.ctx(), modify(r));
                return ok(responseRoot, c, x -> reservation(x, res));
            };
            case "ReservationCancel" -> c -> {
                Reservation res = core.cancel(c.ctx(), reference(r), OtaBookingXml.text(OtaBookingXml.first(r, "Reason")));
                return ok(responseRoot, c, x -> reservation(x, res));
            };
            default -> throw new IllegalStateException();
        };
        return gateway.handle(channel, key, http, "XML " + operation, body == null ? 0 : body.length(), rid,
            c -> new ChannelGateway.Rendered(action.apply(c), XML),
            (e, id) -> new ChannelGateway.Rendered(error(responseRoot, e, id), XML));
    }

    // ------------------------------------------------------------ requests

    private static Search search(Element r, ChannelRules rules) {
        Element it = OtaBookingXml.first(r, "Itinerary");
        if (it == null) throw ChannelError.INVALID_REQUEST.ex("Itinerary is required");
        String pick = val(it, "PickupLocationCode");
        String ret = val(it, "ReturnLocationCode");
        if (pick.isEmpty()) pick = rules.locations().get(0).code();
        if (ret.isEmpty()) ret = pick;
        String age = val(it, "DriverAge");
        return new Search(pick, ret, OtaBookingXml.dateTime(val(it, "PickupDateTime"), "PickupDateTime"),
            OtaBookingXml.dateTime(val(it, "ReturnDateTime"), "ReturnDateTime"),
            age.isEmpty() ? null : OtaBookingXml.intOf(age, "DriverAge"), emptyNull(val(it, "DriverCountry")),
            emptyNull(val(it, "VehicleGroupCode").toUpperCase()), extras(r), coverages(r), emptyNull(val(r, "PromoCode")));
    }

    private static List<String> coverages(Element r) {
        List<String> out = new ArrayList<>();
        for (Element e : OtaBookingXml.all(r, "CoverageCode")) if (!OtaBookingXml.text(e).isEmpty()) out.add(OtaBookingXml.text(e).toUpperCase());
        return out;
    }

    private static List<ExtraRequest> extras(Element r) {
        List<ExtraRequest> out = new ArrayList<>();
        for (Element e : OtaBookingXml.all(r, "Extra")) {
            String code = val(e, "Code");
            if (code.isEmpty()) continue;
            String q = val(e, "Quantity");
            out.add(new ExtraRequest(code, q.isEmpty() ? 1 : OtaBookingXml.intOf(q, "Quantity")));
        }
        return out;
    }

    private static BookingRequest booking(Element r, ChannelRules rules, String idem) {
        Element cu = OtaBookingXml.first(r, "Customer");
        if (cu == null) throw ChannelError.INVALID_REQUEST.ex("Customer is required");
        Customer c = new Customer(val(cu, "Title"), val(cu, "FirstName"), val(cu, "LastName"), val(cu, "Email"), val(cu, "Phone"), val(cu, "Country"));
        Element d = OtaBookingXml.first(r, "Driver");
        Driver driver = d == null ? null : new Driver(val(d, "FirstName"), val(d, "LastName"), val(d, "DateOfBirth"), val(d, "LicenceNumber"), val(d, "LicenceCountry"));
        String offer = OtaBookingXml.text(OtaBookingXml.first(r, "OfferID"));
        Search s = OtaBookingXml.first(r, "Itinerary") == null ? null : search(r, rules);
        String expected = OtaBookingXml.text(OtaBookingXml.first(r, "ExpectedTotalAmount"));
        return new BookingRequest(offer.isEmpty() ? null : offer, emptyNull(OtaBookingXml.text(OtaBookingXml.first(r, "BrokerReference"))), idem, s, c, driver,
            expected.isEmpty() ? null : new BigDecimal(expected), emptyNull(OtaBookingXml.text(OtaBookingXml.first(r, "Comments"))),
            emptyNull(OtaBookingXml.text(OtaBookingXml.first(r, "FlightNumber"))));
    }

    private static ModifyRequest modify(Element r) {
        Element it = OtaBookingXml.first(r, "Itinerary");
        Search s = null;
        if (it != null || OtaBookingXml.first(r, "Extras") != null || OtaBookingXml.first(r, "Coverages") != null || !val(r, "PromoCode").isEmpty()) {
            String from = val(it, "PickupDateTime"), to = val(it, "ReturnDateTime"), age = val(it, "DriverAge");
            s = new Search(emptyNull(val(it, "PickupLocationCode")), emptyNull(val(it, "ReturnLocationCode")),
                from.isEmpty() ? null : OtaBookingXml.dateTime(from, "PickupDateTime"), to.isEmpty() ? null : OtaBookingXml.dateTime(to, "ReturnDateTime"),
                age.isEmpty() ? null : OtaBookingXml.intOf(age, "DriverAge"), null, emptyNull(val(it, "VehicleGroupCode").toUpperCase()),
                OtaBookingXml.first(r, "Extras") == null ? null : extras(r),
                OtaBookingXml.first(r, "Coverages") == null ? null : coverages(r), val(r, "PromoCode").isEmpty() ? null : val(r, "PromoCode"));
        }
        Element cu = OtaBookingXml.first(r, "Customer");
        Customer c = cu == null ? null : new Customer(val(cu, "Title"), val(cu, "FirstName"), val(cu, "LastName"), val(cu, "Email"), val(cu, "Phone"), val(cu, "Country"));
        Element d = OtaBookingXml.first(r, "Driver");
        Driver driver = d == null ? null : new Driver(val(d, "FirstName"), val(d, "LastName"), val(d, "DateOfBirth"), val(d, "LicenceNumber"), val(d, "LicenceCountry"));
        String expected = OtaBookingXml.text(OtaBookingXml.first(r, "ExpectedTotalAmount"));
        return new ModifyRequest(reference(r), s, c, driver, expected.isEmpty() ? null : new BigDecimal(expected), emptyNull(OtaBookingXml.text(OtaBookingXml.first(r, "Comments"))));
    }

    private static String reference(Element r) {
        String id = OtaBookingXml.text(OtaBookingXml.first(r, "ReservationID"));
        if (id.isEmpty()) id = OtaBookingXml.text(OtaBookingXml.first(r, "BrokerReference"));
        if (id.isEmpty()) throw ChannelError.INVALID_REQUEST.ex("ReservationID or BrokerReference is required");
        return id;
    }

    // ------------------------------------------------------------ responses

    private static String ok(String root, ChannelGateway.Call c, java.util.function.Consumer<OtaBookingXml.X> body) {
        OtaBookingXml.X x = new OtaBookingXml.X();
        x.sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        x.open(root);
        x.open("Header").opt("RequestID", c.requestId()).el("Status", "SUCCESS").el("Environment", c.ctx().sandbox() ? "SANDBOX" : "PRODUCTION")
         .el("Timestamp", now()).close();
        body.accept(x);
        return x.done();
    }

    static String error(String root, ChannelException e, String rid) {
        OtaBookingXml.X x = new OtaBookingXml.X();
        x.sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        x.open(root).open("Header").opt("RequestID", rid).el("Status", "ERROR").el("ErrorCode", e.error.name())
         .el("ErrorMessage", e.getMessage()).el("Timestamp", now()).close();
        return x.done();
    }

    private static void offer(OtaBookingXml.X x, Offer o) {
        x.open("Offer").opt("OfferID", o.offerId()).el("VehicleGroupCode", o.vehicleGroup()).el("VehicleGroupName", o.groupName())
         .el("SippCode", o.vehicleGroup()).el("VehicleExample", o.modelExample()).el("Transmission", o.transmission())
         .el("Available", String.valueOf("Available".equals(o.status()))).el("AvailableCount", String.valueOf(o.available()))
         .el("Currency", o.currency()).el("RentalDays", String.valueOf(o.rentalDays()));
        if (o.closedReason() != null && !"Available".equals(o.status())) x.el("ClosedReason", o.closedReason());
        vehicle(x, o.vehicle());
        x.open("Price").el("BaseAmount", money(o.baseAmount())).el("ExtrasAmount", money(o.extrasAmount())).el("FeesAmount", money(o.feesAmount()))
         .el("TaxAmount", money(o.taxAmount())).el("TaxIncluded", String.valueOf(o.taxIncluded()))
         .opt("TaxName", o.taxPercent() != null && o.taxPercent().signum() > 0 ? o.taxName() : null)
         .opt("TaxPercent", o.taxPercent() != null && o.taxPercent().signum() > 0 ? o.taxPercent().stripTrailingZeros().toPlainString() : null)
         .el("TotalAmount", money(o.totalAmount())).opt("PromoCode", o.promoCode());
        lines(x, o.breakdown());
        x.close();
        mileage(x, o.mileage());
        covers(x, o.coverages());
        x.open("Policies").el("CancellationPolicyCode", o.cancellationPolicy()).el("PaymentType", o.paymentType())
         .el("DepositAmount", money(o.depositAmount())).el("ExcessAmount", money(o.excessAmount())).close();
        if (o.expiresAt() != null) x.el("QuoteExpiresAt", o.expiresAt().toString());
        if (o.held()) x.el("Held", "true");
        x.close();
    }

    private static void reservation(OtaBookingXml.X x, Reservation r) {
        x.open("Reservation").el("ReservationID", r.reservationId()).opt("BrokerReference", r.brokerReference()).el("Status", r.status())
         .el("VehicleGroupCode", r.vehicleGroup()).el("Vehicle", r.vehicleDescription())
         .el("PickupLocationCode", r.pickupLocation()).el("ReturnLocationCode", r.returnLocation())
         .el("PickupDateTime", r.pickupAt().format(LOCAL)).el("ReturnDateTime", r.returnAt().format(LOCAL)).el("RentalDays", String.valueOf(r.rentalDays()))
         .el("BaseAmount", money(r.baseAmount())).el("ExtrasAmount", money(r.extrasAmount())).el("FeesAmount", money(r.feesAmount()))
         .el("TaxAmount", money(r.taxAmount())).el("TaxIncluded", String.valueOf(r.taxIncluded()))
         .el("TotalAmount", money(r.totalAmount())).el("Currency", r.currency()).opt("PromoCode", r.promoCode())
         .el("PaymentType", r.paymentType()).el("PaymentStatus", r.paymentStatus()).el("CancellationPolicyCode", r.cancellationPolicy());
        lines(x, r.breakdown());
        vehicle(x, r.vehicle());
        mileage(x, r.mileage());
        covers(x, r.coverages());
        x.open("Customer").el("FirstName", r.customer().firstName()).el("LastName", r.customer().lastName())
         .opt("Email", r.customer().email()).opt("Phone", r.customer().phone()).close();
        if (r.assignedVehicle() != null && !r.assignedVehicle().isBlank()) x.el("AssignedVehicle", r.assignedVehicle());
        if (r.cancellationFee() != null) {
            x.el("CancellationFee", money(r.cancellationFee())).el("RefundAmount", money(r.refundAmount())).opt("RefundStatus", r.refundStatus());
        }
        if (r.sandbox()) x.el("Sandbox", "true");
        x.close();
    }

    private static void vehicle(OtaBookingXml.X x, VehicleInfo v) {
        if (v == null) return;
        x.open("VehicleDetails").el("Seats", String.valueOf(v.seats())).el("Doors", String.valueOf(v.doors()))
         .el("LargeBags", String.valueOf(v.largeBags())).el("SmallBags", String.valueOf(v.smallBags())).el("Fuel", v.fuel())
         .opt("PictureURL", v.pictureUrl()).opt("Description", v.description()).close();
    }

    private static void mileage(OtaBookingXml.X x, Mileage m) {
        if (m == null) return;
        x.el("Mileage", null, "Unlimited", m.unlimited(), "KmPerDay", m.unlimited() ? null : m.kmPerDay(),
            "KmIncluded", m.unlimited() ? null : m.kmIncluded(), "ExtraKmPrice", m.extraKmPrice());
    }

    private static void covers(OtaBookingXml.X x, List<CoverageOffer> list) {
        if (list == null || list.isEmpty()) return;
        x.open("Coverages");
        for (CoverageOffer c : list) x.el("Coverage", c.name(), "Code", c.code(), "Included", c.included(), "Selected", c.selected(),
            "DailyPrice", c.dailyPrice(), "Amount", c.amount(), "ExcessAmount", c.excess(), "DepositAmount", c.deposit());
        x.close();
    }

    private static void lines(OtaBookingXml.X x, List<PriceLine> lines) {
        x.open("Breakdown");
        for (PriceLine l : lines) x.el("Line", l.description(), "Type", l.type(), "Code", l.code(), "Quantity", l.quantity(),
            "UnitAmount", l.unitAmount(), "Amount", l.amount());
        x.close();
    }

    private static String val(Element parent, String name) { return OtaBookingXml.text(OtaBookingXml.first(parent, name)); }
    private static String plain(Double d) { return d == null ? null : BigDecimal.valueOf(d).toPlainString(); }
    private static String emptyNull(String s) { return s == null || s.isBlank() ? null : s; }
    private static String money(BigDecimal b) { return b == null ? null : b.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString(); }
    private static String now() { return OffsetDateTime.now(ZoneOffset.UTC).format(TS); }
}
