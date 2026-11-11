package com.carrental.backend.ota;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** The same cases as the website's __tests__/services/dynamicPricing.test.ts. */
class ChannelDynamicPricingTest {

    static final ObjectMapper M = new ObjectMapper();
    static final String EID = "{\"name\":\"Eid Al-Fitr\",\"kind\":\"eid_fitr\",\"from\":\"2027-03-10\",\"to\":\"2027-03-12\",\"priority\":1,\"active\":true,\"adjust\":{\"type\":\"fixed\",\"value\":45}}";
    static final String HIGH = "{\"name\":\"High season\",\"kind\":\"high\",\"from\":\"2027-03-05\",\"to\":\"2027-03-20\",\"priority\":2,\"active\":true,\"adjust\":{\"type\":\"fixed\",\"value\":40}}";
    static final String LAST_MINUTE = "{\"enabled\":true,\"channels\":[],\"tiers\":[{\"fromHours\":0,\"toHours\":24,\"adjust\":{\"type\":\"percent\",\"value\":%s}},"
        + "{\"fromHours\":24,\"toHours\":null,\"adjust\":{\"type\":\"none\",\"value\":0}}]}";

    static JsonNode cfg(String json) throws Exception { return M.readTree(json); }
    static LocalDateTime at(String s) { return LocalDateTime.parse(s); }
    static String lm(int pct) { return LAST_MINUTE.formatted(pct); }

    static ChannelDynamicPricing.Result price(JsonNode cfg, String pickup, String ret, String now, double base, String mode) {
        return ChannelDynamicPricing.price(cfg, "ECMR", "AMM", "broker", at(pickup), at(ret), at(now), (d, n) -> base, 0, mode);
    }

    @Test
    void test1EidOnlyOnTheEidDays() throws Exception {
        var r = price(cfg("{\"seasonal\":{\"enabled\":true,\"rules\":[" + EID + "]}}"), "2027-03-01T10:00", "2027-03-12T12:00", "2027-01-01T10:00", 30, "dynamic");
        assertEquals(12, r.days());
        assertEquals(405.0, r.total());
        assertEquals(9, r.perDay().stream().filter(d -> d.rate() == 30).count());
        assertEquals("Eid Al-Fitr", r.perDay().get(9).rule());
        assertEquals("9 days × 30.00, 3 days × 45.00 (Eid Al-Fitr)", ChannelDynamicPricing.summary(r.perDay()));
    }

    @Test
    void test2EidReplacesHighSeason() throws Exception {
        var r = price(cfg("{\"seasonal\":{\"enabled\":true,\"rules\":[" + HIGH + "," + EID + "]}}"), "2027-03-05T10:00", "2027-03-13T09:00", "2027-01-01T10:00", 30, "dynamic");
        assertEquals(8, r.days());
        assertEquals(5 * 40 + 3 * 45, r.total());
    }

    @Test
    void percentageSeasonsHigherPriorityWinsAndNoDoubleCounting() throws Exception {
        String high50 = "{\"name\":\"High +50%\",\"kind\":\"high\",\"from\":\"2027-03-10\",\"to\":\"2027-03-12\",\"priority\":2,\"adjust\":{\"type\":\"percent\",\"value\":50}}";
        assertEquals(405.0, price(cfg("{\"seasonal\":{\"enabled\":true,\"rules\":[" + high50 + "]}}"), "2027-03-01T10:00", "2027-03-12T12:00", "2027-01-01T10:00", 30, "dynamic").total());
        String high40 = "{\"name\":\"High\",\"kind\":\"high\",\"from\":\"2027-03-01\",\"to\":\"2027-03-31\",\"priority\":2,\"adjust\":{\"type\":\"percent\",\"value\":40}}";
        String eid50 = "{\"name\":\"Eid\",\"kind\":\"eid_fitr\",\"from\":\"2027-03-10\",\"to\":\"2027-03-12\",\"priority\":1,\"adjust\":{\"type\":\"percent\",\"value\":50}}";
        assertEquals(9 * 42 + 3 * 45, price(cfg("{\"seasonal\":{\"enabled\":true,\"rules\":[" + high40 + "," + eid50 + "]}}"), "2027-03-01T10:00", "2027-03-12T12:00", "2027-01-01T10:00", 30, "dynamic").total());
        // Eid +50% then last minute +20%: 30 × 1.5 × 1.2 = 54
        JsonNode c = cfg("{\"seasonal\":{\"enabled\":true,\"rules\":[" + eid50 + "]},\"leadTime\":" + lm(20) + "}");
        assertEquals(54.0, price(c, "2027-03-10T10:00", "2027-03-11T10:00", "2027-03-10T08:00", 30, "dynamic").total());
        String web = "{\"name\":\"Web\",\"from\":\"2027-03-10\",\"to\":\"2027-03-10\",\"priority\":1,\"channels\":[\"website\"],\"adjust\":{\"type\":\"percent\",\"value\":-10}}";
        JsonNode w = cfg("{\"seasonal\":{\"enabled\":true,\"rules\":[" + web + "]}}");
        assertEquals(27.0, ChannelDynamicPricing.price(w, "ECMR", "AMM", "website", at("2027-03-10T10:00"), at("2027-03-11T10:00"), at("2027-01-01T10:00"), (d, n) -> 30.0, 0, "dynamic").total());
        assertEquals(30.0, price(w, "2027-03-10T10:00", "2027-03-11T10:00", "2027-01-01T10:00", 30, "dynamic").total());
    }

    @Test
    void stackingOnlyWhenSwitchedOn() throws Exception {
        String plus = "{\"name\":\"Festival\",\"from\":\"2027-03-10\",\"to\":\"2027-03-10\",\"priority\":3,\"adjust\":{\"type\":\"percent\",\"value\":10}}";
        assertEquals(45.0, price(cfg("{\"seasonal\":{\"enabled\":true,\"rules\":[" + EID + "," + plus + "]}}"), "2027-03-10T10:00", "2027-03-11T10:00", "2027-01-01T10:00", 30, "dynamic").total());
        assertEquals(49.5, price(cfg("{\"seasonal\":{\"enabled\":true,\"stack\":true,\"rules\":[" + EID + "," + plus + "]}}"), "2027-03-10T10:00", "2027-03-11T10:00", "2027-01-01T10:00", 30, "dynamic").total());
    }

    @Test
    void test3And4LastMinute() throws Exception {
        assertEquals(27.0, price(cfg("{\"leadTime\":" + lm(-10) + "}"), "2027-03-01T20:00", "2027-03-02T20:00", "2027-03-01T08:00", 30, "dynamic").total());
        assertEquals(30.0, price(cfg("{\"leadTime\":" + lm(-10) + "}"), "2027-03-01T20:00", "2027-03-02T20:00", "2027-02-01T08:00", 30, "dynamic").total());
        JsonNode c = cfg("{\"seasonal\":{\"enabled\":true,\"rules\":[" + EID + "]},\"leadTime\":" + lm(20) + "}");
        assertEquals(54.0, price(c, "2027-03-10T20:00", "2027-03-11T20:00", "2027-03-10T08:00", 30, "dynamic").total());
        JsonNode capped = cfg("{\"seasonal\":{\"enabled\":true,\"rules\":[" + EID + "]},\"leadTime\":" + lm(20) + ",\"limits\":{\"maxDaily\":50}}");
        assertEquals(50.0, price(capped, "2027-03-10T20:00", "2027-03-11T20:00", "2027-03-10T08:00", 30, "dynamic").total());
    }

    @Test
    void lastMinuteByRentalLength() throws Exception {
        JsonNode c = cfg("{\"leadTime\":{\"enabled\":true,\"lengthBands\":[{\"fromDay\":1,\"toDay\":2},{\"fromDay\":3,\"toDay\":6},{\"fromDay\":7,\"toDay\":null}],"
            + "\"tiers\":[{\"fromHours\":0,\"toHours\":24,\"adjust\":{\"type\":\"none\"},\"byLength\":[{\"type\":\"percent\",\"value\":20},{\"type\":\"percent\",\"value\":10},{\"type\":\"amount\",\"value\":-5}]}]}}");
        assertEquals(72.0, price(c, "2027-03-01T10:00", "2027-03-03T10:00", "2027-03-01T08:00", 30, "dynamic").total());   // 2 × 36
        assertEquals(132.0, price(c, "2027-03-01T10:00", "2027-03-05T10:00", "2027-03-01T08:00", 30, "dynamic").total());  // 4 × 33
        assertEquals(250.0, price(c, "2027-03-01T10:00", "2027-03-11T10:00", "2027-03-01T08:00", 30, "dynamic").total());  // 10 × 25
        assertEquals(60.0, price(c, "2027-03-01T10:00", "2027-03-03T10:00", "2027-02-01T08:00", 30, "dynamic").total());   // booked early
    }

    @Test
    void test5NoDoubleCounting() throws Exception {
        JsonNode c = cfg("{\"seasonal\":{\"enabled\":true,\"rules\":[" + HIGH + "," + EID + "]},\"leadTime\":" + lm(20) + "}");
        assertEquals(54.0, price(c, "2027-03-11T10:00", "2027-03-12T10:00", "2027-03-11T08:00", 30, "dynamic").total());
    }

    @Test
    void test6NetAndRestrictedModes() throws Exception {
        JsonNode c = cfg("{\"seasonal\":{\"enabled\":true,\"rules\":[" + EID + "]},\"leadTime\":" + lm(20) + "}");
        assertEquals(25.0, price(c, "2027-03-10T10:00", "2027-03-11T10:00", "2027-01-01T10:00", 25, "net").total());
        assertEquals(45.0, price(c, "2027-03-10T10:00", "2027-03-11T10:00", "2027-03-10T08:00", 30, "restricted").total());
        assertFalse(ChannelDynamicPricing.leadTimeActive(c, "broker", "restricted"));
        assertTrue(ChannelDynamicPricing.leadTimeActive(c, "broker", "dynamic"));
    }

    @Test
    void scopesBlackoutMinDaysPausedAndLimits() throws Exception {
        for (String extra : List.of(",\"groups\":[\"SDAR\"]", ",\"locations\":[\"AQJ\"]", ",\"channels\":[\"ota\"]", ",\"blackout\":[\"2027-03-10\"]", ",\"minDays\":3", ",\"active\":false")) {
            String rule = EID.substring(0, EID.length() - 1).replace(",\"active\":true", "") + extra + "}";
            assertEquals(30.0, price(cfg("{\"seasonal\":{\"enabled\":true,\"rules\":[" + rule + "]}}"), "2027-03-10T10:00", "2027-03-11T10:00", "2027-01-01T10:00", 30, "dynamic").total(), extra);
        }
        JsonNode low = cfg("{\"seasonal\":{\"enabled\":true,\"rules\":[{\"name\":\"Low\",\"from\":\"2027-01-01\",\"to\":\"2027-12-31\",\"priority\":5,\"adjust\":{\"type\":\"fixed\",\"value\":15}}]},\"limits\":{\"minDaily\":20}}");
        assertEquals(20.0, price(low, "2027-04-01T10:00", "2027-04-02T10:00", "2027-01-01T10:00", 30, "dynamic").total());
    }
}
