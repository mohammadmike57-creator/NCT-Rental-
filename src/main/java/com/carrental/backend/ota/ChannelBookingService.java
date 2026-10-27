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
        return c.rules().locations().stream().map(l -> {
            List<OpeningHours> hours = new ArrayList<>();
            l.hours().forEach((d, h) -> hours.add(new OpeningHours(d.name().substring(0, 3), h.open().toString(), h.close().toString())));
            return new Location(l.code(), l.name(), l.address(), l.pickup(), l.dropOff(), l.type(), l.phone(), l.latitude(), l.longitude(),
                hours, l.afterHoursPickup(), l.afterHoursReturn(), l.afterHoursFee());
        }).toList();
    }

    public List<Coverage> coverages(Ctx c) {
        return c.rules().pricing().coverages().stream()
            .map(v -> new Coverage(v.code(), v.name(), v.included(), v.dailyPrice(), v.excess(), v.deposit())).toList();
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
                    money(car == null ? 0 : car.path("securityDeposit").asDouble(0)), money(car == null ? 0 : car.path("excess").asDouble(0)),
                    vehicleInfo(c, code, cars)));
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

    /** Rate rules for an offer (or an itinerary + group): the full terms before booking. */
    public RateRule rateRule(Ctx c, String offerId, Search search) {
        Offer o;
        Search s;
        if (offerId != null && !offerId.isBlank()) {
            ChannelOffer stored = offerFor(c, offerId);
            s = searchOf(stored);
            o = withId(single(c, s, stored.getSippCode(), stored.getId(), null), stored.getId(), stored.getExpiresAt(), stored.getStatus() == ChannelOffer.Status.HELD);
        } else {
            if (search == null || search.vehicleGroup() == null || search.vehicleGroup().isBlank()) {
                throw ChannelError.INVALID_REQUEST.ex("Send an offer id, or the rental dates, locations and vehicle group");
            }
            s = search;
            validate(c, s);
            Offer fresh = single(c, s, s.vehicleGroup(), null, null);
            o = "Available".equals(fresh.status()) ? persistOffer(c, s, fresh) : fresh;
        }
        BigDecimal fx = o.exchangeRate() == null ? BigDecimal.ONE : o.exchangeRate();
        List<Extra> extras = extras(c).stream().map(e -> new Extra(e.code(), e.name(), cv(e.dailyPrice(), fx), cv(e.maxPerRental(), fx))).toList();
        return new RateRule(s, o, extras, location(c, s.pickupLocation()), location(c, s.returnLocation()),
            c.rules().minDriverAge(), c.rules().maxDriverAge(), c.rules().minLeadHours(), c.rules().maxRentalDays(),
            cv(c.rules().modificationFee(), fx), c.channel().terms());
    }

    public Location location(Ctx c, String code) {
        ChannelRules.Location l = c.rules().location(code);
        if (l == null) throw ChannelError.INVALID_LOCATION.ex("Unknown location " + code);
        return locations(c).stream().filter(x -> x.code().equalsIgnoreCase(l.code())).findFirst().orElseThrow();
    }

    /** This broker's bookings with pick-up in [from, to], newest pick-up last; for reconciliation. */
    public ReservationPage list(Ctx c, LocalDate from, LocalDate to, String status, int page, int size) {
        if (from == null || to == null) throw ChannelError.INVALID_REQUEST.ex("From and To dates are required");
        if (to.isBefore(from)) throw ChannelError.INVALID_DATE.ex("To must not be before From");
        if (ChronoUnit.DAYS.between(from, to) > 366) throw ChannelError.INVALID_DATE.ex("At most one year per request");
        int sz = Math.max(1, Math.min(size, 200)), pg = Math.max(1, page);
        Map<String, JsonNode> byId = new HashMap<>();
        for (JsonNode r : allReservations(c.state())) byId.put(r.path("id").asText(), r);
        List<Reservation> all = new ArrayList<>();
        for (ChannelBooking b : bookings.findByChannelIdAndSandboxAndPickupAtBetweenOrderByPickupAtAsc(c.channel().id(), c.sandbox(),
                from.atStartOfDay(), to.atTime(23, 59, 59))) {
            JsonNode res = b.isSandbox() ? load(c, b) : byId.get(b.getStateReservationId());
            if (res == null) res = load(c, b);
            Reservation v = view(c, b, res);
            if (status == null || status.isBlank() || status.equalsIgnoreCase(v.status())) all.add(v);
        }
        int fromIdx = Math.min(all.size(), (pg - 1) * sz);
        return new ReservationPage(pg, sz, all.size(), all.subList(fromIdx, Math.min(all.size(), fromIdx + sz)));
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
            s = withDriverAge(s, req.driver());
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
            b.setExchangeRate(fresh.exchangeRate());
            b.setCustomerName(req.customer().fullName());
            b.setPromoCode(fresh.promoCode());
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
                in != null && in.extras() != null ? in.extras() : cur.extras(),
                in != null && in.coverages() != null ? in.coverages() : cur.coverages(),
                in != null && in.promoCode() != null ? emptyNull(in.promoCode()) : cur.promoCode(), cur.currency());
            Customer customer = req.customer() != null ? req.customer() : customerOf(res);
            Driver driver = req.driver() != null ? req.driver() : driverOf(res);
            if (in == null || in.driverAge() == null) s = withDriverAge(s, req.driver());
            validate(c, s);
            validateCustomer(customer);
            validateDriver(c, driver, s.pickupAt());

            Offer fresh = single(c, s, s.vehicleGroup(), "", b.getStateReservationId());
            if (!"Available".equals(fresh.status())) throw ChannelError.NO_AVAILABILITY.ex(fresh.closedReason());
            BigDecimal fee = c.rules().modificationFee();
            if (fee.signum() > 0) {
                BigDecimal f = fee.multiply(fresh.exchangeRate()).setScale(2, RoundingMode.HALF_UP);
                fresh = withFee(fresh, new PriceLine("FEE", "MODIFY", "Modification fee", f, 1, f));
            }
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
            b.setPromoCode(fresh.promoCode());
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
            // The schedule agreed when the booking was made applies, even if the channel's rules changed since.
            List<Penalty> agreed = readPenalties(res.path("channelPrice").get("penalties"));
            BigDecimal pct = agreed != null ? percentAt(agreed, LocalDateTime.now()) : c.rules().cancellationPercent(hoursBefore);
            BigDecimal fee = total.multiply(pct).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
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
            b.setFeeAmount(fee);
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

    /**
     * Automatic no-shows: live bookings still not picked up this many hours after pick-up time are
     * marked NO_SHOW, with the agreed no-show fee, and the broker is told. Off when noShowAfterHours is 0.
     */
    public int markNoShows(Ctx c) {
        int hours = c.rules().noShowAfterHours();
        if (hours <= 0 || c.sandbox()) return 0;
        int marked = 0;
        for (ChannelBooking b : bookings.findByChannelIdAndSandboxFalseAndStatusInAndPickupAtBefore(c.channel().id(),
                List.of("CONFIRMED", "PENDING"), LocalDateTime.now().minusHours(hours))) {
            bookingLock.lock();
            try {
                ObjectNode res = load(c, b);
                String status = externalStatus(res);
                if (!"CONFIRMED".equals(status) && !"PENDING".equals(status)) {
                    b.setStatus(status);           // picked up or cancelled in the app meanwhile
                    bookings.save(b);
                    continue;
                }
                BigDecimal total = b.getTotal() == null ? BigDecimal.ZERO : b.getTotal();
                BigDecimal fee = total.multiply(c.rules().noShowFeePercent()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
                res.put("status", "NO_SHOW");
                res.put("noShowAt", Instant.now().toString());
                res.put("noShowFee", toBase(fee, b.getExchangeRate()));
                res.put("cancellationFee", fee);
                res.put("refundAmount", c.rules().prepaid() ? total.subtract(fee).max(BigDecimal.ZERO) : BigDecimal.ZERO);
                res.put("refundStatus", c.rules().prepaid() && total.compareTo(fee) > 0 ? "PENDING" : "NOT_APPLICABLE");
                res.put("updatedAt", Instant.now().toString());
                res.put("lastEditedBy", "Booking API (" + c.code() + ")");
                store(c, b, res);
                b.setStatus("NO_SHOW");
                b.setFeeAmount(fee);
                b.setUpdatedAt(Instant.now());
                bookings.save(b);
                audit(c, "CHANNEL_BOOKING_NO_SHOW", "Booking " + b.getReservationNumber() + " marked no-show " + hours
                    + "h after pick-up time — fee " + fee + " " + b.getCurrency(), b);
                webhooks.emit(c, "reservation.no_show", view(c, b, res));
                marked++;
            } catch (RuntimeException e) {
                // one bad booking must not stop the others
            } finally {
                bookingLock.unlock();
            }
        }
        return marked;
    }

    /** Free cars per group per day (10:00 to 10:00 next day) for the next `days` days, as sent in inventory.updated. */
    public ObjectNode inventory(Ctx c, int days) {
        ObjectNode out = JSON.createObjectNode();
        out.put("channel_code", c.code()).put("currency", c.channel().currency());
        LocalDate start = LocalDate.now();
        out.put("from", start.toString()).put("to", start.plusDays(days - 1).toString());
        ArrayNode groups = out.putArray("groups");
        for (VehicleGroup g : vehicleGroups(c)) {
            ObjectNode gn = groups.addObject();
            gn.put("vehicle_group", g.code()).put("name", g.name()).put("fleet_size", g.fleetSize());
            ArrayNode daysArr = gn.putArray("days");
            for (int i = 0; i < days; i++) {
                LocalDate d = start.plusDays(i);
                Avail a = check(c, g.code(), d.atTime(10, 0), d.plusDays(1).atTime(10, 0), null, null);
                ObjectNode dn = daysArr.addObject().put("date", d.toString()).put("available", a.count());
                dn.put("status", a.count() > 0 ? "OPEN" : "CLOSED");
                if (a.reason() != null) dn.put("reason", a.reason());
            }
        }
        return out;
    }

    /** One month of this broker's live bookings by pick-up date, with commission and fees, for settlement. */
    public ObjectNode statement(ChannelSnapshot ch, YearMonth month) {
        BigDecimal pct = BigDecimal.valueOf(ch.raw().path("commissionPercent").asDouble(0)).setScale(2, RoundingMode.HALF_UP);
        ObjectNode out = JSON.createObjectNode();
        out.put("channel", ch.name()).put("month", month.toString()).put("currency", ch.currency()).put("commissionPercent", pct);
        ArrayNode rows = out.putArray("rows");
        BigDecimal gross = BigDecimal.ZERO, commission = BigDecimal.ZERO, fees = BigDecimal.ZERO;
        int counted = 0, cancelled = 0, noShows = 0;
        for (ChannelBooking b : bookings.findByChannelIdAndSandboxAndPickupAtBetweenOrderByPickupAtAsc(ch.id(), false,
                month.atDay(1).atStartOfDay(), month.atEndOfMonth().atTime(23, 59, 59))) {
            String st = b.getStatus() == null ? "" : b.getStatus();
            boolean lost = "CANCELLED".equals(st) || "NO_SHOW".equals(st);
            // Settlement is in the channel currency; bookings sold in another currency are converted back at their booking rate.
            BigDecimal soldTotal = b.getTotal() == null ? BigDecimal.ZERO : b.getTotal();
            BigDecimal total = toBase(soldTotal, b.getExchangeRate());
            BigDecimal fee = toBase(b.getFeeAmount() == null ? BigDecimal.ZERO : b.getFeeAmount(), b.getExchangeRate());
            BigDecimal base = lost ? fee : total;          // commission on what was actually earned
            BigDecimal com = base.multiply(pct).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            ObjectNode r = rows.addObject();
            r.put("reservationNumber", b.getReservationNumber()).put("brokerReference", b.getBrokerReference())
             .put("customerName", b.getCustomerName()).put("vehicleGroup", b.getSippCode())
             .put("pickupAt", b.getPickupAt().toString()).put("returnAt", b.getReturnAt().toString()).put("status", st)
             .put("soldCurrency", b.getCurrency()).put("soldTotal", soldTotal)
             .put("total", total).put("fee", fee).put("commissionable", base).put("commission", com).put("net", base.subtract(com))
             .put("promoCode", b.getPromoCode());
            if ("CANCELLED".equals(st)) cancelled++;
            else if ("NO_SHOW".equals(st)) noShows++;
            else counted++;
            if (lost) fees = fees.add(fee);
            gross = gross.add(base);
            commission = commission.add(com);
        }
        out.put("bookings", counted).put("cancelled", cancelled).put("noShows", noShows)
           .put("gross", gross).put("fees", fees).put("commission", commission).put("net", gross.subtract(commission));
        return out;
    }

    // =========================================================== pricing

    /**
     * Prices every published group for the itinerary, in this order: base rate, promotion discount,
     * extras, optional covers, fees (one-way, after-hours, young / senior driver), then tax.
     */
    private List<Offer> price(Ctx c, Search s, String excludeOffer, String excludeReservation) {
        ChannelRules rules = c.rules();
        ChannelRules.Pricing pr = rules.pricing();
        BigDecimal rate = rateFor(c, s.currency());
        String sell = rate == null ? c.channel().currency() : s.currency().trim().toUpperCase(Locale.ROOT);
        List<String> codes = new ArrayList<>();
        for (ExtraRequest e : s.extras()) codes.add(e.code());
        List<OtaXml.QuoteLine> lines = OtaXml.quote(c.channel(), new OtaXml.QuoteRequest(s.pickupAt(), s.returnAt(), codes));
        if (lines.isEmpty()) throw ChannelError.NO_AVAILABILITY.ex("No rates are published for " + s.pickupAt().toLocalDate());
        Map<String, OtaXml.Extra> extraByCode = new HashMap<>();
        for (OtaXml.Extra e : OtaXml.extras(c.channel())) { extraByCode.put(e.code().toUpperCase(Locale.ROOT), e); extraByCode.put(e.id().toUpperCase(Locale.ROOT), e); }
        for (ExtraRequest e : s.extras()) {
            if (!extraByCode.containsKey(e.code().toUpperCase(Locale.ROOT))) throw ChannelError.INVALID_REQUEST.ex("Unknown extra " + e.code());
        }
        Set<String> chosenCovers = new LinkedHashSet<>();
        for (String code : s.coverageCodes()) {
            ChannelRules.Coverage cv = rules.coverage(code);
            if (cv == null) throw ChannelError.INVALID_REQUEST.ex("Unknown coverage " + code);
            if (!cv.included()) chosenCovers.add(cv.code());
        }
        ChannelRules.Promotion promo = promotion(c, s);
        ChannelRules.Location pl = rules.location(s.pickupLocation()), rl = rules.location(s.returnLocation());
        boolean oneWay = !s.pickupLocation().equalsIgnoreCase(s.returnLocation());
        boolean afterPick = pl != null && !pl.openAt(s.pickupAt());
        boolean afterReturn = rl != null && !rl.openAt(s.returnAt());

        List<Offer> out = new ArrayList<>();
        for (OtaXml.QuoteLine l : lines) {
            if (!rules.groupAllowed(l.sippCode())) continue;
            int days = l.days();
            List<PriceLine> breakdown = new ArrayList<>();
            breakdown.add(new PriceLine("BASE", l.sippCode(), days + " day" + (days == 1 ? "" : "s") + " × " + l.dailyRate(), l.dailyRate(), days, l.baseTotal()));
            BigDecimal base = l.baseTotal();
            String appliedPromo = null;
            if (promo != null && promo.appliesTo(l.sippCode(), s.pickupAt().toLocalDate()) && promo.percentOff().signum() > 0) {
                BigDecimal off = base.multiply(promo.percentOff()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
                breakdown.add(new PriceLine("DISCOUNT", promo.code(), "Promotion " + promo.code() + " (" + promo.percentOff().stripTrailingZeros().toPlainString() + "% off)",
                    off.negate(), 1, off.negate()));
                base = base.subtract(off);
                appliedPromo = promo.code();
            }
            BigDecimal extrasAmount = BigDecimal.ZERO;
            for (ExtraRequest r : s.extras()) {
                OtaXml.Extra e = extraByCode.get(r.code().toUpperCase(Locale.ROOT));
                int qty = Math.max(1, Math.min(r.quantity(), 9));
                BigDecimal one = e.dailyPrice().multiply(BigDecimal.valueOf(days));
                if (e.maxPerRental() != null && one.compareTo(e.maxPerRental()) > 0) one = e.maxPerRental();
                BigDecimal amount = one.multiply(BigDecimal.valueOf(qty)).setScale(2, RoundingMode.HALF_UP);
                breakdown.add(new PriceLine("EXTRA", e.code(), e.name(), one.setScale(2, RoundingMode.HALF_UP), qty, amount));
                extrasAmount = extrasAmount.add(amount);
            }
            List<JsonNode> cars = OtaXml.vehiclesForSipp(c.channel().fleet(), l.sippCode());
            JsonNode car = cars.isEmpty() ? null : cars.get(0);
            BigDecimal deposit = money(car == null ? 0 : car.path("securityDeposit").asDouble(0));
            BigDecimal excess = money(car == null ? 0 : car.path("excess").asDouble(0));
            List<CoverageOffer> covers = new ArrayList<>();
            for (ChannelRules.Coverage cv : pr.coverages()) {
                boolean selected = cv.included() || chosenCovers.contains(cv.code());
                BigDecimal amount = BigDecimal.ZERO.setScale(2);
                if (!cv.included() && selected) {
                    amount = cv.dailyPrice().multiply(BigDecimal.valueOf(days)).setScale(2, RoundingMode.HALF_UP);
                    breakdown.add(new PriceLine("COVERAGE", cv.code(), cv.name(), cv.dailyPrice(), days, amount));
                    extrasAmount = extrasAmount.add(amount);
                }
                if (selected && cv.excess() != null && cv.excess().compareTo(excess) < 0) excess = cv.excess();
                if (selected && cv.deposit() != null && cv.deposit().compareTo(deposit) < 0) deposit = cv.deposit();
                covers.add(new CoverageOffer(cv.code(), cv.name(), cv.included(), selected, cv.dailyPrice(), amount,
                    cv.excess() == null ? excess : cv.excess(), cv.deposit() == null ? deposit : cv.deposit()));
            }
            BigDecimal fees = BigDecimal.ZERO;
            if (oneWay && rules.oneWayFee().signum() > 0) fees = fees.add(fee(breakdown, "ONE_WAY", "One-way fee", rules.oneWayFee(), 1));
            if (afterPick && pl.afterHoursFee().signum() > 0) fees = fees.add(fee(breakdown, "AFTER_HOURS", "After-hours pick-up", pl.afterHoursFee(), 1));
            if (afterReturn && rl.afterHoursFee().signum() > 0) fees = fees.add(fee(breakdown, "AFTER_HOURS", "After-hours return", rl.afterHoursFee(), 1));
            Integer age = s.driverAge();
            if (age != null && pr.youngDriverUnder() > 0 && age < pr.youngDriverUnder() && pr.youngDriverFee().signum() > 0) {
                fees = fees.add(fee(breakdown, "YOUNG_DRIVER", "Young driver (under " + pr.youngDriverUnder() + ")", pr.youngDriverFee(), days));
            }
            if (age != null && pr.seniorDriverFrom() > 0 && age >= pr.seniorDriverFrom() && pr.seniorDriverFee().signum() > 0) {
                fees = fees.add(fee(breakdown, "SENIOR_DRIVER", "Senior driver (" + pr.seniorDriverFrom() + "+)", pr.seniorDriverFee(), days));
            }
            String status = l.status();
            String reason = l.closedReason();
            int available = 0;
            if (!"Closed".equals(status)) {
                Avail av = check(c, l.sippCode(), s.pickupAt(), s.returnAt(), excludeOffer, excludeReservation);
                available = av.count();
                if (available <= 0) { status = "Closed"; reason = av.reason() != null ? av.reason() : "Sold out for these dates"; }
                else status = "Available";
            }
            BigDecimal net = base.add(extrasAmount).add(fees).setScale(2, RoundingMode.HALF_UP);
            BigDecimal tax, total;
            if (pr.taxPercent().signum() == 0) { tax = BigDecimal.ZERO.setScale(2); total = net; }
            else if (pr.taxIncluded()) { tax = net.multiply(pr.taxPercent()).divide(pr.taxPercent().add(BigDecimal.valueOf(100)), 2, RoundingMode.HALF_UP); total = net; }
            else {
                tax = net.multiply(pr.taxPercent()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
                breakdown.add(new PriceLine("TAX", pr.taxName(), pr.taxName() + " " + pr.taxPercent().stripTrailingZeros().toPlainString() + "%", tax, 1, tax));
                total = net.add(tax);
            }
            Mileage mileage = new Mileage(pr.unlimitedMileage(), pr.unlimitedMileage() ? 0 : pr.kmPerDay(),
                pr.unlimitedMileage() ? 0 : pr.kmPerDay() * days, pr.unlimitedMileage() ? null : pr.extraKmPrice());
            Offer o = new Offer(null, l.sippCode(), groupName(l.sippCode(), car), l.model() + " or similar",
                car == null ? "" : car.path("category").asText(""), l.transmission(), l.airCon(), status, available, reason,
                days, c.channel().currency(), base, extrasAmount, fees, tax, pr.taxIncluded() || pr.taxPercent().signum() == 0, total, breakdown,
                deposit, excess, rules.cancellationPolicyCode(), rules.paymentModel(), null, false,
                vehicleInfo(c, l.sippCode(), cars), mileage, covers, appliedPromo, pr.taxName(), pr.taxPercent(),
                penalties(rules, s.pickupAt(), total), c.channel().currency(), BigDecimal.ONE);
            out.add(rate == null ? o : convert(o, sell, rate));
        }
        return out;
    }

    /** The cancellation schedule for a booking of this total: one step per tier that costs something. */
    static List<Penalty> penalties(ChannelRules rules, LocalDateTime pickup, BigDecimal total) {
        List<Penalty> out = new ArrayList<>();
        List<ChannelRules.CancelTier> tiers = new ArrayList<>(rules.cancellationTiers());
        tiers.sort(Comparator.comparingInt(ChannelRules.CancelTier::hoursBefore).reversed());
        BigDecimal last = BigDecimal.ZERO;
        for (ChannelRules.CancelTier t : tiers) {
            if (t.feePercent().compareTo(last) <= 0) continue;    // a later step never lowers the fee
            out.add(new Penalty(pickup.minusHours(t.hoursBefore()), t.hoursBefore(), t.feePercent(),
                total.multiply(t.feePercent()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP)));
            last = t.feePercent();
        }
        return out;
    }

    /** The fee percent that applies now under an agreed schedule. */
    static BigDecimal percentAt(List<Penalty> schedule, LocalDateTime now) {
        BigDecimal pct = BigDecimal.ZERO;
        for (Penalty p : schedule) if (!now.isBefore(p.from()) && p.percent().compareTo(pct) > 0) pct = p.percent();
        return pct;
    }

    /** The sell currency the broker asked for (null = the channel currency) and its rate. */
    private static BigDecimal rateFor(Ctx c, String currency) {
        if (currency == null || currency.isBlank() || currency.trim().equalsIgnoreCase(c.channel().currency())) return null;
        BigDecimal r = c.rules().currencies().get(currency.trim().toUpperCase(Locale.ROOT));
        if (r == null) {
            throw ChannelError.INVALID_REQUEST.ex("Currency " + currency.trim().toUpperCase(Locale.ROOT) + " is not offered on this channel"
                + (c.rules().currencies().isEmpty() ? "" : " (offered: " + c.channel().currency() + ", " + String.join(", ", c.rules().currencies().keySet()) + ")"));
        }
        return r;
    }

    private static BigDecimal cv(BigDecimal v, BigDecimal rate) {
        return v == null ? null : v.multiply(rate).setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * The same offer in the broker's currency. Every line is converted and the total is the sum of the
     * converted parts, so the breakdown always adds up exactly.
     */
    static Offer convert(Offer o, String cur, BigDecimal rate) {
        List<PriceLine> lines = new ArrayList<>();
        for (PriceLine l : o.breakdown()) lines.add(new PriceLine(l.type(), l.code(), l.description(), cv(l.unitAmount(), rate), l.quantity(), cv(l.amount(), rate)));
        BigDecimal base = BigDecimal.ZERO.setScale(2), extras = base, fees = base, taxLine = base;
        for (PriceLine l : lines) switch (l.type()) {
            case "BASE", "DISCOUNT" -> base = base.add(l.amount());
            case "EXTRA", "COVERAGE" -> extras = extras.add(l.amount());
            case "TAX" -> taxLine = taxLine.add(l.amount());
            default -> fees = fees.add(l.amount());
        }
        BigDecimal tax = o.taxIncluded() ? cv(o.taxAmount(), rate) : taxLine;
        BigDecimal total = base.add(extras).add(fees).add(o.taxIncluded() ? BigDecimal.ZERO : taxLine);
        List<CoverageOffer> covers = new ArrayList<>();
        for (CoverageOffer c : o.coverages()) covers.add(new CoverageOffer(c.code(), c.name(), c.included(), c.selected(), cv(c.dailyPrice(), rate),
            cv(c.amount(), rate), cv(c.excess(), rate), cv(c.deposit(), rate)));
        Mileage m = o.mileage() == null ? null : new Mileage(o.mileage().unlimited(), o.mileage().kmPerDay(), o.mileage().kmIncluded(), cv(o.mileage().extraKmPrice(), rate));
        List<Penalty> pen = new ArrayList<>();
        for (Penalty p : o.penalties()) pen.add(new Penalty(p.from(), p.hoursBefore(), p.percent(),
            total.multiply(p.percent()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP)));
        return new Offer(o.offerId(), o.vehicleGroup(), o.groupName(), o.modelExample(), o.category(), o.transmission(), o.airCon(), o.status(),
            o.available(), o.closedReason(), o.rentalDays(), cur, base, extras, fees, tax, o.taxIncluded(), total, lines,
            cv(o.depositAmount(), rate), cv(o.excessAmount(), rate), o.cancellationPolicy(), o.paymentType(), o.expiresAt(), o.held(),
            o.vehicle(), m, covers, o.promoCode(), o.taxName(), o.taxPercent(), pen, o.baseCurrency(), rate);
    }

    private static BigDecimal fee(List<PriceLine> lines, String code, String name, BigDecimal unit, int qty) {
        BigDecimal amount = unit.multiply(BigDecimal.valueOf(qty)).setScale(2, RoundingMode.HALF_UP);
        lines.add(new PriceLine("FEE", code, name, unit, qty, amount));
        return amount;
    }

    private ChannelRules.Promotion promotion(Ctx c, Search s) {
        String code = emptyNull(s.promoCode());
        if (code == null) return null;
        ChannelRules.Promotion p = c.rules().promotion(code);
        if (p == null) throw ChannelError.POLICY_VIOLATION.ex("Unknown promotion code " + code);
        LocalDate day = s.pickupAt().toLocalDate();
        if ((p.from() != null && day.isBefore(p.from())) || (p.to() != null && day.isAfter(p.to()))) {
            throw ChannelError.POLICY_VIOLATION.ex("Promotion " + p.code() + " is not valid for a pick-up on " + day);
        }
        return p;
    }

    /** Capacity, doors, bags, fuel and picture: the channel's group details first, else from the SIPP code and the fleet. */
    VehicleInfo vehicleInfo(Ctx c, String sipp, List<JsonNode> cars) {
        ChannelRules.GroupDetail d = c.rules().groupDetails().get(sipp.toUpperCase(Locale.ROOT));
        Sipp.Spec def = Sipp.spec(sipp);
        String picture = d != null && d.pictureUrl() != null ? d.pictureUrl() : null;
        if (picture == null) for (JsonNode car : cars) {
            String u = car.path("imageUrl").asText("");
            if (!u.isBlank() && !u.startsWith("data:")) { picture = u; break; }
        }
        return new VehicleInfo(
            d != null && d.seats() != null ? d.seats() : def.seats(), d != null && d.doors() != null ? d.doors() : def.doors(),
            d != null && d.largeBags() != null ? d.largeBags() : def.largeBags(), d != null && d.smallBags() != null ? d.smallBags() : def.smallBags(),
            d != null && d.fuel() != null ? d.fuel() : def.fuel(), absolute(picture), d == null ? null : d.description());
    }

    /** Fleet photos are stored as /api/media/<id>; brokers need the full address. */
    private static String absolute(String url) {
        if (url == null || url.isBlank() || url.startsWith("http")) return url;
        try {
            return org.springframework.web.servlet.support.ServletUriComponentsBuilder.fromCurrentContextPath().path(url).toUriString();
        } catch (IllegalStateException e) {
            return url;   // no request (background job): keep the path
        }
    }

    private Offer single(Ctx c, Search s, String sipp, String excludeOffer, String excludeReservation) {
        if (!c.rules().groupAllowed(sipp)) throw ChannelError.PERMISSION_DENIED.ex("Vehicle group " + sipp + " is not sold on this channel");
        for (Offer o : price(c, s, excludeOffer, excludeReservation)) if (o.vehicleGroup().equalsIgnoreCase(sipp)) return o;
        throw ChannelError.INVALID_VEHICLE_GROUP.ex("Vehicle group " + sipp + " has no published rate for these dates");
    }

    /** Free cars for the period and, when there are none, why. */
    record Avail(int count, String reason) {}

    int available(Ctx c, String sipp, LocalDateTime from, LocalDateTime to, String excludeOffer, String excludeReservation) {
        return check(c, sipp, from, to, excludeOffer, excludeReservation).count();
    }

    /**
     * Cars of a group free for the whole period: the group's cars that are not stop-sold or
     * out of registration, minus overlapping bookings and agreements, live holds and the
     * operational buffer kept back from this channel; then capped by the broker's allotment.
     */
    Avail check(Ctx c, String sipp, LocalDateTime from, LocalDateTime to, String excludeOffer, String excludeReservation) {
        LocalDate pickupDay = from.toLocalDate();
        List<ChannelRules.Allotment> allots = c.rules().allotmentsFor(sipp, pickupDay);
        for (ChannelRules.Allotment a : allots) if (a.stopSell()) return new Avail(0, "Stop sell for this channel");
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
        if (usable == 0) return new Avail(0, null);
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
        int free = (int) Math.max(0, usable - busy - holds - c.rules().operationalBuffer());
        long daysAhead = ChronoUnit.DAYS.between(LocalDate.now(), pickupDay);
        for (ChannelRules.Allotment a : allots) {
            if (daysAhead <= a.releaseDays()) continue;     // released: free sale
            long used = bookings.countOverlapping(c.channel().id(), c.sandbox(), sipp.toUpperCase(Locale.ROOT), from, to,
                excludeReservation == null ? "" : excludeReservation);
            int left = (int) Math.max(0, a.quantity() - used);
            if (left < free) {
                free = left;
                if (left == 0) return new Avail(0, "Allotment of " + a.quantity() + " used");
            }
        }
        return new Avail(free, null);
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
        if (!p.openAt(s.pickupAt()) && !p.afterHoursPickup()) {
            throw ChannelError.INVALID_DATE.ex(p.code() + " is closed at " + s.pickupAt().toLocalTime() + " on " + s.pickupAt().getDayOfWeek() + hoursText(p, s.pickupAt()));
        }
        if (!r.openAt(s.returnAt()) && !r.afterHoursReturn()) {
            throw ChannelError.INVALID_DATE.ex(r.code() + " is closed at " + s.returnAt().toLocalTime() + " on " + s.returnAt().getDayOfWeek() + hoursText(r, s.returnAt()));
        }
        if (s.driverAge() != null) checkAge(c, s.driverAge());
    }

    private static String hoursText(ChannelRules.Location l, LocalDateTime t) {
        ChannelRules.Hours h = l.hours().get(t.getDayOfWeek());
        return h == null ? " (closed all day)" : " (open " + h.open() + "-" + h.close() + ")";
    }

    /** The driver's age at pick-up from the date of birth, when the search did not give one. */
    private static Search withDriverAge(Search s, Driver d) {
        if (s.driverAge() != null || d == null || trim(d.dateOfBirth()).length() < 10) return s;
        try {
            return s.with(Period.between(LocalDate.parse(d.dateOfBirth().trim().substring(0, 10)), s.pickupAt().toLocalDate()).getYears());
        } catch (Exception e) {
            return s;   // validateDriver reports the bad date
        }
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
        // The reservations list keeps the channel's own currency; the broker's currency stays in channelPrice.
        BigDecimal fx = o.exchangeRate() == null || o.exchangeRate().signum() == 0 ? BigDecimal.ONE : o.exchangeRate();
        r.put("amount", toBase(o.totalAmount(), fx)).put("baseAmount", toBase(o.baseAmount().add(o.feesAmount()), fx));
        r.put("securityDeposit", toBase(o.depositAmount(), fx)).put("excess", toBase(o.excessAmount(), fx));
        ArrayNode extras = r.putArray("extras");
        for (PriceLine l : o.breakdown()) {
            if (!"EXTRA".equals(l.type()) && !"COVERAGE".equals(l.type())) continue;
            int days = Math.max(1, o.rentalDays());
            BigDecimal perDay = toBase(l.amount(), fx).divide(BigDecimal.valueOf(days), 2, RoundingMode.HALF_UP);
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
        ArrayNode cov = price.putArray("coveragesRequested");
        for (String code : s.coverageCodes()) cov.add(code.toUpperCase(Locale.ROOT));
        if (o.promoCode() != null) price.put("promoCode", o.promoCode());
        else if (emptyNull(s.promoCode()) != null) price.put("promoCodeRequested", s.promoCode().trim().toUpperCase(Locale.ROOT));
        price.put("taxName", o.taxName()).put("taxPercent", o.taxPercent());
        price.set("coverages", JSON.valueToTree(o.coverages()));
        price.set("mileage", JSON.valueToTree(o.mileage()));
        price.set("vehicle", JSON.valueToTree(o.vehicle()));
        price.set("penalties", JSON.valueToTree(o.penalties()));
        price.put("baseCurrency", o.baseCurrency() == null ? c.channel().currency() : o.baseCurrency()).put("exchangeRate", fx)
             .put("baseTotal", toBase(o.totalAmount(), fx));
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
        row.setCoverages(String.join(",", s.coverageCodes()));
        row.setPromoCode(emptyNull(s.promoCode()));
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
        List<String> covers = new ArrayList<>();
        if (o.getCoverages() != null) for (String cv : o.getCoverages().split(",")) if (!cv.isBlank()) covers.add(cv);
        return new Search(o.getPickupLocation(), o.getReturnLocation(), o.getPickupAt(), o.getReturnAt(), o.getDriverAge(), null, o.getSippCode(),
            extras, covers, o.getPromoCode(), o.getCurrency());
    }

    private static Search searchOf(JsonNode res, ChannelBooking b) {
        JsonNode p = res.path("channelPrice");
        List<ExtraRequest> extras = new ArrayList<>();
        for (JsonNode e : p.path("extrasRequested")) extras.add(new ExtraRequest(e.path("code").asText(), e.path("quantity").asInt(1)));
        List<String> covers = new ArrayList<>();
        for (JsonNode cv : p.path("coveragesRequested")) covers.add(cv.asText());
        String promo = p.path("promoCode").asText(p.path("promoCodeRequested").asText(""));
        return new Search(p.path("pickupLocation").asText(""), p.path("returnLocation").asText(""), b.getPickupAt(), b.getReturnAt(),
            p.has("driverAge") ? p.path("driverAge").asInt() : null, null, b.getSippCode(), extras, covers, promo.isEmpty() ? null : promo,
            b.getCurrency());
    }

    static BigDecimal toBase(BigDecimal v, BigDecimal rate) {
        if (v == null) return null;
        if (rate == null || rate.signum() == 0 || rate.compareTo(BigDecimal.ONE) == 0) return v.setScale(2, RoundingMode.HALF_UP);
        return v.divide(rate, 2, RoundingMode.HALF_UP);
    }

    private static List<Penalty> readPenalties(JsonNode n) {
        if (n == null || !n.isArray()) return null;
        List<Penalty> out = new ArrayList<>();
        for (JsonNode x : n) { Penalty p = read(x, Penalty.class); if (p != null) out.add(p); }
        return out;
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
            cancelled ? res.path("refundStatus").asText(null) : null, b.isSandbox(),
            p.has("tax") ? p.path("tax").decimalValue() : BigDecimal.ZERO.setScale(2), p.path("taxIncluded").asBoolean(true),
            read(p.get("mileage"), Mileage.class), readList(p.get("coverages")), read(p.get("vehicle"), VehicleInfo.class),
            p.path("promoCode").asText(null), readPenalties(p.get("penalties")));
    }

    private static <T> T read(JsonNode n, Class<T> type) {
        if (n == null || n.isNull()) return null;
        try { return JSON.treeToValue(n, type); } catch (Exception e) { return null; }
    }

    private static List<CoverageOffer> readList(JsonNode n) {
        List<CoverageOffer> out = new ArrayList<>();
        if (n != null) for (JsonNode x : n) { CoverageOffer v = read(x, CoverageOffer.class); if (v != null) out.add(v); }
        return out;
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
            o.taxIncluded(), o.totalAmount(), o.breakdown(), o.depositAmount(), o.excessAmount(), o.cancellationPolicy(), o.paymentType(), expires, held,
            o.vehicle(), o.mileage(), o.coverages(), o.promoCode(), o.taxName(), o.taxPercent(), o.penalties(), o.baseCurrency(), o.exchangeRate());
    }

    private static Offer withFee(Offer o, PriceLine fee) {
        List<PriceLine> lines = new ArrayList<>(o.breakdown());
        lines.add(fee);
        return new Offer(o.offerId(), o.vehicleGroup(), o.groupName(), o.modelExample(), o.category(), o.transmission(), o.airCon(), o.status(),
            o.available(), o.closedReason(), o.rentalDays(), o.currency(), o.baseAmount(), o.extrasAmount(), o.feesAmount().add(fee.amount()),
            o.taxAmount(), o.taxIncluded(), o.totalAmount().add(fee.amount()), lines, o.depositAmount(), o.excessAmount(),
            o.cancellationPolicy(), o.paymentType(), o.expiresAt(), o.held(), o.vehicle(), o.mileage(), o.coverages(), o.promoCode(), o.taxName(), o.taxPercent(),
            o.penalties().stream().map(p -> new Penalty(p.from(), p.hoursBefore(), p.percent(),
                o.totalAmount().add(fee.amount()).multiply(p.percent()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP))).toList(),
            o.baseCurrency(), o.exchangeRate());
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
            s == null ? "" : s.pickupLocation() + "," + s.returnLocation() + "," + s.pickupAt() + "," + s.returnAt() + "," + s.vehicleGroup() + "," + s.extras()
                + "," + s.coverageCodes() + "," + trim(s.promoCode()) + "," + s.driverAge(),
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
    private static String emptyNull(String s) { return s == null || s.isBlank() ? null : s.trim(); }
}
