package com.carrental.backend.ota;

import com.fasterxml.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Pricing and XML generation for partner channels. This is the server-side
 * twin of services/channelManager.ts in the frontend: same tier rules, same
 * stop-sale rules, same XML layout, so the in-app preview matches what
 * partners receive.
 */
public final class OtaXml {

    public static final String OTA_NAMESPACE = "http://www.opentravel.org/OTA/2003/05";
    public static final String RATE_SHEET_NAMESPACE = "urn:nct-rental:ratesheet:1.0";
    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'");
    private static final DateTimeFormatter LOCAL = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    private OtaXml() {}

    // ------------------------------------------------------------------ pricing

    public record Extra(String id, String code, String name, BigDecimal dailyPrice, BigDecimal maxPerRental) {}

    public record QuoteLine(String sippCode, String model, String transmission, boolean airCon, String status,
                            String closedReason, String planId, int days, BigDecimal dailyRate,
                            BigDecimal baseTotal, List<Map.Entry<Extra, BigDecimal>> extras, BigDecimal total) {}

    public record QuoteRequest(LocalDateTime pickUp, LocalDateTime dropOff, List<String> equipCodes) {}

    public static int rentalDays(LocalDateTime pickUp, LocalDateTime dropOff) {
        long minutes = Duration.between(pickUp, dropOff).toMinutes();
        if (minutes <= 0) return 1;
        return (int) Math.max(1, (minutes + 1439) / 1440); // every started 24h block counts
    }

    static boolean isOpenEnded(JsonNode tier) {
        JsonNode to = tier.get("toDay");
        return to == null || to.isNull() || !to.isNumber();
    }

    static List<JsonNode> sortedTiers(JsonNode rate) {
        List<JsonNode> tiers = new ArrayList<>();
        JsonNode t = rate.get("tiers");
        if (t != null && t.isArray()) t.forEach(tiers::add);
        tiers.sort(Comparator.comparingInt(x -> x.path("fromDay").asInt(0)));
        return tiers;
    }

    static JsonNode findTier(JsonNode rate, int days) {
        for (JsonNode t : sortedTiers(rate)) {
            int from = t.path("fromDay").asInt(1);
            if (from <= days && (isOpenEnded(t) || days <= t.get("toDay").asInt())) return t;
        }
        return null;
    }

    static JsonNode findPlan(List<JsonNode> plans, LocalDate date) {
        String d = date.toString();
        for (JsonNode p : plans) {
            if (p.path("startDate").asText("").compareTo(d) <= 0 && d.compareTo(p.path("endDate").asText("")) <= 0) return p;
        }
        return null;
    }

    static List<JsonNode> vehiclesForSipp(JsonNode fleet, String sipp) {
        List<JsonNode> out = new ArrayList<>();
        for (JsonNode v : fleet) if (sipp.equalsIgnoreCase(v.path("sippCode").asText(""))) out.add(v);
        return out;
    }

    /** Returns the stop sale that closes this SIPP group for the rental, or null. */
    static JsonNode stopFor(JsonNode stopSales, JsonNode fleet, String sipp, LocalDate pickUp, LocalDate ret) {
        List<JsonNode> vehicles = vehiclesForSipp(fleet, sipp);
        if (vehicles.isEmpty()) return null;
        List<JsonNode> relevant = new ArrayList<>();
        for (JsonNode s : stopSales) {
            String start = s.path("startDate").asText("");
            String end = s.path("endDate").asText("");
            if (start.compareTo(ret.toString()) <= 0 && pickUp.toString().compareTo(end) <= 0) relevant.add(s);
        }
        Set<String> stoppedIds = new HashSet<>();
        Set<String> categories = new HashSet<>();
        for (JsonNode s : relevant) {
            if ("vehicle".equals(s.path("type").asText())) stoppedIds.add(s.path("target").asText());
            else if ("category".equals(s.path("type").asText())) categories.add(s.path("target").asText());
        }
        boolean allStopped = vehicles.stream().allMatch(v ->
            stoppedIds.contains(v.path("id").asText()) || categories.contains(v.path("category").asText()));
        return allStopped && !relevant.isEmpty() ? relevant.get(0) : null;
    }

    static String sippTransmission(String code) {
        return code.length() > 2 && "ABD".indexOf(code.charAt(2)) >= 0 ? "Automatic" : "Manual";
    }

    static boolean sippAirCon(String code) {
        return code.length() > 3 && "RDHECLAMVU".indexOf(code.charAt(3)) >= 0;
    }

    static String transmissionOf(JsonNode vehicle, String sipp) {
        String t = vehicle == null ? "" : vehicle.path("transmission").asText("");
        if (t.equalsIgnoreCase("automatic")) return "Automatic";
        if (t.equalsIgnoreCase("manual")) return "Manual";
        return sippTransmission(sipp);
    }

    static BigDecimal money(double v) {
        return BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP);
    }

    public static List<Extra> extras(ChannelSnapshot ch) {
        List<Extra> out = new ArrayList<>();
        for (JsonNode e : ch.extras()) {
            String id = e.path("id").asText("");
            String code = e.path("otaEquipType").asText("");
            double cap = e.path("maxPerRental").asDouble(0);
            out.add(new Extra(id, code.isBlank() ? id : code, e.path("name").asText(id),
                money(e.path("price").asDouble(0)), cap > 0 ? money(cap) : null));
        }
        return out;
    }

    public static List<QuoteLine> quote(ChannelSnapshot ch, QuoteRequest req) {
        int days = rentalDays(req.pickUp(), req.dropOff());
        LocalDate pickUpDate = req.pickUp().toLocalDate();
        LocalDate returnDate = req.dropOff().toLocalDate();
        JsonNode plan = findPlan(ch.publishedRatePlans(), pickUpDate);
        if (plan == null) return List.of();

        List<Extra> chosen = new ArrayList<>();
        Set<String> wanted = new HashSet<>();
        for (String c : req.equipCodes()) wanted.add(c.toUpperCase(Locale.ROOT));
        for (Extra e : extras(ch)) {
            if (wanted.contains(e.code().toUpperCase(Locale.ROOT)) || wanted.contains(e.id().toUpperCase(Locale.ROOT))) chosen.add(e);
        }

        List<QuoteLine> lines = new ArrayList<>();
        JsonNode rates = plan.get("sippRates");
        if (rates == null || !rates.isArray()) return lines;
        for (JsonNode rate : rates) {
            String code = rate.path("sippCode").asText("").toUpperCase(Locale.ROOT);
            List<JsonNode> vehicles = vehiclesForSipp(ch.fleet(), code);
            JsonNode vehicle = vehicles.isEmpty() ? null : vehicles.get(0);
            JsonNode tier = findTier(rate, days);
            double daily = tier == null ? 0 : tier.path("dailyPrice").asDouble(0);
            BigDecimal dailyRate = money(daily);
            BigDecimal base = money(daily * days);

            List<Map.Entry<Extra, BigDecimal>> extraCharges = new ArrayList<>();
            BigDecimal total = base;
            for (Extra e : chosen) {
                BigDecimal charge = e.dailyPrice().multiply(BigDecimal.valueOf(days));
                if (e.maxPerRental() != null && charge.compareTo(e.maxPerRental()) > 0) charge = e.maxPerRental();
                charge = charge.setScale(2, RoundingMode.HALF_UP);
                extraCharges.add(Map.entry(e, charge));
                total = total.add(charge);
            }

            String status = vehicles.isEmpty() ? "OnRequest" : "Available";
            String reason = null;
            JsonNode stop = stopFor(ch.stopSales(), ch.fleet(), code, pickUpDate, returnDate);
            if (stop != null) {
                status = "Closed";
                reason = stop.path("reason").asText("");
                if (reason.isBlank()) reason = "Stop sale";
            }
            if (tier == null || daily <= 0) {
                status = "Closed";
                reason = "No rate for " + days + "-day rentals";
            }
            lines.add(new QuoteLine(code, vehicle == null ? code : vehicle.path("modelName").asText(code),
                transmissionOf(vehicle, code), sippAirCon(code), status, reason, plan.path("id").asText(""),
                days, dailyRate, base, extraCharges, total.setScale(2, RoundingMode.HALF_UP)));
        }
        return lines;
    }

    // ------------------------------------------------------------------ XML

    public static String escape(String value) {
        if (value == null) return "";
        StringBuilder sb = new StringBuilder(value.length() + 16);
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '&' -> sb.append("&amp;");
                case '<' -> sb.append("&lt;");
                case '>' -> sb.append("&gt;");
                case '"' -> sb.append("&quot;");
                case '\'' -> sb.append("&apos;");
                default -> {
                    // drop characters that are illegal in XML 1.0
                    if (c >= 0x20 || c == '\t' || c == '\n' || c == '\r') sb.append(c);
                }
            }
        }
        return sb.toString();
    }

    private static String attrs(Object... pairs) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            Object v = pairs[i + 1];
            if (v == null || v.toString().isEmpty()) continue;
            sb.append(' ').append(pairs[i]).append("=\"").append(escape(v.toString())).append('"');
        }
        return sb.toString();
    }

    private static String cdata(String text) {
        return "<![CDATA[" + (text == null ? "" : text.replace("]]>", "]]]]><![CDATA[>")) + "]]>";
    }

    private static String now() {
        return OffsetDateTime.now(ZoneOffset.UTC).format(TS);
    }

    /** OTA 2003/05 availability & rates response for one search, using published rates. */
    public static String vehAvailRateRS(ChannelSnapshot ch, QuoteRequest req, String echoToken) {
        String currency = ch.currency();
        List<QuoteLine> lines = quote(ch, req);
        StringBuilder x = new StringBuilder();
        x.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        x.append("<OTA_VehAvailRateRS xmlns=\"").append(OTA_NAMESPACE).append('"')
            .append(attrs("EchoToken", echoToken, "TimeStamp", now(), "Target", ch.isProduction() ? "Production" : "Test", "Version", "1.000"))
            .append(">\n");
        x.append("  <Success/>\n");
        if (lines.isEmpty()) {
            x.append("  <Warnings>\n    <Warning Type=\"3\"").append(attrs("ShortText",
                ch.publishedVersion() == 0 ? "No rates have been published for this channel"
                    : "No rate period covers " + req.pickUp().toLocalDate())).append("/>\n  </Warnings>\n");
        }
        x.append("  <VehAvailRSCore>\n");
        x.append("    <VehRentalCore").append(attrs("PickUpDateTime", req.pickUp().format(LOCAL), "ReturnDateTime", req.dropOff().format(LOCAL))).append(">\n");
        x.append("      <PickUpLocation").append(attrs("LocationCode", ch.locationCode())).append("/>\n");
        x.append("      <ReturnLocation").append(attrs("LocationCode", ch.locationCode())).append("/>\n");
        x.append("    </VehRentalCore>\n");
        x.append("    <VehVendorAvails>\n      <VehVendorAvail>\n");
        x.append("        <Vendor").append(attrs("Code", ch.vendorCode())).append(">NCT Rental</Vendor>\n");
        x.append("        <VehAvails>\n");
        for (QuoteLine l : lines) {
            x.append("          <VehAvail>\n");
            x.append("            <VehAvailCore").append(attrs("Status", l.status())).append(">\n");
            x.append("              <Vehicle").append(attrs("AirConditionInd", l.airCon(), "TransmissionType", l.transmission(), "Code", l.sippCode(), "CodeContext", "SIPP")).append(">\n");
            x.append("                <VehMakeModel").append(attrs("Name", l.model() + " or similar", "Code", l.sippCode())).append("/>\n");
            x.append("              </Vehicle>\n");
            if (!"Closed".equals(l.status())) {
                x.append("              <RentalRate>\n");
                x.append("                <RateDistance Unlimited=\"true\" DistUnitName=\"Km\" VehiclePeriodUnitName=\"RentalPeriod\"/>\n");
                x.append("                <VehicleCharges>\n");
                x.append("                  <VehicleCharge").append(attrs("Purpose", 1, "TaxInclusive", true, "IncludedInRate", false, "Amount", l.baseTotal().toPlainString(), "CurrencyCode", currency)).append(">\n");
                x.append("                    <Calculation").append(attrs("UnitCharge", l.dailyRate().toPlainString(), "UnitName", "Day", "Quantity", l.days())).append("/>\n");
                x.append("                  </VehicleCharge>\n");
                x.append("                </VehicleCharges>\n");
                x.append("                <RateQualifier").append(attrs("RateQualifier", l.planId(), "RatePeriod", "Daily")).append("/>\n");
                x.append("              </RentalRate>\n");
                x.append("              <TotalCharge").append(attrs("RateTotalAmount", l.baseTotal().toPlainString(), "EstimatedTotalAmount", l.total().toPlainString(), "CurrencyCode", currency)).append("/>\n");
                if (!l.extras().isEmpty()) {
                    x.append("              <PricedEquips>\n");
                    for (Map.Entry<Extra, BigDecimal> e : l.extras()) {
                        x.append("                <PricedEquip>\n");
                        x.append("                  <Equipment").append(attrs("EquipType", e.getKey().code(), "Quantity", 1)).append(">\n");
                        x.append("                    <Description>").append(escape(e.getKey().name())).append("</Description>\n");
                        x.append("                  </Equipment>\n");
                        x.append("                  <Charge").append(attrs("Amount", e.getValue().toPlainString(), "CurrencyCode", currency, "TaxInclusive", true, "IncludedInRate", false)).append(">\n");
                        x.append("                    <Calculation").append(attrs("UnitCharge", e.getKey().dailyPrice().toPlainString(), "UnitName", "Day", "Quantity", l.days())).append("/>\n");
                        x.append("                  </Charge>\n");
                        x.append("                </PricedEquip>\n");
                    }
                    x.append("              </PricedEquips>\n");
                }
            } else if (l.closedReason() != null) {
                x.append("              <!-- ").append(escape(l.closedReason()).replace("--", "- -")).append(" -->\n");
            }
            x.append("            </VehAvailCore>\n");
            x.append("          </VehAvail>\n");
        }
        x.append("        </VehAvails>\n      </VehVendorAvail>\n    </VehVendorAvails>\n  </VehAvailRSCore>\n");
        x.append("</OTA_VehAvailRateRS>");
        return x.toString();
    }

    /** Full published rate sheet (seasons × SIPP × length of rental) with extras, stop sales and terms. */
    public static String rateSheet(ChannelSnapshot ch) {
        StringBuilder x = new StringBuilder();
        int version = ch.publishedVersion();
        x.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        x.append("<RateSheet xmlns=\"").append(RATE_SHEET_NAMESPACE).append('"')
            .append(attrs("Supplier", ch.vendorCode(), "Channel", ch.channelCode().isBlank() ? ch.name() : ch.channelCode(),
                "Currency", ch.currency(), "Environment", ch.isProduction() ? "Production" : "Test",
                "Version", version > 0 ? version : null, "GeneratedAt", now()))
            .append(">\n");
        x.append("  <Location").append(attrs("Code", ch.locationCode())).append("/>\n");
        List<JsonNode> plans = ch.publishedRatePlans();
        if (plans.isEmpty()) x.append("  <!-- No rate periods published -->\n");
        x.append("  <Seasons>\n");
        for (JsonNode plan : plans) {
            x.append("    <Season").append(attrs("Code", plan.path("id").asText(), "Name", plan.path("name").asText(),
                "Start", plan.path("startDate").asText(), "End", plan.path("endDate").asText())).append(">\n");
            JsonNode rates = plan.get("sippRates");
            if (rates != null && rates.isArray()) {
                for (JsonNode rate : rates) {
                    String code = rate.path("sippCode").asText("").toUpperCase(Locale.ROOT);
                    List<JsonNode> vs = vehiclesForSipp(ch.fleet(), code);
                    JsonNode v = vs.isEmpty() ? null : vs.get(0);
                    x.append("      <VehicleGroup").append(attrs("SIPP", code,
                        "Model", v == null ? null : v.path("modelName").asText() + " or similar",
                        "Transmission", transmissionOf(v, code), "AirConditioning", sippAirCon(code))).append(">\n");
                    for (JsonNode t : sortedTiers(rate)) {
                        boolean open = isOpenEnded(t);
                        x.append("        <Rate").append(attrs("MinDays", t.path("fromDay").asInt(1),
                            "MaxDays", open ? null : t.get("toDay").asInt(),
                            "OpenEnded", open ? "true" : null,
                            "DailyAmount", money(t.path("dailyPrice").asDouble(0)).toPlainString())).append("/>\n");
                    }
                    x.append("      </VehicleGroup>\n");
                }
            }
            x.append("    </Season>\n");
        }
        x.append("  </Seasons>\n");
        x.append("  <Extras>\n");
        for (Extra e : extras(ch)) {
            x.append("    <Extra").append(attrs("Code", e.code(), "Name", e.name(), "DailyAmount", e.dailyPrice().toPlainString(),
                "MaxPerRental", e.maxPerRental() == null ? null : e.maxPerRental().toPlainString())).append("/>\n");
        }
        x.append("  </Extras>\n");
        x.append("  <StopSales>\n");
        String today = LocalDate.now(ZoneOffset.UTC).toString();
        for (JsonNode s : ch.stopSales()) {
            if (s.path("endDate").asText("").compareTo(today) < 0) continue;
            boolean vehicle = "vehicle".equals(s.path("type").asText());
            String target = s.path("target").asText();
            if (vehicle) {
                for (JsonNode v : ch.fleet()) {
                    if (target.equals(v.path("id").asText()) && !v.path("sippCode").asText("").isBlank()) target = v.path("sippCode").asText();
                }
            }
            x.append("    <StopSale").append(attrs("Type", vehicle ? "Vehicle" : "Category", "Target", target,
                "Start", s.path("startDate").asText(), "End", s.path("endDate").asText(), "Reason", s.path("reason").asText(""))).append("/>\n");
        }
        x.append("  </StopSales>\n");
        x.append("  <Terms>").append(cdata(ch.terms())).append("</Terms>\n");
        x.append("</RateSheet>");
        return x.toString();
    }

    public static String errorRS(String rootName, String code, String message, String echoToken) {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
            + "<" + rootName + " xmlns=\"" + OTA_NAMESPACE + "\"" + attrs("EchoToken", echoToken, "TimeStamp", now(), "Version", "1.000") + ">\n"
            + "  <Errors>\n"
            + "    <Error Type=\"3\"" + attrs("Code", code, "ShortText", message) + "/>\n"
            + "  </Errors>\n"
            + "</" + rootName + ">";
    }
}
