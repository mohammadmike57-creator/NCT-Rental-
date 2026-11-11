package com.carrental.backend.ota;

import com.fasterxml.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The commercial terms agreed with one broker, on top of the published rates: a markup or discount,
 * per-group adjustments, day-of-week prices, early-booking and last-minute rules, a minimum rental
 * length and closed dates. Read from the channel's "bookingRules.commercial" block, the version staff
 * published in the console (drafts are never read here).
 *
 * <p>Every value defaults to "no change", so a channel without the block (HOG, AUE and every channel
 * set up before) is priced exactly as before. Adjustments are built into the daily rate the broker
 * sees; they are not shown as extra lines, as brokers expect a net rate.
 */
public record ChannelCommercial(
    BigDecimal markupPercent,              // + markup, - discount on the published daily rate
    BigDecimal markupPerDay,               // fixed amount added to every day (channel currency)
    Map<String, GroupTerms> groups,        // per car group: its own markup and minimum days
    Map<DayOfWeek, BigDecimal> pickupDayPercent,   // by the pick-up day
    int earlyBookingDays, BigDecimal earlyBookingPercent,   // booked at least N days ahead (usually negative)
    int lastMinuteHours, BigDecimal lastMinutePercent,      // booked less than N hours ahead (+ or -)
    int minRentalDays,
    List<LocalDate> closedToArrival,       // no pick-ups on these days
    List<LocalDate> closedToDeparture,     // no returns on these days
    List<Blackout> blackouts,              // stop sale: no rental may touch these days
    int roundTo,                           // 0 = cents, 1 = whole units, 5 = nearest 5 (daily rate)
    int version, String publishedAt, String publishedBy
) {
    public static final ChannelCommercial NONE = new ChannelCommercial(BigDecimal.ZERO, BigDecimal.ZERO, Map.of(), Map.of(), 0, BigDecimal.ZERO,
        0, BigDecimal.ZERO, 1, List.of(), List.of(), List.of(), 0, 0, null, null);

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    public record GroupTerms(BigDecimal markupPercent, int minDays) {}

    public record Blackout(LocalDate from, LocalDate to, List<String> groups, String note) {
        public boolean touches(String sipp, LocalDate a, LocalDate b) {
            if (b.isBefore(from) || a.isAfter(to)) return false;
            return groups.isEmpty() || groups.contains(sipp.toUpperCase(Locale.ROOT));
        }
    }

    /** True when nothing here changes a price or a rule: the quote path is then left untouched. */
    public boolean neutral() {
        return markupPercent.signum() == 0 && markupPerDay.signum() == 0 && groups.isEmpty() && pickupDayPercent.isEmpty()
            && earlyBookingPercent.signum() == 0 && lastMinutePercent.signum() == 0 && minRentalDays <= 1
            && closedToArrival.isEmpty() && closedToDeparture.isEmpty() && blackouts.isEmpty() && roundTo == 0;
    }

    /** The percent change for one group and itinerary (sum of every rule that applies), kept within -90 % … +500 %. */
    public BigDecimal percentFor(String sipp, LocalDateTime pickup, LocalDateTime bookedAt) {
        return percentFor(sipp, pickup, bookedAt, false);
    }

    /** skipLeadTime: leave out the early-booking and last-minute percent (another rule already prices lead time). */
    public BigDecimal percentFor(String sipp, LocalDateTime pickup, LocalDateTime bookedAt, boolean skipLeadTime) {
        GroupTerms g = groups.get(sipp.toUpperCase(Locale.ROOT));
        BigDecimal pct = g != null && g.markupPercent() != null ? g.markupPercent() : markupPercent;
        BigDecimal dow = pickupDayPercent.get(pickup.getDayOfWeek());
        if (dow != null) pct = pct.add(dow);
        long hoursAhead = ChronoUnit.HOURS.between(bookedAt, pickup);
        if (!skipLeadTime && earlyBookingDays > 0 && earlyBookingPercent.signum() != 0 && hoursAhead >= earlyBookingDays * 24L) pct = pct.add(earlyBookingPercent);
        if (!skipLeadTime && lastMinuteHours > 0 && lastMinutePercent.signum() != 0 && hoursAhead < lastMinuteHours) pct = pct.add(lastMinutePercent);
        return pct.max(BigDecimal.valueOf(-90)).min(BigDecimal.valueOf(500));
    }

    /** The daily rate the broker sells: published × (1 + percent) + fixed, then rounded as agreed. Never below 0.01. */
    public BigDecimal adjustDaily(BigDecimal daily, BigDecimal percent) {
        BigDecimal v = daily.multiply(HUNDRED.add(percent)).divide(HUNDRED, 4, RoundingMode.HALF_UP).add(markupPerDay);
        if (roundTo > 0) {
            BigDecimal step = BigDecimal.valueOf(roundTo);
            v = v.divide(step, 0, RoundingMode.HALF_UP).multiply(step);
        }
        v = v.setScale(2, RoundingMode.HALF_UP);
        return v.signum() > 0 ? v : new BigDecimal("0.01");
    }

    public int minDaysFor(String sipp) {
        GroupTerms g = groups.get(sipp.toUpperCase(Locale.ROOT));
        return Math.max(minRentalDays, g == null ? 1 : g.minDays());
    }

    /** The stop sale that closes this group for the rental, or null. */
    public Blackout blackoutFor(String sipp, LocalDate pickup, LocalDate ret) {
        for (Blackout b : blackouts) if (b.touches(sipp, pickup, ret)) return b;
        return null;
    }

    public static ChannelCommercial of(JsonNode rules) {
        JsonNode c = rules.path("commercial");
        if (!c.isObject()) return NONE;
        Map<String, GroupTerms> groups = new LinkedHashMap<>();
        c.path("groups").fields().forEachRemaining(e -> {
            String g = e.getKey().trim().toUpperCase(Locale.ROOT);
            if (!g.matches("[A-Z0-9]{2,8}")) return;
            JsonNode v = e.getValue();
            BigDecimal pct = v.path("markupPercent").isNumber() ? pct(v.path("markupPercent")) : null;
            int min = clamp(v.path("minDays").asInt(1), 1, 365);
            if (pct != null || min > 1) groups.put(g, new GroupTerms(pct, min));
        });
        Map<DayOfWeek, BigDecimal> dow = new EnumMap<>(DayOfWeek.class);
        for (DayOfWeek d : DayOfWeek.values()) {
            JsonNode v = c.path("pickupDayPercent").path(d.name().substring(0, 3).toLowerCase(Locale.ROOT));   // mon, tue, …
            if (v.isNumber() && v.decimalValue().signum() != 0) dow.put(d, pct(v));
        }
        List<Blackout> blackouts = new ArrayList<>();
        for (JsonNode b : c.path("blackouts")) {
            LocalDate from = date(b.path("from")), to = date(b.path("to"));
            if (from == null) continue;
            if (to == null || to.isBefore(from)) to = from;
            List<String> gs = new ArrayList<>();
            for (JsonNode g : b.path("groups")) { String s = g.asText("").trim().toUpperCase(Locale.ROOT); if (!s.isEmpty()) gs.add(s); }
            blackouts.add(new Blackout(from, to, List.copyOf(gs), b.path("note").asText("").trim()));
        }
        int round = c.path("roundTo").asInt(0);
        return new ChannelCommercial(
            pct(c.path("markupPercent")),
            money(c.path("markupPerDay")),
            Map.copyOf(groups), Map.copyOf(dow),
            clamp(c.path("earlyBooking").path("days").asInt(0), 0, 730), pct(c.path("earlyBooking").path("percent")),
            clamp(c.path("lastMinute").path("hours").asInt(0), 0, 24 * 30), pct(c.path("lastMinute").path("percent")),
            clamp(c.path("minRentalDays").asInt(1), 1, 365),
            dates(c.path("closedToArrival")), dates(c.path("closedToDeparture")), List.copyOf(blackouts),
            round == 1 || round == 5 || round == 10 ? round : 0,
            c.path("version").asInt(0), text(c.path("publishedAt")), text(c.path("publishedBy")));
    }

    private static BigDecimal pct(JsonNode n) {
        if (!n.isNumber()) return BigDecimal.ZERO;
        return n.decimalValue().max(BigDecimal.valueOf(-90)).min(BigDecimal.valueOf(500)).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal money(JsonNode n) {
        if (!n.isNumber()) return BigDecimal.ZERO;
        return n.decimalValue().max(BigDecimal.valueOf(-100_000)).min(BigDecimal.valueOf(100_000)).setScale(2, RoundingMode.HALF_UP);
    }

    private static List<LocalDate> dates(JsonNode arr) {
        List<LocalDate> out = new ArrayList<>();
        for (JsonNode n : arr) { LocalDate d = date(n); if (d != null && !out.contains(d)) out.add(d); }
        return List.copyOf(out);
    }

    private static LocalDate date(JsonNode n) {
        String s = n.asText("");
        try { return s.length() >= 10 ? LocalDate.parse(s.substring(0, 10)) : null; } catch (Exception e) { return null; }
    }

    private static String text(JsonNode n) { String s = n.asText("").trim(); return s.isEmpty() ? null : s; }

    private static int clamp(int v, int min, int max) { return Math.max(min, Math.min(max, v)); }
}
