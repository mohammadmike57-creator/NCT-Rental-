package com.carrental.backend.ota;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Read-only view of one distribution channel ("aggregator") taken from the
 * application state document, together with the fleet and stop sales it needs.
 * Field names mirror the frontend types in types.ts.
 */
public class ChannelSnapshot {

    private final JsonNode channel;
    private final JsonNode fleet;
    private final JsonNode stopSales;
    private final String companyName;

    public ChannelSnapshot(JsonNode channel, JsonNode fleet, JsonNode stopSales) { this(channel, fleet, stopSales, null); }

    public ChannelSnapshot(JsonNode channel, JsonNode fleet, JsonNode stopSales, String companyName) {
        this.channel = channel;
        this.companyName = companyName;
        this.fleet = fleet == null || !fleet.isArray() ? com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode() : fleet;
        this.stopSales = forChannel(stopSales, text(channel, "id", ""));
    }

    /** Stop sales for every channel, plus those that name this channel in channelIds. */
    static JsonNode forChannel(JsonNode stopSales, String channelId) {
        var out = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode();
        if (stopSales == null || !stopSales.isArray()) return out;
        for (JsonNode s : stopSales) {
            JsonNode ids = s.get("channelIds");
            boolean all = ids == null || !ids.isArray() || ids.isEmpty();
            boolean named = false;
            if (!all) for (JsonNode id : ids) if (channelId.equals(id.asText())) { named = true; break; }
            if (all || named) out.add(s);
        }
        return out;
    }

    public JsonNode raw() { return channel; }
    public JsonNode fleet() { return fleet; }
    public JsonNode stopSales() { return stopSales; }

    public String id() { return text(channel, "id", ""); }
    public String name() { return text(channel, "name", id()); }
    public String channelCode() { return text(channel, "channelCode", ""); }
    /** Supplier name used when a channel has none of its own; brokers never see the NCT name. */
    public static final String DEFAULT_SUPPLIER = "UR-Drive Jordan";

    /** The supplier name brokers see (Vendor): the channel's own, else the company name, else UR-Drive Jordan. */
    public String vendorName() {
        String own = text(channel, "vendorName", "");
        if (!own.isBlank()) return own;
        String company = companyName == null ? "" : companyName.trim();
        return company.isBlank() || company.toUpperCase(Locale.ROOT).contains("NCT") ? DEFAULT_SUPPLIER : company;
    }
    /** Supplier code brokers see (OTA Vendor@Code); URD when the channel has none of its own, never the system name. */
    public String vendorCode() { return text(channel, "vendorCode", "URD").toUpperCase(Locale.ROOT); }

    /** First three letters or digits of a name: "UR-Drive Jordan" gives URD. */
    public static String codeFromName(String name) {
        String c = (name == null ? "" : name).toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        return c.length() > 3 ? c.substring(0, 3) : c;
    }

    /** First letter of each word: "UR-Drive Jordan" gives UDJ. */
    public static String initials(String name) {
        StringBuilder b = new StringBuilder();
        for (String w : (name == null ? "" : name).toUpperCase(Locale.ROOT).split("[^A-Z0-9]+")) if (!w.isEmpty()) b.append(w.charAt(0));
        return b.toString();
    }

    /**
     * Vendor codes a broker may use for this supplier: the channel's code (URD when none is set), NCT (still accepted
     * from brokers set up with it earlier), and the codes made from the supplier name (URD and UDJ for UR-Drive Jordan).
     */
    public java.util.Set<String> acceptedVendorCodes() {
        java.util.Set<String> out = new java.util.LinkedHashSet<>();
        out.add(vendorCode());
        out.add("NCT");
        String name = vendorName();
        if (codeFromName(name).length() >= 2) out.add(codeFromName(name));
        if (initials(name).length() >= 2) out.add(initials(name));
        return out;
    }

    /** The code to answer with: the one the broker used when it is one of ours, else the channel's code. */
    public String vendorCodeFor(String requested) {
        String r = requested == null ? "" : requested.trim().toUpperCase(Locale.ROOT);
        return !r.isEmpty() && acceptedVendorCodes().contains(r) ? r : vendorCode();
    }
    /**
     * True when the channel receives the strict OpenTravel layout, valid against the official 2017B schemas
     * (otaProfile = "standard"; the default for channels set up from now on). Channels connected before keep the
     * layout their broker was built against ("compatible") until it is switched in the console.
     */
    /** Coverage codes the broker gave for our covers (our code -> OTA coverage type), set in the console. */
    public java.util.Map<String, String> otaCoverageCodes() {
        java.util.Map<String, String> out = new java.util.HashMap<>();
        channel.path("bookingRules").path("otaCodes").path("coverages").fields()
            .forEachRemaining(e -> out.put(e.getKey().trim().toUpperCase(Locale.ROOT), e.getValue().asText("").trim()));
        return out;
    }
    public boolean otaStandard() { return "standard".equalsIgnoreCase(text(channel, "otaProfile", "")); }
    public String locationCode() { return text(channel, "locationCode", "AMM").toUpperCase(Locale.ROOT); }
    public String currency() { return text(channel, "currency", "USD"); }
    public String status() { return text(channel, "status", "active"); }
    public String terms() { return text(channel, "termsAndConditions", ""); }
    public String feedKeyHash() { return text(channel, "feedKeyHash", ""); }
    /** A second key that only ever works in the sandbox, for the broker's test system. */
    public String testKeyHash() { return text(channel, "testKeyHash", ""); }
    /** The key that was replaced, still accepted until previousKeyExpiresAt so the broker can switch without downtime. */
    public String previousKeyHash() { return text(channel, "previousKeyHash", ""); }
    public java.time.Instant previousKeyExpiresAt() {
        try { return java.time.Instant.parse(text(channel, "previousKeyExpiresAt", "")); } catch (Exception e) { return null; }
    }

    public JsonNode connection() {
        JsonNode c = channel.get("connectionDetails");
        return c == null ? com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode() : c;
    }

    public String environment() { return text(connection(), "environment", "production"); }
    public boolean isProduction() { return !"test".equalsIgnoreCase(environment()); }
    public String endpointUrl() { return text(connection(), "apiUrl", "").trim(); }
    public String username() { return text(connection(), "username", ""); }
    public String apiKey() { return text(connection(), "apiKey", ""); }

    public int timeoutSeconds() {
        JsonNode t = connection().get("timeoutSeconds");
        int v = t != null && t.isNumber() ? t.asInt() : 30;
        return Math.max(5, Math.min(120, v));
    }

    public JsonNode extras() {
        JsonNode e = channel.get("extras");
        return e != null && e.isArray() ? e : com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode();
    }

    /** Latest published submission (ratePlanHistory[0]) or null when never published. */
    public JsonNode latestSubmission() {
        JsonNode h = channel.get("ratePlanHistory");
        return h != null && h.isArray() && h.size() > 0 ? h.get(0) : null;
    }

    /** Rate plans partners are allowed to see: only what was published. */
    public List<JsonNode> publishedRatePlans() {
        List<JsonNode> plans = new ArrayList<>();
        JsonNode sub = latestSubmission();
        if (sub != null && sub.get("ratePlans") != null && sub.get("ratePlans").isArray()) {
            sub.get("ratePlans").forEach(plans::add);
        }
        plans.sort((a, b) -> text(a, "startDate", "").compareTo(text(b, "startDate", "")));
        return plans;
    }

    public int publishedVersion() {
        JsonNode sub = latestSubmission();
        if (sub == null) return 0;
        JsonNode v = sub.get("version");
        if (v != null && v.isNumber()) return v.asInt();
        JsonNode h = channel.get("ratePlanHistory");
        return h == null ? 0 : h.size();
    }

    /** The partner-facing code used in URLs: channel code when set, otherwise the internal id. */
    public String urlCode() {
        return channelCode().isBlank() ? id() : channelCode();
    }

    static String text(JsonNode node, String field, String fallback) {
        if (node == null) return fallback;
        JsonNode v = node.get(field);
        if (v == null || v.isNull()) return fallback;
        String s = v.asText();
        return s == null || s.isBlank() ? fallback : s;
    }
}
