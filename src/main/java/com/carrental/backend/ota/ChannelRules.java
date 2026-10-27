package com.carrental.backend.ota;

import com.fasterxml.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.*;

/**
 * The commercial and booking rules agreed with one broker, read from the channel's
 * "bookingRules" settings (Channel Manager → Booking API). Every value has a safe default,
 * so channels set up before the booking API existed keep working.
 */
public record ChannelRules(
    boolean bookingsEnabled,
    String paymentModel,          // PAY_AT_COUNTER | BROKER_PREPAID
    int freeCancellationHours,    // free until this many hours before pick-up
    BigDecimal lateCancellationFeePercent,
    BigDecimal modificationFee,
    int minLeadHours,             // booking cut-off before pick-up
    int maxRentalDays,
    int maxHorizonDays,           // how far ahead bookings are accepted
    int minDriverAge,
    int maxDriverAge,             // 0 = no limit
    int offerValidityMinutes,
    int holdMinutes,
    int operationalBuffer,        // cars per group kept back from this channel
    BigDecimal oneWayFee,
    List<String> allowedGroups,   // SIPP codes; empty = every published group
    List<Location> locations,
    String webhookUrl,
    List<String> webhookEvents,   // empty = all events
    Pricing pricing,
    Map<String, GroupDetail> groupDetails,
    List<Allotment> allotments,
    int noShowAfterHours,         // 0 = no automatic no-shows
    BigDecimal noShowFeePercent,
    int inventoryPushDays,        // days ahead sent in inventory.updated
    List<CancelTier> cancellationTiers,  // sorted by hoursBefore, largest first
    Map<String, BigDecimal> currencies   // sell currency -> units per 1 channel currency
) {
    /** Cancelling less than hoursBefore hours before pick-up costs feePercent of the booking. */
    public record CancelTier(int hoursBefore, BigDecimal feePercent) {}

    /** A station: code the broker uses, our branch, contact, position, hours and after-hours rules. */
    public record Location(String code, String name, String address, boolean pickup, boolean dropOff,
                           String type, String phone, Double latitude, Double longitude,
                           Map<DayOfWeek, Hours> hours, boolean afterHoursPickup, boolean afterHoursReturn, BigDecimal afterHoursFee) {
        public boolean openAt(java.time.LocalDateTime t) {
            if (hours.isEmpty()) return true;              // no hours set: always open
            Hours h = hours.get(t.getDayOfWeek());
            if (h == null) return false;
            LocalTime at = t.toLocalTime();
            return !at.isBefore(h.open()) && !at.isAfter(h.close());
        }
    }
    public record Hours(LocalTime open, LocalTime close) {}

    /** Tax, mileage, insurance covers, promotions and driver-age fees. */
    public record Pricing(BigDecimal taxPercent, boolean taxIncluded, String taxName,
                          boolean unlimitedMileage, int kmPerDay, BigDecimal extraKmPrice,
                          List<Coverage> coverages, List<Promotion> promotions,
                          int youngDriverUnder, BigDecimal youngDriverFee, int seniorDriverFrom, BigDecimal seniorDriverFee) {}

    /** An insurance cover: included in the rate, or offered at a daily price. excess/deposit: what applies with it (null = the car's own). */
    public record Coverage(String code, String name, boolean included, BigDecimal dailyPrice, BigDecimal excess, BigDecimal deposit) {}

    public record Promotion(String code, BigDecimal percentOff, LocalDate from, LocalDate to, List<String> groups) {
        public boolean appliesTo(String sipp, LocalDate pickup) {
            if (from != null && pickup.isBefore(from)) return false;
            if (to != null && pickup.isAfter(to)) return false;
            return groups.isEmpty() || groups.contains(sipp.toUpperCase(Locale.ROOT));
        }
    }

    /** What the broker shows for a vehicle group: capacity, doors, bags, fuel, picture. */
    public record GroupDetail(Integer seats, Integer doors, Integer largeBags, Integer smallBags, String fuel, String pictureUrl, String description) {}

    /**
     * A broker allotment for pick-ups in the period: at most `quantity` cars of the group on this broker's
     * bookings at the same time. Within `releaseDays` of pick-up the cap lifts and the broker sells from
     * general availability (free sale). stopSell closes the group for this broker in the period.
     */
    public record Allotment(String group, LocalDate from, LocalDate to, int quantity, int releaseDays, boolean stopSell) {
        public boolean covers(String sipp, LocalDate day) {
            return group.equalsIgnoreCase(sipp) && !day.isBefore(from) && !day.isAfter(to);
        }
    }

    public static final List<String> LOCATION_TYPES = List.of("AIRPORT", "CITY", "HOTEL", "RAILWAY", "PORT");

    public static final List<String> ALL_EVENTS = List.of(
        "reservation.created", "reservation.confirmed", "reservation.modified", "reservation.cancelled",
        "reservation.no_show", "reservation.picked_up", "agreement.created", "agreement.closed", "inventory.updated");

    public static ChannelRules of(ChannelSnapshot ch, JsonNode rentalLocations) {
        JsonNode r = ch.raw().path("bookingRules");
        List<Location> locations = new ArrayList<>();
        for (JsonNode l : r.path("locations")) {
            String code = l.path("code").asText("").trim().toUpperCase(Locale.ROOT);
            if (code.isEmpty()) continue;
            String name = l.path("name").asText(code);
            locations.add(location(l, code, name, addressOf(rentalLocations, name, l.path("address").asText(""))));
        }
        if (locations.isEmpty()) {
            // Channels set up before location mapping: the single location code is the main branch.
            JsonNode first = rentalLocations != null && rentalLocations.isArray() && rentalLocations.size() > 0 ? rentalLocations.get(0) : null;
            String name = first == null ? ch.locationCode() : first.path("name").asText(ch.locationCode());
            locations.add(location(com.fasterxml.jackson.databind.node.MissingNode.getInstance(), ch.locationCode(), name, first == null ? "" : first.path("address").asText("")));
        }
        List<String> groups = new ArrayList<>();
        r.path("allowedGroups").forEach(g -> { if (!g.asText("").isBlank()) groups.add(g.asText().toUpperCase(Locale.ROOT)); });
        List<String> events = new ArrayList<>();
        r.path("webhookEvents").forEach(e -> { if (ALL_EVENTS.contains(e.asText())) events.add(e.asText()); });
        String pay = r.path("paymentModel").asText("PAY_AT_COUNTER");

        JsonNode p = r.path("pricing");
        List<Coverage> covers = new ArrayList<>();
        for (JsonNode c : p.path("coverages")) {
            String code = c.path("code").asText("").trim().toUpperCase(Locale.ROOT);
            if (code.isEmpty()) continue;
            covers.add(new Coverage(code, c.path("name").asText(code), c.path("included").asBoolean(false),
                money(c.path("dailyPrice"), BigDecimal.ZERO), c.path("excess").isNumber() ? money(c.path("excess"), null) : null,
                c.path("deposit").isNumber() ? money(c.path("deposit"), null) : null));
        }
        List<Promotion> promos = new ArrayList<>();
        for (JsonNode pr : p.path("promotions")) {
            String code = pr.path("code").asText("").trim().toUpperCase(Locale.ROOT);
            if (code.isEmpty()) continue;
            List<String> pg = new ArrayList<>();
            pr.path("groups").forEach(g -> { if (!g.asText("").isBlank()) pg.add(g.asText().toUpperCase(Locale.ROOT)); });
            BigDecimal pct = money(pr.path("percentOff"), BigDecimal.ZERO).min(BigDecimal.valueOf(90)).max(BigDecimal.ZERO);
            promos.add(new Promotion(code, pct, date(pr.path("from")), date(pr.path("to")), pg));
        }
        Pricing pricing = new Pricing(
            money(p.path("taxPercent"), BigDecimal.ZERO).min(BigDecimal.valueOf(50)), p.path("taxIncluded").asBoolean(true),
            p.path("taxName").asText("VAT"),
            p.path("unlimitedMileage").asBoolean(true), clamp(p.path("kmPerDay").asInt(0), 0, 10000), money(p.path("extraKmPrice"), BigDecimal.ZERO),
            covers, promos,
            clamp(p.path("youngDriverUnder").asInt(0), 0, 30), money(p.path("youngDriverFee"), BigDecimal.ZERO),
            clamp(p.path("seniorDriverFrom").asInt(0), 0, 99), money(p.path("seniorDriverFee"), BigDecimal.ZERO));

        Map<String, GroupDetail> details = new HashMap<>();
        r.path("groupDetails").fields().forEachRemaining(e -> {
            JsonNode d = e.getValue();
            details.put(e.getKey().toUpperCase(Locale.ROOT), new GroupDetail(intOrNull(d, "seats"), intOrNull(d, "doors"), intOrNull(d, "largeBags"),
                intOrNull(d, "smallBags"), text(d, "fuel"), text(d, "pictureUrl"), text(d, "description")));
        });
        List<Allotment> allots = new ArrayList<>();
        for (JsonNode a : r.path("allotments")) {
            String g = a.path("group").asText("").trim().toUpperCase(Locale.ROOT);
            LocalDate from = date(a.path("from")), to = date(a.path("to"));
            if (g.isEmpty() || from == null || to == null) continue;
            allots.add(new Allotment(g, from, to, clamp(a.path("quantity").asInt(0), 0, 10000), clamp(a.path("releaseDays").asInt(0), 0, 365),
                a.path("stopSell").asBoolean(false)));
        }
        return new ChannelRules(
            r.path("bookingsEnabled").asBoolean(true),
            "BROKER_PREPAID".equals(pay) ? pay : "PAY_AT_COUNTER",
            clamp(r.path("freeCancellationHours").asInt(48), 0, 24 * 60),
            money(r.path("lateCancellationFeePercent"), BigDecimal.valueOf(100)).min(BigDecimal.valueOf(100)),
            money(r.path("modificationFee"), BigDecimal.ZERO),
            clamp(r.path("minLeadHours").asInt(2), 0, 24 * 30),
            clamp(r.path("maxRentalDays").asInt(60), 1, 365),
            clamp(r.path("maxHorizonDays").asInt(365), 1, 3 * 365),
            clamp(r.path("minDriverAge").asInt(21), 16, 99),
            clamp(r.path("maxDriverAge").asInt(0), 0, 120),
            clamp(r.path("offerValidityMinutes").asInt(30), 5, 24 * 60),
            clamp(r.path("holdMinutes").asInt(15), 5, 60),
            clamp(r.path("operationalBuffer").asInt(0), 0, 1000),
            money(r.path("oneWayFee"), BigDecimal.ZERO),
            groups, locations,
            r.path("webhookUrl").asText("").trim(),
            events, pricing, details, allots,
            clamp(r.path("noShowAfterHours").asInt(0), 0, 24 * 7),
            money(r.path("noShowFeePercent"), BigDecimal.valueOf(100)).min(BigDecimal.valueOf(100)),
            clamp(r.path("inventoryPushDays").asInt(60), 7, 365),
            tiers(r), currencies(r, ch.currency()));
    }

    /**
     * The penalty schedule. Without a "cancellationTiers" list, the single rule
     * (free until freeCancellationHours, then lateCancellationFeePercent) is the only tier.
     */
    private static List<CancelTier> tiers(JsonNode r) {
        List<CancelTier> out = new ArrayList<>();
        for (JsonNode t : r.path("cancellationTiers")) {
            if (!t.path("hoursBefore").isNumber()) continue;
            out.add(new CancelTier(clamp(t.path("hoursBefore").asInt(), 0, 24 * 365),
                money(t.path("feePercent"), BigDecimal.ZERO).min(BigDecimal.valueOf(100))));
        }
        if (out.isEmpty()) {
            out.add(new CancelTier(clamp(r.path("freeCancellationHours").asInt(48), 0, 24 * 60),
                money(r.path("lateCancellationFeePercent"), BigDecimal.valueOf(100)).min(BigDecimal.valueOf(100))));
        }
        out.sort(Comparator.comparingInt(CancelTier::hoursBefore).reversed());
        return List.copyOf(out);
    }

    private static Map<String, BigDecimal> currencies(JsonNode r, String base) {
        Map<String, BigDecimal> out = new LinkedHashMap<>();
        r.path("currencies").fields().forEachRemaining(e -> {
            String code = e.getKey().trim().toUpperCase(Locale.ROOT);
            if (!code.matches("[A-Z]{3}") || code.equalsIgnoreCase(base) || !e.getValue().isNumber()) return;
            BigDecimal rate = e.getValue().decimalValue();
            if (rate.signum() > 0 && rate.compareTo(BigDecimal.valueOf(100_000)) < 0) out.put(code, rate.setScale(6, RoundingMode.HALF_UP));
        });
        return Map.copyOf(out);
    }

    /** Fee percent for cancelling `hoursBefore` hours before pick-up (the highest tier that applies). */
    public BigDecimal cancellationPercent(long hoursBefore) {
        BigDecimal pct = BigDecimal.ZERO;
        for (CancelTier t : cancellationTiers) if (hoursBefore < t.hoursBefore() && t.feePercent().compareTo(pct) > 0) pct = t.feePercent();
        return pct;
    }

    private static Location location(JsonNode l, String code, String name, String address) {
        Map<DayOfWeek, Hours> hours = new EnumMap<>(DayOfWeek.class);
        JsonNode h = l.path("openingHours");
        for (DayOfWeek d : DayOfWeek.values()) {
            JsonNode day = h.path(d.name().substring(0, 3).toLowerCase(Locale.ROOT));   // mon, tue, …
            if (day.isMissingNode() || day.path("closed").asBoolean(false)) continue;
            LocalTime open = time(day.path("open")), close = time(day.path("close"));
            if (open != null && close != null) hours.put(d, new Hours(open, close));
        }
        // If some days are set and others are not, the missing ones are closed; if none are set, always open.
        Double lat = l.path("latitude").isNumber() ? l.path("latitude").asDouble() : null;
        Double lng = l.path("longitude").isNumber() ? l.path("longitude").asDouble() : null;
        String type = l.path("type").asText(name.toLowerCase(Locale.ROOT).contains("airport") ? "AIRPORT" : "CITY").toUpperCase(Locale.ROOT);
        if (!LOCATION_TYPES.contains(type)) type = "CITY";
        return new Location(code, name, address, l.path("pickup").asBoolean(true), l.path("dropOff").asBoolean(true), type,
            l.path("phone").asText("").trim(), lat, lng, hours, l.path("afterHoursPickup").asBoolean(false), l.path("afterHoursReturn").asBoolean(false),
            money(l.path("afterHoursFee"), BigDecimal.ZERO));
    }

    public Location location(String code) {
        if (code == null || code.isBlank()) return null;
        for (Location l : locations) if (l.code().equalsIgnoreCase(code.trim())) return l;
        return null;
    }

    public boolean groupAllowed(String sipp) {
        return allowedGroups.isEmpty() || allowedGroups.contains(sipp.toUpperCase(Locale.ROOT));
    }

    /** No list = every event; inventory.updated only when picked (it can be frequent). */
    public boolean wantsEvent(String event) {
        return webhookEvents.isEmpty() ? !"inventory.updated".equals(event) : webhookEvents.contains(event);
    }

    public boolean prepaid() { return "BROKER_PREPAID".equals(paymentModel); }

    /** FLEX48 / FREE style code partners can show to customers. */
    public String cancellationPolicyCode() {
        int free = -1;
        for (CancelTier t : cancellationTiers) if (t.feePercent().signum() > 0) free = Math.max(free, t.hoursBefore());
        if (free < 0) return "FREE";
        return (cancellationTiers.stream().filter(t -> t.feePercent().signum() > 0).count() > 1 ? "TIERED" : "FLEX") + free;
    }

    public Coverage coverage(String code) {
        if (code == null || code.isBlank()) return null;
        for (Coverage c : pricing.coverages()) if (c.code().equalsIgnoreCase(code.trim())) return c;
        return null;
    }

    /** Allotments that apply to a pick-up of this group on this day. */
    public List<Allotment> allotmentsFor(String sipp, LocalDate pickup) {
        List<Allotment> out = new ArrayList<>();
        for (Allotment a : allotments) if (a.covers(sipp, pickup)) out.add(a);
        return out;
    }

    public Promotion promotion(String code) {
        if (code == null || code.isBlank()) return null;
        for (Promotion p : pricing.promotions()) if (p.code().equalsIgnoreCase(code.trim())) return p;
        return null;
    }

    /** A copy with another operational buffer and no webhook (used by the certification run). */
    public ChannelRules forCertification(int buffer) {
        return new ChannelRules(true, paymentModel, freeCancellationHours, lateCancellationFeePercent, modificationFee, minLeadHours, maxRentalDays,
            maxHorizonDays, minDriverAge, maxDriverAge, offerValidityMinutes, holdMinutes, buffer, oneWayFee, allowedGroups, locations, "",
            webhookEvents, pricing, groupDetails, allotments, 0, noShowFeePercent, inventoryPushDays, cancellationTiers, currencies);
    }

    private static String addressOf(JsonNode rentalLocations, String name, String fallback) {
        if (!fallback.isBlank() || rentalLocations == null) return fallback;
        for (JsonNode l : rentalLocations) if (name.equalsIgnoreCase(l.path("name").asText())) return l.path("address").asText("");
        return "";
    }

    private static int clamp(int v, int min, int max) { return Math.max(min, Math.min(max, v)); }

    private static BigDecimal money(JsonNode n, BigDecimal fallback) {
        BigDecimal v = n.isNumber() ? n.decimalValue() : fallback;
        if (v.signum() < 0) v = BigDecimal.ZERO;
        if (v.compareTo(BigDecimal.valueOf(1_000_000)) > 0) v = BigDecimal.valueOf(1_000_000);
        return v.setScale(2, RoundingMode.HALF_UP);
    }

    private static LocalDate date(JsonNode n) {
        String s = n.asText("");
        try { return s.length() >= 10 ? LocalDate.parse(s.substring(0, 10)) : null; } catch (Exception e) { return null; }
    }

    private static LocalTime time(JsonNode n) {
        String s = n.asText("");
        try { return s.length() >= 4 ? LocalTime.parse(s.length() == 4 ? "0" + s : s.substring(0, 5)) : null; } catch (Exception e) { return null; }
    }

    private static Integer intOrNull(JsonNode n, String f) { return n.path(f).isNumber() ? n.path(f).asInt() : null; }
    private static String text(JsonNode n, String f) { String s = n.path(f).asText("").trim(); return s.isEmpty() ? null : s; }
}
