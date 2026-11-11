package com.carrental.backend.ota;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ChannelSnapshotStopSaleTest {

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void stopSalesForAllChannelsAndForThisChannelOnly() throws Exception {
        var stops = json.readTree("""
            [{"id":"all","type":"category","target":"SUV","startDate":"2026-12-20","endDate":"2026-12-31"},
             {"id":"empty","type":"category","target":"SUV","startDate":"2026-12-20","endDate":"2026-12-31","channelIds":[]},
             {"id":"bkg","type":"category","target":"SUV","startDate":"2026-12-20","endDate":"2026-12-31","channelIds":["agg-bkg"]},
             {"id":"exp","type":"category","target":"SUV","startDate":"2026-12-20","endDate":"2026-12-31","channelIds":["agg-exp","agg-kyk"]}]
            """);
        var bkg = new ChannelSnapshot(json.readTree("{\"id\":\"agg-bkg\"}"), null, stops);
        var kyk = new ChannelSnapshot(json.readTree("{\"id\":\"agg-kyk\"}"), null, stops);
        var other = new ChannelSnapshot(json.readTree("{\"id\":\"agg-other\"}"), null, stops);
        assertEquals("[all, empty, bkg]", ids(bkg));
        assertEquals("[all, empty, exp]", ids(kyk));
        assertEquals("[all, empty]", ids(other));
        assertEquals(0, new ChannelSnapshot(json.readTree("{\"id\":\"x\"}"), null, null).stopSales().size());
    }

    private static String ids(ChannelSnapshot s) {
        var out = new java.util.ArrayList<String>();
        s.stopSales().forEach(n -> out.add(n.path("id").asText()));
        return out.toString();
    }
}
