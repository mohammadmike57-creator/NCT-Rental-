package com.carrental.backend.ota;

import com.carrental.backend.audit.ActivityService;
import com.carrental.backend.ota.ChannelError.ChannelException;
import com.carrental.backend.ota.ChannelModels.*;
import com.carrental.backend.service.StateService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.locks.ReentrantLock;

/**
 * The channel core: availability, pricing, offers and holds, and the reservation lifecycle for
 * brokers. Every adapter (OTA XML, native XML, REST/JSON) calls these methods; none of them
 * prices, checks availability or writes bookings on its own.
 *
 * Rules: prices and availability are always recalculated here; bookings are idempotent (same
 * key → same answer, never a second booking); every booking keeps the broker reference, our
 * reservation number and an immutable price snapshot.
 */
@Service
public class ChannelBookingService {

    /** One request's view of a channel: its settings, rules and the current data. */
    public record Ctx(ChannelSnapshot channel, ChannelRules rules, JsonNode state, boolean sandbox) {
        public String code() { return channel.urlCode().toUpperCase(Locale.ROOT); }
    }

    static final ObjectMapper JSON = new ObjectMapper().registerModule(new JavaTimeModule())
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    private static final DateTimeFormatter LOCAL_MIN = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm");
    private static final String[] MONTHS = {"January", "February", "March", "April", "May", "June", "July",
        "August", "September", "October", "November", "December"};

    private final StateService stateService;
    private final ChannelOfferRepository offers;
    private final ChannelBookingRepository bookings;
    private final ActivityService activity;
    private final ChannelWebhookService webhooks;
    /** Availability check + write must not interleave between two bookings for the last car. */
    private final ReentrantLock bookingLock = new ReentrantLock(true);

    public ChannelBookingService(StateService stateService, ChannelOfferRepository offers, ChannelBookingRepository bookings,
                                 ActivityService activity, ChannelWebhookService webhooks) {
        this.stateService = stateService;
        this.offers = offers;
        this.bookings = bookings;
        this.activity = activity;
        this.webhooks = webhooks;
    }

    public Ctx context(ChannelSnapshot ch, boolean forceSandbox) {
        JsonNode state = readState();
        boolean sandbox = forceSandbox || "testing".equalsIgnoreCase(ch.status()) || !ch.isProduction();
        return new Ctx(ch, ChannelRules.of(ch, state.get("rentalLocations")), state, sandbox);
    }

    // =========================================================== reference data

    public List<Location> locations(Ctx c) {
        return c.rules().locations().stream().map(l -> new Location(l.code(), l.name(), l.address(), l.pickup(), l.dropOff())).toList();
    }

    public List<VehicleGroup> vehicleGroups(Ctx c) {
        Map<String, VehicleGroup> out = new LinkedHashMap<>();
        for (JsonNode plan : c.channel().publishedRatePlans()) {
            for (JsonNode rate : plan.path("sippRates")) {
                String code = rate.path("sippCode").asText("").toUpperCase(Locale.ROOT);
                if (code.isBlank() || out.containsKey(code) || !c.rules().groupAllowed(code)) continue;
                List<JsonNode> cars = OtaXml.vehiclesForSipp(c.channel().fleet(), code);
                JsonNode car = cars.isEmpty() ? null : cars.get(0);
                out.put(code, new VehicleGroup(code, groupName(code, car), car == null ? "" : car.path("category").asText(""),
                    car == null ? code : car.path("modelName").asText(code) + " or similar",
                    OtaXml.transmissionOf(car, code), OtaXml.sippAirCon(code), cars.size(),
                    money(car == null ? 0 : car.path("securityDeposit").asDouble(0)), money(car == null ? 0 : car.path("excess").asDouble(0))));
            }
        }
        return new ArrayList<>(out.values());
    }

    public List<Extra> extras(Ctx c) {
        return OtaXml.extras(c.channel()).stream().map(e -> new Extra(e.code(), e.name(), e.dailyPrice(), e.maxPerRental())).toList();
    }

    // =========================================================== availability & offers

    public List<Offer> search(Ctx c, Search s) {
        validate(c, s);
        List<Offer> out = new ArrayList<>();
        for (Offer o : price(c, s, null, null)) {
            if (s.vehicleGroup() != null && !s.vehicleGroup().isBlank() && !o.vehicleGroup().equalsIgnoreCase(s.vehicleGroup())) continue;
            out.add("Available".equals(o.status()) ? persistOffer(c, s, o) : o);
        }
        out.sort(Comparator.comparing((Offer o) -> !"Available".equals(o.status())).thenComparing(Offer::totalAmount));
        if (s.vehicleGroup() != null && !s.vehicleGroup().isBlank() && out.isEmpty()) {
            throw ChannelError.INVALID_VEHICLE_GROUP.ex("Vehicle group " + s.vehicleGroup() + " is not sold on this channel");
        }
        return out;
    }

    /** Re-validates an offer and holds a car for it for a few minutes. */
    public Offer quote(Ctx c, String offerId) {
        bookingLock.lock();
        try {
            ChannelOffer stored = offerFor(c, offerId);
            Search s = searchOf(stored);
            Offer fresh = single(c, s, stored.getSippCode(), stored.getId(), null);
            if (!"Available".equals(fresh.status())) throw ChannelError.NO_AVAILABILITY.ex(fresh.closedReason());
            if (fresh.totalAmount().compareTo(stored.getTotal()) != 0) {
                throw ChannelError.PRICE_CHANGED.ex("The total is now " + fresh.totalAmount() + " " + fresh.currency() + " (offer was " + stored.getTotal() + ")");
            }
            Instant until = Instant.now().plus(c.rules().holdMinutes(), ChronoUnit.MINUTES);
            stored.setStatus(ChannelOffer.Status.HELD);
            if (until.isAfter(stored.getExpiresAt())) stored.setExpiresAt(until);
            offers.save(stored);
            return withId(fresh, stored.getId(), stored.getExpiresAt(), true);
        } finally {
            bookingLock.unlock();
        }
    }

    // =========================================================== reservations

    public Reservation create(Ctx c, BookingRequest req) {
        if (!c.rules().bookingsEnabled()) throw ChannelError.PERMISSION_DENIED.ex("Bookings are not enabled for this channel");
        String ref = trim(req.brokerReference());
        String key = trim(req.idempotencyKey());
        if (key.isEmpty() && ref.isEmpty()) throw ChannelError.INVALID_REQUEST.ex("An Idempotency-Key or a broker reference is required");
        if (key.isEmpty()) key = "REF:" + ref;
        if (key.length() > 150 || ref.length() > 100) throw ChannelError.INVALID_REQUEST.ex("Idempotency key or broker reference is too long");
        String hash = sha256(canonical(req));

        bookingLock.lock();
        try {
            Optional<ChannelBooking> same = bookings.findByChannelIdAndIdempotencyKey(c.channel().id(), key);
            if (same.isPresent()) {
                if (!same.get().getRequestHash().equals(hash)) {
                    throw ChannelError.DUPLICATE_REFERENCE.ex("Idempotency key already used for " + same.get().getReservationNumber() + " with different details");
                }
                return replay(same.get());
            }
            if (!ref.isEmpty()) {
                Optional<ChannelBooking> byRef = bookings.findFirstByChannelIdAndBrokerReference(c.channel().id(), ref);
                if (byRef.isPresent()) throw ChannelError.DUPLICATE_REFERENCE.ex("Broker reference " + ref + " is already booked as " + byRef.get().getReservationNumber());
            }

            ChannelOffer offer = null;
            Search s = req.search();
            if (req.offerId() != null && !req.offerId().isBlank()) {
                offer = offerFor(c, req.offerId());
                s = searchOf(offer);
            }
            if (s == null || s.vehicleGroup() == null || s.vehicleGroup().isBlank()) {
                throw ChannelError.INVALID_REQUEST.ex("Send an offer id, or the rental dates, locations and vehicle group");
            }
            validate(c, s);
            validateCustomer(req.customer());
            validateDriver(c, req.driver(), s.pickupAt());

            Offer fresh = single(c, s, s.vehicleGroup(), offer == null ? "" : offer.getId(), null);
            if (!"Available".equals(fresh.status())) throw ChannelError.NO_AVAILABILITY.ex(fresh.closedReason());
            if (offer != null && fresh.totalAmount().compareTo(offer.getTotal()) != 0) {
                throw ChannelError.PRICE_CHANGED.ex("The total is now " + fresh.totalAmount() + " " + fresh.currency() + " (offer was " + offer.getTotal() + ")");
            }
            if (req.expectedTotal() != null && fresh.totalAmount().compareTo(req.expectedTotal().setScale(2, RoundingMode.HALF_UP)) != 0) {
                throw ChannelError.PRICE_CHANGED.ex("The total is " + fresh.totalAmount() + " " + fresh.currency() + ", not " + req.expectedTotal());
            }

            ChannelBooking b = new ChannelBooking();
            b.setChannelId(c.channel().id());
            b.setChannelCode(c.code());
            b.setReservationNumber(nextNumber(s.pickupAt()));
            b.setBrokerReference(ref.isEmpty() ? null : ref);
            b.setIdempotencyKey(key);
            b.setRequestHash(hash);
            b.setOfferId(offer == null ? null : offer.getId());
            b.setSippCode(fresh.vehicleGroup());
            b.setPickupAt(s.pickupAt());
            b.setReturnAt(s.returnAt());
            b.setTotal(fresh.totalAmount());
            b.setCurrency(fresh.currency());
            b.setCustomerName(req.customer().fullName());
            b.setStatus("PENDING");
            b.setSandbox(c.sandbox());
            b.setCreatedAt(Instant.now());
            b = bookings.save(b);

            ObjectNode res = reservationJson(c, b, s, fresh, req.customer(), req.driver(), req.comments(), req.flightNumber(), null);
            try {
                store(c, b, res);
            } catch (RuntimeException e) {
                bookings.delete(b);
                throw ChannelError.SYSTEM_ERROR.ex("The booking could not be saved; nothing was booked. Retry with the same key.");
            }
            b.setStateReservationId(res.path("id").asText());
            b.setStatus("CONFIRMED");
            Reservation view = view(c, b, res);
            b.setCreateResponse(write(view));
            b.setUpdatedAt(Instant.now());
            bookings.save(b);
            if (offer != null) { offer.setStatus(ChannelOffer.Status.CONVERTED); offers.save(offer); }

            audit(c, "CHANNEL_BOOKING_CREATED", "Booking " + b.getReservationNumber() + " from " + c.channel().name()
                + (ref.isEmpty() ? "" : " (ref " + ref + ")") + " for " + b.getCustomerName() + " — " + fresh.vehicleGroup() + ", "
                + fresh.totalAmount() + " " + fresh.currency(), b);
            webhooks.emit(c, "reservation.created", view);
            webhooks.emit(c, "reservation.confirmed", view);
            return view;
        } finally {
            bookingLock.unlock();
        }
    }

    public Reservation get(Ctx c, String reference) {
        ChannelBooking b = find(c, reference);
        return view(c, b, load(c, b));
    }

    public Reservation modify(Ctx c, ModifyRequest req) {
        bookingLock.lock();
        try {
            ChannelBooking b = find(c, req.reservation());
            ObjectNode res = load(c, b);
            String status = externalStatus(res);
            if (!"CONFIRMED".equals(status) && !"PENDING".equals(status)) {
                throw ChannelError.MODIFICATION_NOT_ALLOWED.ex("Reservation " + b.getReservationNumber() + " is " + status);
            }
            Search cur = searchOf(res, b);
            Search in = req.search();
            Search s = new Search(
                pick(in == null ? null : in.pickupLocation(), cur.pickupLocation()), pick(in == null ? null : in.returnLocation(), cur.returnLocation()),
                in != null && in.pickupAt() != null ? in.pickupAt() : cur.pickupAt(), in != null && in.returnAt() != null ? in.returnAt() : cur.returnAt(),
                in != null && in.driverAge() != null ? in.driverAge() : cur.driverAge(), cur.driverCountry(),
                pick(in == null ? null : in.vehicleGroup(), cur.vehicleGroup()),
                in != null && in.extras() != null ? in.extras() : cur.extras());
            validate(c, s);
            Customer customer = req.customer() != null ? req.customer() : customerOf(res);
            Driver driver = req.driver() != null ? req.driver() : driverOf(res);
            validateCustomer(customer);
            validateDriver(c, driver, s.pickupAt());

            Offer fresh = single(c, s, s.vehicleGroup(), "", b.getStateReservationId());
            if (!"Available".equals(fresh.status())) throw ChannelError.NO_AVAILABILITY.ex(fresh.closedReason());
            BigDecimal fee = c.rules().modificationFee();
            if (fee.signum() > 0) fresh = withFee(fresh, new PriceLine("FEE", "MODIFY", "Modification fee", fee, 1, fee));
            if (req.expectedTotal() != null && fresh.totalAmount().compareTo(req.expectedTotal().setScale(2, RoundingMode.HALF_UP)) != 0) {
                throw ChannelError.PRICE_CHANGED.ex("The new total is " + fresh.totalAmount() + " " + fresh.currency());
            }
            BigDecimal oldTotal = b.getTotal();
            ObjectNode updated = reservationJson(c, b, s, fresh, customer, driver, req.comments() != null ? req.comments() : res.path("channelComments").asText(""),
                res.path("flightNumber").asText(""), res);
            store(c, b, updated);
            b.setSippCode(fresh.vehicleGroup());
            b.setPickupAt(s.pickupAt());
            b.setReturnAt(s.returnAt());
            b.setTotal(fresh.totalAmount());
            b.setCustomerName(customer.fullName());
            b.setUpdatedAt(Instant.now());
            bookings.save(b);
            Reservation view = view(c, b, updated);
            audit(c, "CHANNEL_BOOKING_MODIFIED", "Booking " + b.getReservationNumber() + " modified by " + c.channel().name()
                + " — total " + oldTotal + " → " + fresh.totalAmount() + " " + fresh.currency(), b);
            webhooks.emit(c, "reservation.modified", view);
            return view;
        } finally {
            bookingLock.unlock();
        }
    }

    public Reservation cancel(Ctx c, String reference, String reason) {
        bookingLock.lock();
        try {
            ChannelBooking b = find(c, reference);
            ObjectNode res = load(c, b);
            String status = externalStatus(res);
            if ("CANCELLED".equals(status)) return view(c, b, res);     // cancelling twice is not an error
            if (!"CONFIRMED".equals(status) && !"PENDING".equals(status)) {
                throw ChannelError.CANCELLATION_NOT_ALLOWED.ex("Reservation " + b.getReservationNumber() + " is " + status);
            }
            BigDecimal total = b.getTotal() == null ? BigDecimal.ZERO : b.getTotal();
            long hoursBefore = Duration.between(LocalDateTime.now(), b.getPickupAt()).toHours();
            BigDecimal fee = hoursBefore >= c.rules().freeCancellationHours() ? BigDecimal.ZERO
                : total.multiply(c.rules().lateCancellationFeePercent()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            BigDecimal refund = c.rules().prepaid() ? total.subtract(fee).max(BigDecimal.ZERO) : BigDecimal.ZERO;
            res.put("status", "CANCELLED");
            res.put("cancelledAt", Instant.now().toString());
            res.put("cancelledBy", "Booking API (" + c.code() + ")");
            res.put("cancellationReason", reason == null || reason.isBlank() ? "Cancelled by " + c.channel().name() : reason);
            res.put("cancellationFee", fee);
            res.put("refundAmount", refund);
            res.put("refundStatus", c.rules().prepaid() ? (refund.signum() > 0 ? "PENDING" : "NONE") : "NOT_APPLICABLE");
            res.put("updatedAt", Instant.now().toString());
            store(c, b, res);
            b.setStatus("CANCELLED");
            b.setUpdatedAt(Instant.now());
            bookings.save(b);
            Reservation view = view(c, b, res);
            audit(c, "CHANNEL_BOOKING_CANCELLED", "Booking " + b.getReservationNumber() + " cancelled by " + c.channel().name()
                + (fee.signum() > 0 ? " — cancellation fee " + fee + " " + b.getCurrency() : " — free cancellation"), b);
            webhooks.emit(c, "reservation.cancelled", view);
            return view;
        } finally {
            bookingLock.unlock();
        }
    }

    // =========================================================== pricing

    private List<Offer> price(Ctx c, Search s, String excludeOffer, String excludeReservation) {
        List<String> codes = new ArrayList<>();
        for (ExtraRequest e : s.extras()) codes.add(e.code());
        List<OtaXml.QuoteLine> lines = OtaXml.quote(c.channel(), new OtaXml.QuoteRequest(s.pickupAt(), s.returnAt(), codes));
        if (lines.isEmpty()) throw ChannelError.NO_AVAILABILITY.ex("No rates are published for " + s.pickupAt().toLocalDate());
        Map<String, OtaXml.Extra> extraByCode = new HashMap<>();
        for (OtaXml.Extra e : OtaXml.extras(c.channel())) { extraByCode.put(e.code().toUpperCase(Locale.ROOT), e); extraByCode.put(e.id().toUpperCase(Locale.ROOT), e); }
        for (ExtraRequest e : s.extras()) {
            if (!extraByCode.containsKey(e.code().toUpperCase(Locale.ROOT))) throw ChannelError.INVALID_REQUEST.ex("Unknown extra " + e.code());
        }
        boolean oneWay = !s.pickupLocation().equalsIgnoreCase(s.returnLocation());
        List<Offer> out = new ArrayList<>();
        for (OtaXml.QuoteLine l : lines) {
            if (!c.rules().groupAllowed(l.sippCode())) continue;
            List<PriceLine> breakdown = new ArrayList<>();
            breakdown.add(new PriceLine("BASE", l.sippCode(), l.days() + " day" + (l.days() == 1 ? "" : "s") + " × " + l.dailyRate(), l.dailyRate(), l.days(), l.baseTotal()));
            BigDecimal extrasAmount = BigDecimal.ZERO;
            for (ExtraRequest r : s.extras()) {
                OtaXml.Extra e = extraByCode.get(r.code().toUpperCase(Locale.ROOT));
                int qty = Math.max(1, Math.min(r.quantity(), 9));
                BigDecimal one = e.dailyPrice().multiply(BigDecimal.valueOf(l.days()));
                if (e.maxPerRental() != null && one.compareTo(e.maxPerRental()) > 0) one = e.maxPerRental();
                BigDecimal amount = one.multiply(BigDecimal.valueOf(qty)).setScale(2, RoundingMode.HALF_UP);
                breakdown.add(new PriceLine("EXTRA", e.code(), e.name(), one.setScale(2, RoundingMode.HALF_UP), qty, amount));
                extrasAmount = extrasAmount.add(amount);
            }
            BigDecimal fees = BigDecimal.ZERO;
            if (oneWay && c.rules().oneWayFee().signum() > 0) {
                breakdown.add(new PriceLine("FEE", "ONE_WAY", "One-way fee", c.rules().oneWayFee(), 1, c.rules().oneWayFee()));
                fees = fees.add(c.rules().oneWayFee());
            }
            List<JsonNode> cars = OtaXml.vehiclesForSipp(c.channel().fleet(), l.sippCode());
            JsonNode car = cars.isEmpty() ? null : cars.get(0);
            String status = l.status();
            String reason = l.closedReason();
            int available = 0;
            if (!"Closed".equals(status)) {
                available = available(c, l.sippCode(), s.pickupAt(), s.returnAt(), excludeOffer, excludeReservation);
                if (available <= 0) { status = "Closed"; reason = "Sold out for these dates"; }
                else status = "Available";
            }
            BigDecimal total = l.baseTotal().add(extrasAmount).add(fees).setScale(2, RoundingMode.HALF_UP);
            out.add(new Offer(null, l.sippCode(), groupName(l.sippCode(), car), l.model() + " or similar",
                car == null ? "" : car.path("category").asText(""), l.transmission(), l.airCon(), status, available, reason,
                l.days(), c.channel().currency(), l.baseTotal(), extrasAmount, fees, BigDecimal.ZERO.setScale(2), true, total, breakdown,
                money(car == null ? 0 : car.path("securityDeposit").asDouble(0)), money(car == null ? 0 : car.path("excess").asDouble(0)),
                c.rules().cancellationPolicyCode(), c.rules().paymentModel(), null, false));
        }
        return out;
    }

    private Offer single(Ctx c, Search s, String sipp, String excludeOffer, String excludeReservation) {
        if (!c.rules().groupAllowed(sipp)) throw ChannelError.PERMISSION_DENIED.ex("Vehicle group " + sipp + " is not sold on this channel");
        for (Offer o : price(c, s, excludeOffer, excludeReservation)) if (o.vehicleGroup().equalsIgnoreCase(sipp)) return o;
        throw ChannelError.INVALID_VEHICLE_GROUP.ex("Vehicle group " + sipp + " has no published rate for these dates");
    }

    /**
     * Cars of a group free for the whole period: the group's cars that are not stop-sold or
     * out of registration, minus overlapping bookings and agreements, live holds and the
     * operational buffer kept back from this channel.
     */
    int available(Ctx c, String sipp, LocalDateTime from, LocalDateTime to, String excludeOffer, String excludeReservation) {
        List<JsonNode> cars = OtaXml.vehiclesForSipp(c.channel().fleet(), sipp);
        Set<String> plates = new HashSet<>();
        Set<String> models = new HashSet<>();
        int usable = 0;
        for (JsonNode car : cars) {
            String reg = car.path("registrationExpiry").asText("");
            boolean expired = reg.length() >= 10 && LocalDate.parse(reg.substring(0, 10)).isBefore(to.toLocalDate());
            if (expired || vehicleStopped(c.channel().stopSales(), car.path("id").asText(), from.toLocalDate(), to.toLocalDate())) continue;
            usable++;
            if (!car.path("licensePlate").asText("").isBlank()) plates.add(car.path("licensePlate").asText().trim().toUpperCase(Locale.ROOT));
            models.add(car.path("modelName").asText("").trim().toLowerCase(Locale.ROOT));
        }
        if (usable == 0) return 0;
        int busy = 0;
        for (JsonNode r : allReservations(c.state())) {
            if (excludeReservation != null && excludeReservation.equals(r.path("id").asText())) continue;
            String st = r.path("status").asText("");
            if ("CANCELLED".equals(st) || "NO_SHOW".equals(st) || r.path("dropOffCompleted").asBoolean(false)) continue;
            LocalDateTime s = parseLocal(r.path("startDate").asText(r.path("pickupDate").asText("")));
            LocalDateTime e = parseLocal(r.path("endDate").asText(r.path("dropoffDate").asText("")));
            if (s == null || e == null || !s.isBefore(to) || !e.isAfter(from)) continue;
            if (inGroup(r, sipp, plates, models)) busy++;
        }
        long holds = offers.countHolds(sipp, from, to, Instant.now(), excludeOffer == null ? "" : excludeOffer);
        return (int) Math.max(0, usable - busy - holds - c.rules().operationalBuffer());
    }

    private static boolean inGroup(JsonNode r, String sipp, Set<String> plates, Set<String> models) {
        String code = r.path("sippCode").asText("");
        if (!code.isBlank()) return code.equalsIgnoreCase(sipp);
        String plate = r.path("licensePlate").asText("").trim().toUpperCase(Locale.ROOT);
        if (!plate.isEmpty()) return plates.contains(plate);
        String model = (r.path("carModel").asText("") + " " + r.path("reservationVehicle").asText("")).toLowerCase(Locale.ROOT);
        for (String m : models) if (!m.isBlank() && model.contains(m)) return true;
        return false;
    }

    private static boolean vehicleStopped(JsonNode stops, String carId, LocalDate from, LocalDate to) {
        for (JsonNode s : stops) {
            if (!"vehicle".equals(s.path("type").asText()) || !carId.equals(s.path("target").asText())) continue;
            String a = s.path("startDate").asText(""), b = s.path("endDate").asText("");
            if (a.length() < 10 || b.length() < 10) continue;
            if (!LocalDate.parse(a.substring(0, 10)).isAfter(to) && !LocalDate.parse(b.substring(0, 10)).isBefore(from)) return true;
        }
        return false;
    }

    // =========================================================== validation

    void validate(Ctx c, Search s) {
        if (s.pickupAt() == null || s.returnAt() == null) throw ChannelError.INVALID_DATE.ex("Pick-up and return date and time are required");
        if (!s.returnAt().isAfter(s.pickupAt())) throw ChannelError.INVALID_DATE.ex("Return must be after pick-up");
        LocalDateTime now = LocalDateTime.now();
        if (s.pickupAt().isBefore(now.plusHours(c.rules().minLeadHours()))) {
            throw ChannelError.INVALID_DATE.ex("Pick-up must be at least " + c.rules().minLeadHours() + " hours from now");
        }
        if (s.pickupAt().isAfter(now.plusDays(c.rules().maxHorizonDays()))) {
            throw ChannelError.INVALID_DATE.ex("Bookings are accepted up to " + c.rules().maxHorizonDays() + " days ahead");
        }
        int days = OtaXml.rentalDays(s.pickupAt(), s.returnAt());
        if (days > c.rules().maxRentalDays()) throw ChannelError.INVALID_DATE.ex("The longest rental is " + c.rules().maxRentalDays() + " days");
        ChannelRules.Location p = c.rules().location(s.pickupLocation());
        ChannelRules.Location r = c.rules().location(s.returnLocation());
        if (p == null) throw ChannelError.INVALID_LOCATION.ex("Unknown pick-up location " + s.pickupLocation());
        if (r == null) throw ChannelError.INVALID_LOCATION.ex("Unknown return location " + s.returnLocation());
        if (!p.pickup()) throw ChannelError.INVALID_LOCATION.ex(p.code() + " does not allow pick-ups");
        if (!r.dropOff()) throw ChannelError.INVALID_LOCATION.ex(r.code() + " does not allow returns");
        if (s.driverAge() != null) checkAge(c, s.driverAge());
    }

    private void checkAge(Ctx c, int age) {
        if (age < c.rules().minDriverAge()) throw ChannelError.POLICY_VIOLATION.ex("The driver must be at least " + c.rules().minDriverAge());
        if (c.rules().maxDriverAge() > 0 && age > c.rules().maxDriverAge()) throw ChannelError.POLICY_VIOLATION.ex("The driver must be at most " + c.rules().maxDriverAge());
    }

    private static void validateCustomer(Customer cu) {
        if (cu == null || trim(cu.lastName()).isEmpty()) throw ChannelError.INVALID_REQUEST.ex("Customer last name is required");
        if (trim(cu.firstName()).length() > 100 || trim(cu.lastName()).length() > 100) throw ChannelError.INVALID_REQUEST.ex("Customer name is too long");
        String email = trim(cu.email());
        if (!email.isEmpty() && !email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) throw ChannelError.INVALID_REQUEST.ex("Customer email is not valid");
    }

    private void validateDriver(Ctx c, Driver d, LocalDateTime pickup) {
        if (d == null || trim(d.dateOfBirth()).isEmpty()) return;
        try {
            LocalDate dob = LocalDate.parse(d.dateOfBirth().trim().substring(0, 10));
            checkAge(c, Period.between(dob, pickup.toLocalDate()).getYears());
        } catch (ChannelException e) {
            throw e;
        } catch (Exception e) {
            throw ChannelError.INVALID_REQUEST.ex("Driver date of birth must be YYYY-MM-DD");
        }
    }

    // =========================================================== storage

    private ObjectNode reservationJson(Ctx c, ChannelBooking b, Search s, Offer o, Customer cu, Driver d, String comments,
                                       String flight, ObjectNode existing) {
        ObjectNode r = existing != null ? existing.deepCopy() : JSON.createObjectNode();
        String now = Instant.now().toString();
        if (existing == null) {
            r.put("id", UUID.randomUUID().toString());
            r.put("createdAt", now);
            r.put("uploadBatchId", "CHANNEL");
            r.put("createdBy", "Booking API (" + c.code() + ")");
            r.put("status", "CONFIRMED");
        }
        String bookingId = b.getBrokerReference() != null ? b.getBrokerReference() : b.getReservationNumber();
        String start = s.pickupAt().format(LOCAL_MIN), end = s.returnAt().format(LOCAL_MIN);
        ChannelRules.Location pl = c.rules().location(s.pickupLocation());
        ChannelRules.Location rl = c.rules().location(s.returnLocation());
        r.put("bookingId", bookingId).put("invoice", bookingId);
        r.put("personName", cu.fullName()).put("customer", cu.fullName());
        r.put("contactNumber", trim(cu.phone()));
        if (!trim(cu.email()).isEmpty()) r.put("customerEmail", cu.email().trim()); else r.remove("customerEmail");
        r.put("startDate", start).put("pickupDate", start).put("endDate", end).put("dropoffDate", end);
        r.put("storageYear", s.pickupAt().getYear()).put("storageMonth", MONTHS[s.pickupAt().getMonthValue() - 1]);
        r.put("bookingDate", existing != null ? existing.path("bookingDate").asText(LocalDate.now().toString()) : LocalDate.now().toString());
        r.put("source", sourceName(c));
        r.put("paymentType", c.rules().prepaid() ? "Prepaid" : "Pay on Arrival");
        r.put("sippCode", o.vehicleGroup());
        String vehicle = o.vehicleGroup() + " · " + o.modelExample();
        r.put("reservationVehicle", vehicle).put("vehicle", vehicle);
        if (existing == null || !existing.path("voucherSubmitted").asBoolean(false)) r.put("carModel", o.modelExample().replace(" or similar", ""));
        r.put("locationName", pl == null ? s.pickupLocation() : pl.name());
        r.put("returnLocationName", rl == null ? s.returnLocation() : rl.name());
        r.put("amount", o.totalAmount()).put("baseAmount", o.baseAmount().add(o.feesAmount()));
        r.put("securityDeposit", o.depositAmount()).put("excess", o.excessAmount());
        ArrayNode extras = r.putArray("extras");
        for (PriceLine l : o.breakdown()) {
            if (!"EXTRA".equals(l.type())) continue;
            int days = Math.max(1, o.rentalDays());
            BigDecimal perDay = l.amount().divide(BigDecimal.valueOf(days), 2, RoundingMode.HALF_UP);
            extras.addObject().put("name", l.description() + (l.quantity() > 1 ? " ×" + l.quantity() : "")).put("dailyPrice", perDay).put("isComplementary", false);
        }
        if (d != null) {
            ObjectNode dn = r.with("driver");
            if (!trim(d.licenceNumber()).isEmpty()) dn.put("licenseNumber", d.licenceNumber().trim());
            if (!trim(d.licenceCountry()).isEmpty()) dn.put("licenseCountry", d.licenceCountry().trim());
            if (!trim(d.dateOfBirth()).isEmpty()) dn.put("dateOfBirth", d.dateOfBirth().trim());
            if (!trim(cu.country()).isEmpty()) dn.put("nationality", cu.country().trim());
            if (!trim(d.firstName()).isEmpty() || !trim(d.lastName()).isEmpty()) r.put("driverName", (trim(d.firstName()) + " " + trim(d.lastName())).trim());
        }
        // Channel link and immutable price snapshot.
        r.put("channelId", c.channel().id()).put("channelCode", c.code()).put("channelReservationNumber", b.getReservationNumber());
        if (b.getBrokerReference() != null) r.put("brokerReference", b.getBrokerReference());
        ObjectNode price = JSON.createObjectNode();
        price.put("currency", o.currency()).put("rentalDays", o.rentalDays()).put("base", o.baseAmount()).put("extras", o.extrasAmount())
            .put("fees", o.feesAmount()).put("tax", o.taxAmount()).put("taxIncluded", o.taxIncluded()).put("total", o.totalAmount())
            .put("cancellationPolicy", o.cancellationPolicy()).put("paymentType", o.paymentType()).put("pricedAt", now);
        price.set("lines", JSON.valueToTree(o.breakdown()));
        price.put("pickupLocation", s.pickupLocation().toUpperCase(Locale.ROOT)).put("returnLocation", s.returnLocation().toUpperCase(Locale.ROOT));
        if (s.driverAge() != null) price.put("driverAge", s.driverAge());
        ArrayNode req = price.putArray("extrasRequested");
        for (ExtraRequest e : s.extras()) req.addObject().put("code", e.code()).put("quantity", e.quantity());
        if (existing != null && existing.has("channelPrice")) {
            ArrayNode hist = r.withArray("channelPriceHistory");
            hist.add(existing.get("channelPrice"));
        }
        r.set("channelPrice", price);
        r.put("channelComments", comments == null ? "" : comments);
        if (flight != null && !flight.isBlank()) r.put("flightNumber", flight);
        String note = "Booked via " + c.channel().name() + " API · " + b.getReservationNumber()
            + (b.getBrokerReference() != null ? " · ref " + b.getBrokerReference() : "")
            + (flight != null && !flight.isBlank() ? " · flight " + flight : "") + (comments == null || comments.isBlank() ? "" : " · " + comments);
        r.put("notes", note.length() > 1000 ? note.substring(0, 1000) : note);
        r.put("updatedAt", now);
        r.put("lastEditedBy", "Booking API (" + c.code() + ")");
        return r;
    }

    private void store(Ctx c, ChannelBooking b, ObjectNode res) {
        if (b.isSandbox()) {
            b.setSandboxReservation(write(res));
            return;
        }
        ObjectNode op = JSON.createObjectNode();
        op.put("op", "upsertReservation").put("year", String.valueOf(res.path("storageYear").asInt())).put("month", res.path("storageMonth").asText());
        op.set("reservation", res);
        ObjectNode patch = JSON.createObjectNode();
        patch.putArray("ops").add(op);
        stateService.applyPatch(write(patch));
    }

    private ObjectNode load(Ctx c, ChannelBooking b) {
        if (b.isSandbox()) {
            try { return (ObjectNode) JSON.readTree(b.getSandboxReservation()); } catch (Exception e) { throw ChannelError.SYSTEM_ERROR.ex(null); }
        }
        JsonNode state = readState();
        for (JsonNode r : allReservations(state)) if (r.path("id").asText().equals(b.getStateReservationId())) return (ObjectNode) r.deepCopy();
        // Removed from the reservations list by staff: the broker sees it as cancelled.
        ObjectNode gone = JSON.createObjectNode();
        gone.put("id", b.getStateReservationId()).put("status", "CANCELLED").put("cancellationReason", "Removed by the supplier");
        return gone;
    }

    private ChannelBooking find(Ctx c, String reference) {
        String ref = trim(reference);
        if (ref.isEmpty()) throw ChannelError.INVALID_REQUEST.ex("A reservation number or broker reference is required");
        Optional<ChannelBooking> b = bookings.findByReservationNumber(ref.toUpperCase(Locale.ROOT))
            .filter(x -> x.getChannelId().equals(c.channel().id()));
        if (b.isEmpty()) b = bookings.findFirstByChannelIdAndBrokerReference(c.channel().id(), ref);
        return b.orElseThrow(() -> ChannelError.RESERVATION_NOT_FOUND.ex("No reservation " + ref + " for this channel"));
    }

    private Reservation replay(ChannelBooking b) {
        try {
            return JSON.readValue(b.getCreateResponse(), Reservation.class);
        } catch (Exception e) {
            throw ChannelError.SYSTEM_ERROR.ex(null);
        }
    }

    private ChannelOffer offerFor(Ctx c, String offerId) {
        ChannelOffer o = offers.findById(trim(offerId)).filter(x -> x.getChannelId().equals(c.channel().id()))
            .orElseThrow(() -> ChannelError.OFFER_EXPIRED.ex("Unknown or expired offer " + offerId));
        if (o.getStatus() == ChannelOffer.Status.CONVERTED) throw ChannelError.OFFER_EXPIRED.ex("Offer " + offerId + " was already booked");
        if (o.getExpiresAt().isBefore(Instant.now()) || o.getStatus() == ChannelOffer.Status.EXPIRED || o.getStatus() == ChannelOffer.Status.RELEASED) {
            throw ChannelError.OFFER_EXPIRED.ex("Offer " + offerId + " expired at " + o.getExpiresAt());
        }
        return o;
    }

    private Offer persistOffer(Ctx c, Search s, Offer o) {
        ChannelOffer row = new ChannelOffer();
        row.setId("OFF-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase(Locale.ROOT));
        row.setChannelId(c.channel().id());
        row.setSippCode(o.vehicleGroup());
        row.setPickupLocation(s.pickupLocation().toUpperCase(Locale.ROOT));
        row.setReturnLocation(s.returnLocation().toUpperCase(Locale.ROOT));
        row.setPickupAt(s.pickupAt());
        row.setReturnAt(s.returnAt());
        StringBuilder ex = new StringBuilder();
        for (ExtraRequest e : s.extras()) ex.append(ex.length() == 0 ? "" : ",").append(e.code()).append(':').append(e.quantity());
        row.setExtras(ex.toString());
        row.setDriverAge(s.driverAge());
        row.setCurrency(o.currency());
        row.setTotal(o.totalAmount());
        row.setBreakdown(write(o.breakdown()));
        row.setStatus(ChannelOffer.Status.QUOTED);
        row.setExpiresAt(Instant.now().plus(c.rules().offerValidityMinutes(), ChronoUnit.MINUTES));
        row.setCreatedAt(Instant.now());
        row.setSandbox(c.sandbox());
        offers.save(row);
        return withId(o, row.getId(), row.getExpiresAt(), false);
    }

    private static Search searchOf(ChannelOffer o) {
        List<ExtraRequest> extras = new ArrayList<>();
        if (o.getExtras() != null) for (String p : o.getExtras().split(",")) {
            if (p.isBlank()) continue;
            String[] kv = p.split(":");
            extras.add(new ExtraRequest(kv[0], kv.length > 1 ? Integer.parseInt(kv[1]) : 1));
        }
        return new Search(o.getPickupLocation(), o.getReturnLocation(), o.getPickupAt(), o.getReturnAt(), o.getDriverAge(), null, o.getSippCode(), extras);
    }

    private static Search searchOf(JsonNode res, ChannelBooking b) {
        JsonNode p = res.path("channelPrice");
        List<ExtraRequest> extras = new ArrayList<>();
        for (JsonNode e : p.path("extrasRequested")) extras.add(new ExtraRequest(e.path("code").asText(), e.path("quantity").asInt(1)));
        return new Search(p.path("pickupLocation").asText(""), p.path("returnLocation").asText(""), b.getPickupAt(), b.getReturnAt(),
            p.has("driverAge") ? p.path("driverAge").asInt() : null, null, b.getSippCode(), extras);
    }

    // =========================================================== views

    Reservation view(Ctx c, ChannelBooking b, JsonNode res) {
        JsonNode p = res.path("channelPrice");
        List<PriceLine> lines = new ArrayList<>();
        for (JsonNode l : p.path("lines")) {
            lines.add(new PriceLine(l.path("type").asText(), l.path("code").asText(), l.path("description").asText(),
                l.path("unitAmount").decimalValue(), l.path("quantity").asInt(1), l.path("amount").decimalValue()));
        }
        String status = externalStatus(res);
        boolean cancelled = "CANCELLED".equals(status);
        String assigned = res.path("voucherSubmitted").asBoolean(false) ? (res.path("carModel").asText("") + " " + res.path("licensePlate").asText("")).trim() : null;
        String paymentStatus = c.rules().prepaid() ? (cancelled ? "REFUND_" + res.path("refundStatus").asText("PENDING") : "PREPAID")
            : (res.path("dropOffCompleted").asBoolean(false) ? "PAID" : "PAY_AT_COUNTER");
        return new Reservation(b.getReservationNumber(), b.getBrokerReference(), status, b.getChannelCode(), b.getSippCode(),
            res.path("reservationVehicle").asText(b.getSippCode()), p.path("pickupLocation").asText(""), p.path("returnLocation").asText(""),
            b.getPickupAt(), b.getReturnAt(), p.path("rentalDays").asInt(OtaXml.rentalDays(b.getPickupAt(), b.getReturnAt())), b.getCurrency(),
            p.path("base").decimalValue(), p.path("extras").decimalValue(), p.path("fees").decimalValue(), b.getTotal(), lines,
            p.path("paymentType").asText(c.rules().paymentModel()), paymentStatus, p.path("cancellationPolicy").asText(c.rules().cancellationPolicyCode()),
            customerOf(res), driverOf(res), assigned, b.getCreatedAt(),
            cancelled ? res.path("cancellationFee").decimalValue() : null, cancelled ? res.path("refundAmount").decimalValue() : null,
            cancelled ? res.path("refundStatus").asText(null) : null, b.isSandbox());
    }

    /** The status a broker sees, derived from the booking as it is in the reservations list now. */
    static String externalStatus(JsonNode res) {
        String st = res.path("status").asText("CONFIRMED");
        if ("CANCELLED".equals(st)) return "CANCELLED";
        if ("NO_SHOW".equals(st)) return "NO_SHOW";
        if (res.path("dropOffCompleted").asBoolean(false)) return "COMPLETED";
        if (res.path("voucherSubmitted").asBoolean(false)) return "IN_PROGRESS";
        if ("PENDING".equals(st) || res.path("awaitingConfirmation").asBoolean(false)) return "PENDING";
        return "CONFIRMED";
    }

    private static Customer customerOf(JsonNode res) {
        String name = res.path("personName").asText("");
        int sp = name.indexOf(' ');
        return new Customer(null, sp < 0 ? "" : name.substring(0, sp), sp < 0 ? name : name.substring(sp + 1),
            res.path("customerEmail").asText(""), res.path("contactNumber").asText(""), res.path("driver").path("nationality").asText(""));
    }

    private static Driver driverOf(JsonNode res) {
        JsonNode d = res.path("driver");
        String name = res.path("driverName").asText(res.path("personName").asText(""));
        int sp = name.indexOf(' ');
        return new Driver(sp < 0 ? "" : name.substring(0, sp), sp < 0 ? name : name.substring(sp + 1), d.path("dateOfBirth").asText(""),
            d.path("licenseNumber").asText(""), d.path("licenseCountry").asText(""));
    }

    private static Offer withId(Offer o, String id, Instant expires, boolean held) {
        return new Offer(id, o.vehicleGroup(), o.groupName(), o.modelExample(), o.category(), o.transmission(), o.airCon(), o.status(),
            o.available(), o.closedReason(), o.rentalDays(), o.currency(), o.baseAmount(), o.extrasAmount(), o.feesAmount(), o.taxAmount(),
            o.taxIncluded(), o.totalAmount(), o.breakdown(), o.depositAmount(), o.excessAmount(), o.cancellationPolicy(), o.paymentType(), expires, held);
    }

    private static Offer withFee(Offer o, PriceLine fee) {
        List<PriceLine> lines = new ArrayList<>(o.breakdown());
        lines.add(fee);
        return new Offer(o.offerId(), o.vehicleGroup(), o.groupName(), o.modelExample(), o.category(), o.transmission(), o.airCon(), o.status(),
            o.available(), o.closedReason(), o.rentalDays(), o.currency(), o.baseAmount(), o.extrasAmount(), o.feesAmount().add(fee.amount()),
            o.taxAmount(), o.taxIncluded(), o.totalAmount().add(fee.amount()), lines, o.depositAmount(), o.excessAmount(),
            o.cancellationPolicy(), o.paymentType(), o.expiresAt(), o.held());
    }

    // =========================================================== helpers

    private String nextNumber(LocalDateTime pickup) {
        Long max = bookings.maxId();
        return "RSV-" + Year.now().getValue() + "-" + String.format("%06d", (max == null ? 0 : max) + 1);
    }

    private String sourceName(Ctx c) {
        for (JsonNode s : c.state().path("sources")) {
            String n = s.path("name").asText("");
            if (n.equalsIgnoreCase(c.channel().name()) || n.equalsIgnoreCase(c.channel().channelCode())) return n;
        }
        return c.channel().name();
    }

    private static String groupName(String sipp, JsonNode car) {
        String cat = car == null ? "" : car.path("category").asText("");
        if (!cat.isBlank()) return cat;
        return switch (sipp.isEmpty() ? ' ' : sipp.charAt(0)) {
            case 'M' -> "Mini"; case 'E' -> "Economy"; case 'C' -> "Compact"; case 'I' -> "Intermediate"; case 'S' -> "Standard";
            case 'F' -> "Full size"; case 'P' -> "Premium"; case 'L' -> "Luxury"; case 'X' -> "Special"; default -> sipp;
        };
    }

    static List<JsonNode> allReservations(JsonNode state) {
        List<JsonNode> out = new ArrayList<>();
        JsonNode years = state.path("reservations");
        years.fields().forEachRemaining(y -> y.getValue().fields().forEachRemaining(m -> { if (m.getValue().isArray()) m.getValue().forEach(out::add); }));
        return out;
    }

    static LocalDateTime parseLocal(String s) {
        if (s == null || s.length() < 10) return null;
        try {
            if (s.length() >= 16) return LocalDateTime.parse(s.substring(0, 16).replace(' ', 'T'));
            return LocalDate.parse(s.substring(0, 10)).atTime(12, 0);
        } catch (Exception e) {
            return null;
        }
    }

    private JsonNode readState() {
        try { return JSON.readTree(stateService.getFullState()); } catch (Exception e) { throw ChannelError.SYSTEM_ERROR.ex(null); }
    }

    private void audit(Ctx c, String action, String summary, ChannelBooking b) {
        activity.record("api:" + c.code().toLowerCase(Locale.ROOT), action, "reservation", (c.sandbox() ? "[Sandbox] " : "") + summary,
            b.getBrokerReference() != null ? b.getBrokerReference() : b.getReservationNumber(), "Channel " + c.channel().name() + " · " + b.getReservationNumber());
    }

    private static String canonical(BookingRequest r) {
        Search s = r.search();
        Customer cu = r.customer();
        Driver d = r.driver();
        return String.join("|", trim(r.offerId()), trim(r.brokerReference()),
            s == null ? "" : s.pickupLocation() + "," + s.returnLocation() + "," + s.pickupAt() + "," + s.returnAt() + "," + s.vehicleGroup() + "," + s.extras(),
            cu == null ? "" : trim(cu.firstName()) + "," + trim(cu.lastName()) + "," + trim(cu.email()) + "," + trim(cu.phone()),
            d == null ? "" : trim(d.dateOfBirth()) + "," + trim(d.licenceNumber()),
            r.expectedTotal() == null ? "" : r.expectedTotal().stripTrailingZeros().toPlainString());
    }

    static String sha256(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    static String write(Object o) {
        try { return JSON.writeValueAsString(o); } catch (Exception e) { throw new IllegalStateException(e); }
    }

    private static BigDecimal money(double v) { return BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP); }
    private static String trim(String s) { return s == null ? "" : s.trim(); }
    private static String pick(String a, String b) { return a == null || a.isBlank() ? b : a; }
}
