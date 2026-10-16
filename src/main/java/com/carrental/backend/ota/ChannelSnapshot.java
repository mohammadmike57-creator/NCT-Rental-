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

    public ChannelSnapshot(JsonNode channel, JsonNode fleet, JsonNode stopSales) {
        this.channel = channel;
        this.fleet = fleet == null || !fleet.isArray() ? com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode() : fleet;
        this.stopSales = stopSales == null || !stopSales.isArray() ? com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode() : stopSales;
    }

    public JsonNode raw() { return channel; }
    public JsonNode fleet() { return fleet; }
    public JsonNode stopSales() { return stopSales; }

    public String id() { return text(channel, "id", ""); }
    public String name() { return text(channel, "name", id()); }
    public String channelCode() { return text(channel, "channelCode", ""); }
    public String vendorCode() { return text(channel, "vendorCode", "NCT").toUpperCase(Locale.ROOT); }
    public String locationCode() { return text(channel, "locationCode", "AMM").toUpperCase(Locale.ROOT); }
    public String currency() { return text(channel, "currency", "USD"); }
    public String status() { return text(channel, "status", "active"); }
    public String terms() { return text(channel, "termsAndConditions", ""); }
    public String feedKeyHash() { return text(channel, "feedKeyHash", ""); }

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
