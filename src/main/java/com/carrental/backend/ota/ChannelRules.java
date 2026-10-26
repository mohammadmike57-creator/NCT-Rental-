package com.carrental.backend.ota;

import com.fasterxml.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * The commercial and booking rules agreed with one broker, read from the channel's
 * "bookingRules" settings (Channel Manager → Booking rules). Every value has a safe default,
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
    List<String> webhookEvents     // empty = all events
) {
    public record Location(String code, String name, String address, boolean pickup, boolean dropOff) {}

    public static final List<String> ALL_EVENTS = List.of(
        "reservation.created", "reservation.confirmed", "reservation.modified", "reservation.cancelled",
        "reservation.no_show", "reservation.picked_up", "agreement.created", "agreement.closed");

    public static ChannelRules of(ChannelSnapshot ch, JsonNode rentalLocations) {
        JsonNode r = ch.raw().path("bookingRules");
        List<Location> locations = new ArrayList<>();
        for (JsonNode l : r.path("locations")) {
            String code = l.path("code").asText("").trim().toUpperCase(Locale.ROOT);
            if (code.isEmpty()) continue;
            String name = l.path("name").asText(code);
            locations.add(new Location(code, name, addressOf(rentalLocations, name, l.path("address").asText("")),
                l.path("pickup").asBoolean(true), l.path("dropOff").asBoolean(true)));
        }
        if (locations.isEmpty()) {
            // Channels set up before location mapping: the single location code is the main branch.
            JsonNode first = rentalLocations != null && rentalLocations.isArray() && rentalLocations.size() > 0 ? rentalLocations.get(0) : null;
            String name = first == null ? ch.locationCode() : first.path("name").asText(ch.locationCode());
            locations.add(new Location(ch.locationCode(), name, first == null ? "" : first.path("address").asText(""), true, true));
        }
        List<String> groups = new ArrayList<>();
        r.path("allowedGroups").forEach(g -> { if (!g.asText("").isBlank()) groups.add(g.asText().toUpperCase(Locale.ROOT)); });
        List<String> events = new ArrayList<>();
        r.path("webhookEvents").forEach(e -> { if (ALL_EVENTS.contains(e.asText())) events.add(e.asText()); });
        String pay = r.path("paymentModel").asText("PAY_AT_COUNTER");
        return new ChannelRules(
            r.path("bookingsEnabled").asBoolean(true),
            "BROKER_PREPAID".equals(pay) ? pay : "PAY_AT_COUNTER",
            clamp(r.path("freeCancellationHours").asInt(48), 0, 24 * 60),
            money(r.path("lateCancellationFeePercent"), BigDecimal.valueOf(100), BigDecimal.ZERO, BigDecimal.valueOf(100)),
            money(r.path("modificationFee"), BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.valueOf(100000)),
            clamp(r.path("minLeadHours").asInt(2), 0, 24 * 30),
            clamp(r.path("maxRentalDays").asInt(60), 1, 365),
            clamp(r.path("maxHorizonDays").asInt(365), 1, 3 * 365),
            clamp(r.path("minDriverAge").asInt(21), 16, 99),
            clamp(r.path("maxDriverAge").asInt(0), 0, 120),
            clamp(r.path("offerValidityMinutes").asInt(30), 5, 24 * 60),
            clamp(r.path("holdMinutes").asInt(15), 5, 60),
            clamp(r.path("operationalBuffer").asInt(0), 0, 1000),
            money(r.path("oneWayFee"), BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.valueOf(100000)),
            groups, locations,
            r.path("webhookUrl").asText("").trim(),
            events);
    }

    public Location location(String code) {
        if (code == null || code.isBlank()) return null;
        for (Location l : locations) if (l.code().equalsIgnoreCase(code.trim())) return l;
        return null;
    }

    public boolean groupAllowed(String sipp) {
        return allowedGroups.isEmpty() || allowedGroups.contains(sipp.toUpperCase(Locale.ROOT));
    }

    public boolean wantsEvent(String event) {
        return webhookEvents.isEmpty() || webhookEvents.contains(event);
    }

    public boolean prepaid() { return "BROKER_PREPAID".equals(paymentModel); }

    /** FLEX48 / NONREF style code partners can show to customers. */
    public String cancellationPolicyCode() {
        if (lateCancellationFeePercent.signum() == 0) return "FREE";
        return "FLEX" + freeCancellationHours;
    }

    private static String addressOf(JsonNode rentalLocations, String name, String fallback) {
        if (!fallback.isBlank() || rentalLocations == null) return fallback;
        for (JsonNode l : rentalLocations) if (name.equalsIgnoreCase(l.path("name").asText())) return l.path("address").asText("");
        return "";
    }

    private static int clamp(int v, int min, int max) { return Math.max(min, Math.min(max, v)); }

    private static BigDecimal money(JsonNode n, BigDecimal fallback, BigDecimal min, BigDecimal max) {
        BigDecimal v = n.isNumber() ? n.decimalValue() : fallback;
        if (v.compareTo(min) < 0) v = min;
        if (v.compareTo(max) > 0) v = max;
        return v.setScale(2, java.math.RoundingMode.HALF_UP);
    }
}
