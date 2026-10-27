package com.carrental.backend.ota;

import com.carrental.backend.ota.ChannelError.ChannelException;
import com.carrental.backend.ota.ChannelModels.*;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

/**
 * Broker certification suite: runs the standard certification cases against the channel's own
 * configuration in sandbox mode (nothing is booked for real and no webhooks are sent), so staff
 * can see before go-live that searching, quoting, booking, retrieving, amending and cancelling
 * all behave, including every error case a broker must handle.
 */
@Service
public class ChannelCertificationService {

    public record Result(String id, String name, boolean passed, String detail, long ms) {}
    public record Report(Instant ranAt, int passed, int total, List<Result> results) {}

    private final ChannelBookingService core;
    private final ChannelOfferRepository offers;

    public ChannelCertificationService(ChannelBookingService core, ChannelOfferRepository offers) {
        this.core = core;
        this.offers = offers;
    }

    public Report run(ChannelSnapshot ch) {
        ChannelBookingService.Ctx base = core.context(ch, true);
        ChannelRules r = base.rules();
        // Sandbox, no webhooks.
        ChannelBookingService.Ctx c = new ChannelBookingService.Ctx(ch, r.forCertification(r.operationalBuffer()), base.state(), true);
        List<Result> out = new ArrayList<>();
        String loc = r.locations().get(0).code();
        String stamp = String.valueOf(System.currentTimeMillis() % 1_000_000);

        step(out, "auth-ok", "Authentication succeeds with the issued key", () -> {
            if (ch.feedKeyHash().isBlank()) throw new AssertionError("No API key issued yet (Connection → Partner access)");
            return "Key issued";
        });
        step(out, "auth-fail", "Authentication fails with a wrong key", () -> {
            if (PartnerKeyVerifier.matches(ch, "wrong-key-" + stamp)) throw new AssertionError("A wrong key was accepted");
            return "AUTH_FAILED returned";
        });
        step(out, "locations", "Location list", () -> core.locations(c).size() + " location(s): " + String.join(", ", core.locations(c).stream().map(Location::code).toList()));
        step(out, "groups", "Vehicle group list", () -> {
            List<VehicleGroup> g = core.vehicleGroups(c);
            if (g.isEmpty()) throw new AssertionError("No vehicle groups: publish rates first (Rates tab)");
            return g.size() + " group(s): " + String.join(", ", g.stream().map(VehicleGroup::code).toList());
        });
        step(out, "vehicle-details", "Vehicle groups carry seats, doors, bags, fuel and a picture", () -> {
            List<VehicleGroup> g = core.vehicleGroups(c);
            if (g.isEmpty()) throw new AssertionError("No vehicle groups");
            long noPicture = g.stream().filter(v -> v.vehicle().pictureUrl() == null).count();
            VehicleInfo v = g.get(0).vehicle();
            String first = g.get(0).code() + ": " + v.seats() + " seats, " + v.doors() + " doors, " + v.largeBags() + "+" + v.smallBags() + " bags, " + v.fuel();
            if (noPicture > 0) throw new AssertionError(first + " — " + noPicture + " group(s) have no picture (add a fleet photo or a picture URL)");
            return first;
        });
        step(out, "location-details", "Locations carry phone, position and opening hours", () -> {
            List<String> missing = new ArrayList<>();
            for (Location l : core.locations(c)) {
                if (l.phone() == null || l.phone().isBlank()) missing.add(l.code() + " phone");
                if (l.latitude() == null || l.longitude() == null) missing.add(l.code() + " position");
                if (l.openingHours().isEmpty()) missing.add(l.code() + " hours");
            }
            if (!missing.isEmpty()) throw new AssertionError("Missing: " + String.join(", ", missing));
            return core.locations(c).size() + " location(s) complete";
        });

        LocalDateTime from = firstSellableDate(c);
        Search search = new Search(loc, loc, from, from.plusDays(3), 30, null, null, List.of());
        Offer[] offer = new Offer[1];
        step(out, "search", "Availability search returns priced offers", () -> {
            List<Offer> list = core.search(c, search);
            offer[0] = list.stream().filter(o -> "Available".equals(o.status())).findFirst()
                .orElseThrow(() -> new AssertionError("No group available on " + from.toLocalDate() + " (check fleet SIPP codes, stop sales and rates)"));
            return list.size() + " offer(s); " + offer[0].vehicleGroup() + " " + offer[0].totalAmount() + " " + offer[0].currency() + " for " + offer[0].rentalDays() + " days";
        });
        step(out, "no-availability", "Sold-out case shows no available cars", () -> {
            ChannelBookingService.Ctx full = new ChannelBookingService.Ctx(ch, c.rules().forCertification(100000), c.state(), true);
            boolean any = core.search(full, search).stream().anyMatch(o -> "Available".equals(o.status()));
            if (any) throw new AssertionError("A sold-out group was still offered");
            return "All groups Closed when no car is free";
        });
        step(out, "rate-rule", "Rate rules return the full terms of an offer", () -> {
            if (offer[0] == null) throw new AssertionError("No offer to check");
            RateRule rr = core.rateRule(c, offer[0].offerId(), null);
            return rr.extras().size() + " extra(s), " + rr.offer().coverages().size() + " cover(s), policy " + rr.offer().cancellationPolicy()
                + ", age " + rr.minDriverAge() + (rr.maxDriverAge() > 0 ? "–" + rr.maxDriverAge() : "+") + (rr.terms() == null || rr.terms().isBlank() ? ", no terms text" : ", terms included");
        });
        step(out, "location-detail", "Location detail for one station", () -> {
            Location l = core.location(c, loc);
            return l.code() + " " + l.name() + " (" + l.type() + ")";
        });
        String foreign = r.currencies().keySet().stream().findFirst().orElse(null);
        if (foreign != null && offer[0] != null) step(out, "currency", "Prices in the broker's currency", () -> {
            Offer o = core.search(c, new Search(loc, loc, from, from.plusDays(3), 30, null, offer[0].vehicleGroup(), List.of(), null, null, foreign)).get(0);
            if (!foreign.equals(o.currency())) throw new AssertionError("Answered in " + o.currency());
            BigDecimal sum = o.breakdown().stream().map(PriceLine::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
            if (o.taxIncluded() && sum.compareTo(o.totalAmount()) != 0) throw new AssertionError("Breakdown " + sum + " ≠ total " + o.totalAmount());
            return offer[0].totalAmount() + " " + offer[0].currency() + " = " + o.totalAmount() + " " + foreign + " (rate " + o.exchangeRate().stripTrailingZeros().toPlainString() + ")";
        });
        step(out, "invalid-currency", "An unsupported currency is refused", () -> {
            expect(ChannelError.INVALID_REQUEST, () -> core.search(c, new Search(loc, loc, from, from.plusDays(3), 30, null, null, List.of(), null, null, "XXX")));
            return "INVALID_REQUEST returned";
        });
        step(out, "pricing", "Offers show tax, mileage and insurance covers", () -> {
            Offer o = offer[0];
            if (o == null) throw new AssertionError("No offer to check");
            String tax = o.taxPercent().signum() == 0 ? "no tax set" : o.taxName() + " " + o.taxAmount() + (o.taxIncluded() ? " included" : " added");
            String km = o.mileage().unlimited() ? "unlimited km" : o.mileage().kmIncluded() + " km included";
            return tax + "; " + km + "; " + o.coverages().size() + " cover(s)";
        });
        ChannelRules.Coverage optional = r.pricing().coverages().stream().filter(v -> !v.included()).findFirst().orElse(null);
        if (optional != null && offer[0] != null) step(out, "coverage", "An optional cover is priced per day", () -> {
            Search withCover = new Search(loc, loc, from, from.plusDays(3), 30, null, offer[0].vehicleGroup(), List.of(), List.of(optional.code()), null);
            Offer o = core.search(c, withCover).get(0);
            BigDecimal expected = optional.dailyPrice().multiply(BigDecimal.valueOf(o.rentalDays())).setScale(2, RoundingMode.HALF_UP);
            boolean found = o.breakdown().stream().anyMatch(l -> "COVERAGE".equals(l.type()) && l.amount().compareTo(expected) == 0);
            if (!found) throw new AssertionError(optional.code() + " not charged " + expected);
            return optional.code() + " adds " + expected + " " + o.currency();
        });
        ChannelRules.Promotion promo = r.pricing().promotions().stream().filter(p -> p.appliesTo(offer[0] == null ? "" : offer[0].vehicleGroup(), from.toLocalDate())).findFirst().orElse(null);
        if (promo != null && offer[0] != null) step(out, "promotion", "A promotion code lowers the base rate", () -> {
            Offer o = core.search(c, new Search(loc, loc, from, from.plusDays(3), 30, null, offer[0].vehicleGroup(), List.of(), null, promo.code())).get(0);
            if (!promo.code().equals(o.promoCode()) || o.totalAmount().compareTo(offer[0].totalAmount()) >= 0) throw new AssertionError("Promotion not applied");
            return promo.code() + ": " + offer[0].totalAmount() + " → " + o.totalAmount() + " " + o.currency();
        });
        step(out, "invalid-promo", "An unknown promotion code is refused", () -> {
            expect(ChannelError.POLICY_VIOLATION, () -> core.search(c, new Search(loc, loc, from, from.plusDays(3), 30, null, null, List.of(), null, "NOPE-" + stamp)));
            return "POLICY_VIOLATION returned";
        });
        ChannelRules.Location home = r.locations().get(0);
        if (!home.hours().isEmpty() && !home.afterHoursPickup()) step(out, "closed", "A pick-up when the station is closed is refused", () -> {
            LocalDateTime night = from.toLocalDate().atTime(3, 0);
            if (home.openAt(night)) return "Station is open at 03:00; nothing to check";
            expect(ChannelError.INVALID_DATE, () -> core.search(c, new Search(loc, loc, night, night.plusDays(3), 30, null, null, List.of())));
            return "INVALID_DATE returned for 03:00";
        });
        if (offer[0] == null) return report(out);
        Search booked = new Search(loc, loc, from, from.plusDays(3), 30, null, offer[0].vehicleGroup(), List.of());

        step(out, "quote", "Quote re-validates the offer and holds a car", () -> {
            Offer q = core.quote(c, offer[0].offerId());
            if (!q.held()) throw new AssertionError("The offer was not held");
            return "Held until " + q.expiresAt();
        });
        step(out, "offer-expired", "Expired offer is refused", () -> {
            Offer o = core.search(c, booked).get(0);
            offers.findById(o.offerId()).ifPresent(x -> { x.setExpiresAt(Instant.now().minusSeconds(60)); offers.save(x); });
            expect(ChannelError.OFFER_EXPIRED, () -> core.create(c, request(o.offerId(), "CERT-EXP-" + stamp, null, null)));
            return "OFFER_EXPIRED returned";
        });
        step(out, "price-changed", "Changed price is refused", () -> {
            expect(ChannelError.PRICE_CHANGED, () -> core.create(c, request(null, "CERT-PRICE-" + stamp, booked, offer[0].totalAmount().add(BigDecimal.ONE))));
            return "PRICE_CHANGED returned";
        });

        Reservation[] res = new Reservation[1];
        String ref = "CERT-" + stamp;
        step(out, "create", "Booking is created from an offer", () -> {
            res[0] = core.create(c, request(offer[0].offerId(), ref, null, null));
            if (!"CONFIRMED".equals(res[0].status())) throw new AssertionError("Status " + res[0].status());
            return res[0].reservationId() + " CONFIRMED, total " + res[0].totalAmount() + " " + res[0].currency();
        });
        if (res[0] == null) return report(out);
        step(out, "idempotent", "Retrying the same booking does not create a second one", () -> {
            Reservation again = core.create(c, request(offer[0].offerId(), ref, null, null));
            if (!again.reservationId().equals(res[0].reservationId())) throw new AssertionError("A second booking was created: " + again.reservationId());
            return "Same reservation " + again.reservationId() + " returned";
        });
        step(out, "duplicate", "Reusing a broker reference for a different booking is refused", () -> {
            expect(ChannelError.DUPLICATE_REFERENCE, () -> core.create(c, new BookingRequest(null, ref, "OTHER-" + stamp, booked,
                new Customer("Ms", "Jane", "Other", "jane@example.com", "+962700000000", "JO"), null, null, null, null)));
            return "DUPLICATE_REFERENCE returned";
        });
        step(out, "penalties", "The booking carries its cancellation schedule with deadlines", () -> {
            Reservation g = core.get(c, res[0].reservationId());
            if (g.penalties() == null) throw new AssertionError("No schedule stored");
            return g.penalties().isEmpty() ? "Free cancellation at any time" : String.join("; ", g.penalties().stream()
                .map(p -> "from " + p.from() + ": " + p.percent().stripTrailingZeros().toPlainString() + "% = " + p.amount() + " " + g.currency()).toList());
        });
        step(out, "list", "Reconciliation list returns the booking", () -> {
            ReservationPage pg = core.list(c, from.toLocalDate(), from.toLocalDate(), null, 1, 50);
            if (pg.reservations().stream().noneMatch(x -> x.reservationId().equals(res[0].reservationId()))) throw new AssertionError("Booking missing from the list");
            return pg.total() + " booking(s) with pick-up on " + from.toLocalDate();
        });
        step(out, "retrieve", "Retrieve by reservation number and by broker reference", () -> {
            Reservation a = core.get(c, res[0].reservationId());
            Reservation b = core.get(c, ref);
            if (!a.reservationId().equals(b.reservationId())) throw new AssertionError("Different bookings returned");
            return a.reservationId() + " / " + ref + " → " + a.status();
        });
        step(out, "modify", "Modification re-prices the booking", () -> {
            Search longer = new Search(null, null, null, from.plusDays(4), null, null, null, null);
            Reservation m = core.modify(c, new ModifyRequest(res[0].reservationId(), longer, null, null, null, null));
            return "Extended by a day: " + res[0].totalAmount() + " → " + m.totalAmount() + " " + m.currency();
        });
        step(out, "cancel", "Cancellation applies the policy and releases the car", () -> {
            Reservation x = core.cancel(c, res[0].reservationId(), "Certification test");
            if (!"CANCELLED".equals(x.status())) throw new AssertionError("Status " + x.status());
            BigDecimal pct = ChannelBookingService.percentAt(ChannelBookingService.penalties(r, from, x.totalAmount()), LocalDateTime.now());
            BigDecimal expectedFee = x.totalAmount().multiply(pct).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            if (x.cancellationFee().compareTo(expectedFee) != 0) throw new AssertionError("Fee " + x.cancellationFee() + ", expected " + expectedFee);
            Reservation twice = core.cancel(c, res[0].reservationId(), null);
            if (!"CANCELLED".equals(twice.status())) throw new AssertionError("Second cancel changed the status");
            return "CANCELLED, fee " + x.cancellationFee() + " " + x.currency() + " (policy " + r.cancellationPolicyCode() + "); cancelling again is safe";
        });
        step(out, "invalid-location", "Unknown location is refused", () -> {
            expect(ChannelError.INVALID_LOCATION, () -> core.search(c, new Search("ZZZ", "ZZZ", from, from.plusDays(2), null, null, null, List.of())));
            return "INVALID_LOCATION returned";
        });
        step(out, "invalid-date", "Return before pick-up is refused", () -> {
            expect(ChannelError.INVALID_DATE, () -> core.search(c, new Search(loc, loc, from, from.minusDays(1), null, null, null, List.of())));
            return "INVALID_DATE returned";
        });
        step(out, "invalid-group", "Unknown vehicle group is refused", () -> {
            expect(ChannelError.INVALID_VEHICLE_GROUP, () -> core.search(c, new Search(loc, loc, from, from.plusDays(2), null, null, "QQQQ", List.of())));
            return "INVALID_VEHICLE_GROUP returned";
        });
        step(out, "webhook", "Webhook endpoint configured", () -> {
            if (r.webhookUrl().isBlank()) throw new AssertionError("No webhook URL (optional, but needed for status updates)");
            return r.webhookUrl();
        });
        return report(out);
    }

    private static BookingRequest request(String offerId, String ref, Search s, BigDecimal expected) {
        return new BookingRequest(offerId, ref, null, s, new Customer("Mr", "John", "Doe", "john.doe@example.com", "+962790000000", "JO"),
            new Driver("John", "Doe", "1990-05-01", "CERT123456", "JO"), expected, "Certification test", null);
    }

    /** The first day with published rates, at least two days out, at a time the station is open. */
    private static LocalDateTime firstSellableDate(ChannelBookingService.Ctx c) {
        LocalDateTime d = firstRateDate(c);
        ChannelRules.Location l = c.rules().locations().get(0);
        for (int i = 0; i < 14 && !(l.openAt(d) && l.openAt(d.plusDays(3)) && l.openAt(d.plusDays(4))); i++) {
            ChannelRules.Hours h = l.hours().get(d.getDayOfWeek());
            d = h != null && !l.openAt(d) ? d.toLocalDate().atTime(h.open().plusHours(1)) : d.plusDays(1);
        }
        return d;
    }

    private static LocalDateTime firstRateDate(ChannelBookingService.Ctx c) {
        LocalDate earliest = LocalDateTime.now().plusHours(c.rules().minLeadHours()).toLocalDate().plusDays(2);
        for (var plan : c.channel().publishedRatePlans()) {
            try {
                LocalDate s = LocalDate.parse(plan.path("startDate").asText());
                LocalDate e = LocalDate.parse(plan.path("endDate").asText());
                LocalDate d = s.isAfter(earliest) ? s : earliest;
                if (!d.plusDays(3).isAfter(e)) return d.atTime(LocalTime.of(10, 0));
            } catch (Exception ignored) { /* skip a bad period */ }
        }
        return earliest.atTime(LocalTime.of(10, 0));
    }

    private static void expect(ChannelError err, Runnable r) {
        try {
            r.run();
        } catch (ChannelException e) {
            if (e.error == err) return;
            throw new AssertionError("Expected " + err + ", got " + e.error + ": " + e.getMessage());
        }
        throw new AssertionError("Expected " + err + ", but the request succeeded");
    }

    private static void step(List<Result> out, String id, String name, Supplier<String> test) {
        long t = System.nanoTime();
        try {
            out.add(new Result(id, name, true, test.get(), (System.nanoTime() - t) / 1_000_000));
        } catch (AssertionError | ChannelException e) {
            out.add(new Result(id, name, false, e instanceof ChannelException ce ? ce.error + ": " + ce.getMessage() : e.getMessage(), (System.nanoTime() - t) / 1_000_000));
        } catch (Exception e) {
            out.add(new Result(id, name, false, "Unexpected error: " + e.getClass().getSimpleName(), (System.nanoTime() - t) / 1_000_000));
        }
    }

    private static Report report(List<Result> out) {
        return new Report(Instant.now(), (int) out.stream().filter(Result::passed).count(), out.size(), out);
    }
}
