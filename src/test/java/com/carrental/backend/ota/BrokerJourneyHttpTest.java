package com.carrental.backend.ota;

import com.carrental.backend.model.User;
import com.carrental.backend.model.UserPermission;
import com.carrental.backend.model.UserStatus;
import com.carrental.backend.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * The whole broker journey over real HTTP against a running server, the way a broker such as Auto Europe connects:
 * staff set up the channel through the normal staff API, then the broker searches, books, retrieves, changes and
 * cancels in every format, and sends the kinds of broken requests real integrations send.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "jwt.secret=test-secret-key-that-is-long-enough-for-hmac-sha256",
    "stripe.secret.key=sk_test_dummy",
    "stripe.price.id=price_dummy",
    "spring.datasource.url=jdbc:h2:mem:broker-journey;DB_CLOSE_DELAY=-1"
})
class BrokerJourneyHttpTest {

    static final ObjectMapper M = new ObjectMapper();
    static final String KEY = "nct_journey-key-0123456789";
    static final String Y = OtaXmlTest.NEXT_YEAR;
    static final String OTA = "http://www.opentravel.org/OTA/2003/05";

    @LocalServerPort int port;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;

    final HttpClient http = HttpClient.newHttpClient();

    record Rs(int status, String body, String contentType) {}

    Rs call(String method, String path, String body, String contentType, String... headers) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (contentType != null) b.header("Content-Type", contentType);
        for (int i = 0; i + 1 < headers.length; i += 2) b.header(headers[i], headers[i + 1]);
        b.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
        HttpResponse<String> r = http.send(b.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        return new Rs(r.statusCode(), r.body(), r.headers().firstValue("Content-Type").orElse(""));
    }

    Rs ota(String message, String xml, String... headers) throws Exception {
        String[] h = new String[headers.length + 2];
        h[0] = "X-Api-Key"; h[1] = KEY;
        System.arraycopy(headers, 0, h, 2, headers.length);
        return call("POST", "/ota/v1/AEU/" + message, xml, "application/xml; charset=utf-8", h);
    }

    String staffLogin() throws Exception {
        User u = users.findByEmail("journey@nct.test").orElseGet(User::new);
        u.setEmail("journey@nct.test"); u.setFullName("Journey Admin"); u.setUsername("journey");
        u.setPassword(encoder.encode("Pass-12345")); u.setStatus(UserStatus.ACTIVE); u.setWebAppAccess(true);
        u.setPermissions(new ArrayList<>(List.of(UserPermission.VIEW_AGGREGATOR_SETUP, UserPermission.ACTION_ADMIN_MANAGE_FLEET, UserPermission.ACTION_ADMIN_MANAGE_LOCATIONS)));
        users.save(u);
        Rs r = call("POST", "/auth/login", "{\"email\":\"journey\",\"password\":\"Pass-12345\"}", "application/json");
        assertEquals(200, r.status(), r.body());
        return "Bearer " + M.readTree(r.body()).path("token").asText();
    }

    /** A realistic supplier set-up: three groups, two branches, four seasons with length-of-rental bands, published. */
    void setUpTheChannel(String auth) throws Exception {
        ArrayNode fleet = M.createArrayNode();
        String[][] cars = {
            {"c1", "Hyundai Accent", "Economy", "ECAR", "ECO-1"}, {"c2", "Hyundai Accent", "Economy", "ECAR", "ECO-2"},
            {"c3", "Toyota Corolla", "Standard", "SDAR", "STD-1"}, {"c4", "Kia Sportage", "SUV", "IFAR", "SUV-1"}};
        for (String[] c : cars) fleet.addObject().put("id", c[0]).put("modelName", c[1]).put("category", c[2]).put("sippCode", c[3])
            .put("transmission", "Automatic").put("licensePlate", c[4]).put("securityDeposit", 250).put("excess", 600)
            .put("seats", 5).put("doors", 4).put("imageUrl", "https://cdn.nct.example/" + c[0] + ".jpg");

        ObjectNode agg = M.createObjectNode();
        agg.put("id", "agg-aeu").put("name", "Auto Europe").put("channelCode", "AEU").put("vendorCode", "NCT").put("locationCode", "AMM")
            .put("currency", "USD").put("status", "active").put("commissionPercent", 20)
            .put("feedKeyHash", PartnerKeyVerifier.sha256Hex(KEY)).put("feedKeyHint", KEY.substring(KEY.length() - 4))
            .put("termsAndConditions", "Driver must hold a licence for 1 year. Deposit by credit card in the driver's name.");
        agg.putObject("connectionDetails").put("apiUrl", "").put("username", "").put("apiKey", "").put("environment", "production");
        agg.putArray("extras").addObject().put("id", "gps").put("name", "GPS").put("price", 8).put("otaEquipType", "13").put("maxPerRental", 40);
        agg.putArray("currentRatePlans");

        // Seasons and bands, as the rate builder makes them
        ArrayNode plans = M.createArrayNode();
        Object[][] seasons = {{"low", "Low season", "-01-01", "-02-28", 0.9}, {"high", "High season", "-03-01", "-05-31", 1.15},
            {"summer", "Summer", "-06-01", "-08-31", 1.1}, {"autumn", "Autumn", "-09-01", "-12-31", 1.0}};
        Object[][] base = {{"ECAR", 30.0}, {"SDAR", 40.0}, {"IFAR", 60.0}};
        int[][] bands = {{1, 2}, {3, 6}, {7, 13}, {14, 29}, {30, -1}};
        double[] off = {0, 0.05, 0.12, 0.2, 0.3};
        for (Object[] s : seasons) {
            ObjectNode p = plans.addObject().put("id", (String) s[0]).put("name", (String) s[1]).put("startDate", Y + s[2]).put("endDate", Y + s[3]);
            ArrayNode rates = p.putArray("sippRates");
            for (Object[] g : base) {
                ArrayNode tiers = rates.addObject().put("id", s[0] + "-" + g[0]).put("sippCode", (String) g[0]).putArray("tiers");
                for (int i = 0; i < bands.length; i++) {
                    ObjectNode t = tiers.addObject().put("id", s[0] + "-" + g[0] + "-" + i).put("fromDay", bands[i][0])
                        .put("dailyPrice", Math.round((Double) g[1] * (Double) s[4] * (1 - off[i]) * 100) / 100.0);
                    if (bands[i][1] < 0) t.putNull("toDay"); else t.put("toDay", bands[i][1]);
                }
            }
        }
        agg.putArray("ratePlanHistory").addObject().put("id", "sub-1").put("submittedAt", "2026-10-01T08:00:00Z").put("version", 1).set("ratePlans", plans);

        ObjectNode rules = agg.putObject("bookingRules");
        rules.put("minDriverAge", 21).put("freeCancellationHours", 48).put("lateCancellationFeePercent", 100).put("oneWayFee", 35);
        ArrayNode locs = rules.putArray("locations");
        ObjectNode amm = locs.addObject().put("code", "AMM").put("name", "Queen Alia Airport").put("type", "AIRPORT").put("pickup", true).put("dropOff", true)
            .put("address", "Queen Alia International Airport, Amman").put("phone", "+962 6 400 0000").put("latitude", 31.7226).put("longitude", 35.9932);
        ObjectNode aqj = locs.addObject().put("code", "AQJ").put("name", "Aqaba Branch").put("type", "CITY").put("pickup", true).put("dropOff", true)
            .put("address", "King Hussein St, Aqaba").put("phone", "+962 3 200 0000").put("latitude", 29.5321).put("longitude", 35.0063);
        for (String d : List.of("mon", "tue", "wed", "thu", "fri", "sat", "sun")) {
            amm.with("openingHours").putObject(d).put("open", "00:00").put("close", "23:59");
            aqj.with("openingHours").putObject(d).put("open", "08:00").put("close", "20:00");
        }
        rules.putObject("pricing").put("taxPercent", 16).put("taxIncluded", true).put("unlimitedMileage", true);

        ArrayNode branches = M.createArrayNode();
        branches.addObject().put("id", "l1").put("name", "Queen Alia Airport").put("address", "Queen Alia International Airport");
        branches.addObject().put("id", "l2").put("name", "Aqaba Branch").put("address", "King Hussein St, Aqaba");

        ObjectNode patch = M.createObjectNode();
        patch.putArray("ops")
            .add(M.createObjectNode().put("op", "set").put("key", "fleet").set("value", fleet))
            .add(M.createObjectNode().put("op", "set").put("key", "stopSales").set("value", M.createArrayNode()))
            .add(M.createObjectNode().put("op", "set").put("key", "rentalLocations").set("value", branches))
            .add(M.createObjectNode().put("op", "set").put("key", "reservations").set("value", M.createObjectNode()))
            .add(M.createObjectNode().put("op", "set").put("key", "aggregators").set("value", M.createArrayNode().add(agg)));
        Rs r = call("POST", "/api/state/patch", M.writeValueAsString(patch), "application/json", "Authorization", auth);
        assertEquals(200, r.status(), r.body());
    }

    static String avail(String echo, String from, String to, String pick, String ret) {
        return """
            <OTA_VehAvailRateRQ xmlns="%s" EchoToken="%s" Version="2.000">
              <POS><Source ISOCurrency="USD"><RequestorID Type="4" ID="AEU"/></Source></POS>
              <VehAvailRQCore Status="Available"><VehRentalCore PickUpDateTime="%s" ReturnDateTime="%s">
                <PickUpLocation LocationCode="%s"/><ReturnLocation LocationCode="%s"/></VehRentalCore>
                <DriverType Age="40"/></VehAvailRQCore>
            </OTA_VehAvailRateRQ>""".formatted(OTA, echo, from, to, pick, ret);
    }

    static String offerFor(String xml, String sipp) {
        int at = xml.indexOf("Code=\"" + sipp + "\"");
        assertTrue(at > 0, sipp + " offered: " + xml);
        int i = xml.indexOf("Type=\"16\" ID=\"OFF-", at);
        return xml.substring(i + 14, xml.indexOf('"', i + 14));
    }

    static String totalFor(String xml, String sipp) {
        int at = xml.indexOf("Code=\"" + sipp + "\"");
        int i = xml.indexOf("EstimatedTotalAmount=\"", at);
        return xml.substring(i + 22, xml.indexOf('"', i + 22));
    }

    static String attr(String xml, String prefix) {
        int i = xml.indexOf(prefix);
        assertTrue(i >= 0, prefix + " in " + xml);
        return xml.substring(i + prefix.length(), xml.indexOf('"', i + prefix.length()));
    }

    @Test
    void theWholeBrokerJourneyOverHttp() throws Exception {
        String auth = staffLogin();
        setUpTheChannel(auth);

        // 1. Connectivity, locations, location detail
        Rs ping = ota("OTA_Ping", "<OTA_PingRQ xmlns=\"" + OTA + "\" EchoToken=\"P1\"><EchoData>hello</EchoData></OTA_PingRQ>");
        assertEquals(200, ping.status(), ping.body());
        assertTrue(ping.contentType().startsWith("application/xml") || ping.contentType().startsWith("text/xml"), ping.contentType());
        assertTrue(ping.body().contains("<EchoData>hello</EchoData>"), ping.body());
        Rs locs = ota("OTA_VehLocSearch", "<OTA_VehLocSearchRQ xmlns=\"" + OTA + "\"/>");
        assertTrue(locs.body().contains("Code=\"AMM\"") && locs.body().contains("Code=\"AQJ\""), locs.body());
        Rs detail = ota("OTA_VehLocDetail", "<OTA_VehLocDetailRQ xmlns=\"" + OTA + "\"><Location LocationCode=\"AQJ\"/></OTA_VehLocDetailRQ>");
        assertEquals(200, detail.status(), detail.body());
        assertTrue(detail.body().contains("+962 3 200 0000"), detail.body());

        // 2. Availability: High season, 5 days → band 3–6 (5% off). ECAR 30 × 1.15 × 0.95 = 32.78 → 163.90
        Rs a = ota("OTA_VehAvailRate", avail("A1", Y + "-04-10T10:00:00", Y + "-04-15T10:00:00", "AMM", "AMM"));
        assertEquals(200, a.status(), a.body());
        OtaXmlTest.parse(a.body());
        assertEquals("163.90", totalFor(a.body(), "ECAR"), a.body());
        assertEquals("218.50", totalFor(a.body(), "SDAR"));   // 40 × 1.15 × 0.95 = 43.70
        assertEquals("327.75", totalFor(a.body(), "IFAR"));   // 60 × 1.15 × 0.95 = 65.55
        assertTrue(a.body().contains("EchoToken=\"A1\"") && a.body().contains("Version=\"2.000\""), a.body());
        // Long rental in Low season: 30 days → band 30+ (30% off). SDAR 40 × 0.9 × 0.7 = 25.20 → 756.00
        Rs longRent = ota("OTA_VehAvailRate", avail("A2", Y + "-01-05T10:00:00", Y + "-02-04T10:00:00", "AMM", "AMM"));
        assertEquals("756.00", totalFor(longRent.body(), "SDAR"), longRent.body());
        // One way AMM → AQJ adds the one-way fee: 2 days Summer ECAR 30 × 1.1 = 33 → 66 + 35
        Rs oneWay = ota("OTA_VehAvailRate", avail("A3", Y + "-07-01T10:00:00", Y + "-07-03T10:00:00", "AMM", "AQJ"));
        assertEquals("101.00", totalFor(oneWay.body(), "ECAR"), oneWay.body());

        // 3. Rate rules for the chosen offer
        String offer = offerFor(a.body(), "ECAR");
        Rs rr = ota("OTA_VehRateRule", "<OTA_VehRateRuleRQ xmlns=\"" + OTA + "\"><Reference Type=\"16\" ID=\"" + offer + "\"/></OTA_VehRateRuleRQ>");
        assertEquals(200, rr.status(), rr.body());

        // 4. Book (with a UTF-8 name), retry with the same key, both cars of the group can be booked, then sold out
        String res = """
            <OTA_VehResRQ xmlns="%s" EchoToken="R1" Version="2.000"><VehResRQCore>
              <Customer><Primary BirthDate="1984-03-02"><PersonName><GivenName>José</GivenName><Surname>Müller</Surname></PersonName>
                <Telephone PhoneNumber="+34600000000"/><Email>jose@example.com</Email></Primary></Customer></VehResRQCore>
              <VehResRQInfo><Reference Type="16" ID="%s"/><ArrivalDetails Number="RJ110"/>
                <TPA_Extensions><BrokerReference>%s</BrokerReference></TPA_Extensions></VehResRQInfo></OTA_VehResRQ>""";
        Rs booked = ota("OTA_VehRes", res.formatted(OTA, offer, "AE-1001"), "Idempotency-Key", "aeu-1001");
        assertEquals(200, booked.status(), booked.body());
        assertTrue(booked.body().contains("<ReservationStatus>CONFIRMED</ReservationStatus>"), booked.body());
        assertTrue(booked.body().contains("Müller"), "UTF-8 name kept: " + booked.body());
        String number = attr(booked.body(), "ConfID Type=\"14\" ID=\"");
        Rs retry = ota("OTA_VehRes", res.formatted(OTA, offer, "AE-1001"), "Idempotency-Key", "aeu-1001");
        assertTrue(retry.body().contains("ID=\"" + number + "\""), retry.body());

        String offer2 = offerFor(ota("OTA_VehAvailRate", avail("A4", Y + "-04-10T10:00:00", Y + "-04-15T10:00:00", "AMM", "AMM")).body(), "ECAR");
        Rs second = ota("OTA_VehRes", res.formatted(OTA, offer2, "AE-1002"), "Idempotency-Key", "aeu-1002");
        assertEquals(200, second.status(), second.body());
        Rs soldOut = ota("OTA_VehAvailRate", avail("A5", Y + "-04-11T10:00:00", Y + "-04-13T10:00:00", "AMM", "AMM"));
        String sb = soldOut.body();
        int ecar = sb.indexOf("Code=\"ECAR\"");
        assertTrue(ecar > 0, sb);
        String block = sb.substring(sb.lastIndexOf("<VehAvail>", ecar), sb.indexOf("</VehAvail>", ecar));
        assertTrue(block.contains("Status=\"Closed\"") || block.contains("Status=\"OnRequest\""), "both ECAR cars are booked: " + block);
        assertTrue(sb.substring(sb.lastIndexOf("<VehAvail>", sb.indexOf("Code=\"SDAR\"")), sb.indexOf("Code=\"SDAR\"")).contains("Status=\"Available\""), sb);

        // 5. Staff see both bookings: in Reservations (April, broker as source) and in the XML reservations list
        JsonNode state = M.readTree(call("GET", "/api/state", null, null, "Authorization", auth).body());
        JsonNode april = state.path("reservations").path(Y).path("April");
        assertEquals(2, april.size(), april.toString());
        assertTrue(april.toString().contains("José Müller"), april.toString());
        Rs list = call("GET", "/api/channels/agg-aeu/bookings", null, null, "Authorization", auth);
        assertEquals(200, list.status(), list.body());
        assertEquals(2, M.readTree(list.body()).size());

        // 6. Retrieve, modify (one more day: 6 days still band 3–6 → 196.68), cancel
        Rs ret = ota("OTA_VehRetRes", "<OTA_VehRetResRQ xmlns=\"" + OTA + "\"><VehRetResRQCore><UniqueID Type=\"16\" ID=\"AE-1001\"/>"
            + "<PersonName><Surname>Müller</Surname></PersonName></VehRetResRQCore></OTA_VehRetResRQ>");
        assertEquals(200, ret.status(), ret.body());
        assertTrue(ret.body().contains("ID=\"" + number + "\""), ret.body());
        Rs mod = ota("OTA_VehModify", "<OTA_VehModifyRQ xmlns=\"" + OTA + "\"><VehModifyRQCore ModifyType=\"Modify\"><UniqueID Type=\"14\" ID=\"" + number + "\"/>"
            + "<VehRentalCore PickUpDateTime=\"" + Y + "-04-10T10:00:00\" ReturnDateTime=\"" + Y + "-04-16T10:00:00\"/></VehModifyRQCore></OTA_VehModifyRQ>");
        assertEquals(200, mod.status(), mod.body());
        assertTrue(mod.body().contains("EstimatedTotalAmount=\"196.68\""), mod.body());
        Rs cancel = ota("OTA_VehCancel", "<OTA_VehCancelRQ xmlns=\"" + OTA + "\"><VehCancelRQCore CancelType=\"Cancel\"><UniqueID Type=\"14\" ID=\"" + number + "\"/>"
            + "<PersonName><Surname>Müller</Surname></PersonName></VehCancelRQCore></OTA_VehCancelRQ>");
        assertEquals(200, cancel.status(), cancel.body());
        assertTrue(cancel.body().contains("CancelStatus=\"Cancelled\""), cancel.body());

        // 7. SOAP with WSDL, native XML and REST reach the same bookings
        Rs wsdl = call("GET", "/ota/v1/AEU/soap?wsdl", null, null);
        assertEquals(200, wsdl.status());
        OtaXmlTest.parse(wsdl.body());
        String soap = "<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\"><soap:Body>"
            + avail("S1", Y + "-09-10T10:00:00", Y + "-09-12T10:00:00", "AQJ", "AQJ")
                .replace("<RequestorID Type=\"4\" ID=\"AEU\"/>", "<RequestorID Type=\"4\" ID=\"AEU\" MessagePassword=\"" + KEY + "\"/>")
            + "</soap:Body></soap:Envelope>";
        Rs s = call("POST", "/ota/v1/AEU/soap", soap, "text/xml; charset=utf-8", "SOAPAction", "OTA_VehAvailRate");
        assertEquals(200, s.status(), s.body());
        assertEquals("80.00", totalFor(s.body(), "SDAR"), s.body());   // Autumn, 2 days × 40

        Rs nat = call("POST", "/xml/v1/ReservationStatus", "<ReservationStatusRequest><Header><RequestID>N1</RequestID><ChannelCode>AEU</ChannelCode></Header>"
            + "<Credentials><ApiKey>" + KEY + "</ApiKey></Credentials><BrokerReference>AE-1002</BrokerReference></ReservationStatusRequest>", "application/xml");
        assertEquals(200, nat.status(), nat.body());
        assertTrue(nat.body().contains("<Status>CONFIRMED</Status>") || nat.body().contains(">CONFIRMED<"), nat.body());

        Rs rest = call("GET", "/partner/v1/AEU/reservations/AE-1002", null, null, "Authorization", "Bearer " + KEY);
        assertEquals(200, rest.status(), rest.body());
        assertEquals("CONFIRMED", M.readTree(rest.body()).path("reservation").path("status").asText(), rest.body());
        Rs groups = call("GET", "/partner/v1/AEU/vehicle-groups", null, null, "X-Api-Key", KEY);
        assertEquals(200, groups.status(), groups.body());
        assertEquals(3, M.readTree(groups.body()).path("vehicle_groups").size(), groups.body());
    }

    @Test
    void brokenRequestsGetAClearAnswerInTheirOwnFormat() throws Exception {
        setUpTheChannel(staffLogin());
        String good = avail("B1", Y + "-04-10T10:00:00", Y + "-04-12T10:00:00", "AMM", "AMM");

        // No key / wrong key / unknown channel
        Rs noKey = call("POST", "/ota/v1/AEU/OTA_VehAvailRate", good, "application/xml");
        assertEquals(401, noKey.status(), noKey.body());
        assertTrue(noKey.body().contains("AUTH_FAILED") && noKey.body().contains("<Errors>"), noKey.body());
        Rs unknown = call("POST", "/ota/v1/ZZZ/OTA_VehAvailRate", good, "application/xml", "X-Api-Key", KEY);
        assertTrue(unknown.status() == 401 || unknown.status() == 404, unknown.status() + " " + unknown.body());
        assertTrue(unknown.body().startsWith("<?xml") || unknown.body().contains("<OTA_"), "XML error, not an HTML page: " + unknown.body());

        // Empty body, not XML, unknown message, DOCTYPE (XXE), GET on a POST message
        for (Rs r : List.of(
                ota("OTA_VehAvailRate", ""),
                ota("OTA_VehAvailRate", "this is not xml"),
                ota("OTA_VehAvailRate", "<?xml version=\"1.0\"?><!DOCTYPE x [<!ENTITY e SYSTEM \"file:///etc/passwd\">]><OTA_VehAvailRateRQ>&e;</OTA_VehAvailRateRQ>"))) {
            assertEquals(400, r.status(), r.body());
            assertTrue(r.body().contains("<Errors>") && !r.body().contains("root:"), r.body());
        }
        Rs noSuch = ota("OTA_VehNoSuchThing", good);
        assertTrue(noSuch.status() == 400 || noSuch.status() == 404, noSuch.status() + " " + noSuch.body());
        assertTrue(noSuch.body().contains("<Errors>") || noSuch.body().contains("<Error"), "XML error for an unknown message: " + noSuch.body());

        // Wrong content type still answered (many broker systems send text/plain)
        Rs plain = call("POST", "/ota/v1/AEU/OTA_VehAvailRate", good, "text/plain", "X-Api-Key", KEY);
        assertEquals(200, plain.status(), plain.body());

        // Bad dates and an unknown location
        Rs past = ota("OTA_VehAvailRate", avail("B2", "2020-01-01T10:00:00", "2020-01-03T10:00:00", "AMM", "AMM"));
        assertEquals(400, past.status(), past.body());
        Rs loc = ota("OTA_VehAvailRate", avail("B3", Y + "-04-10T10:00:00", Y + "-04-12T10:00:00", "XXX", "XXX"));
        assertEquals(400, loc.status(), loc.body());
        assertTrue(loc.body().contains("INVALID_LOCATION"), loc.body());

        // No rates loaded for the dates (the seasons start on 1 January next year)
        String before = (Integer.parseInt(Y) - 1) + "-12-";
        Rs none = ota("OTA_VehAvailRate", avail("B4", before + "20T10:00:00", before + "22T10:00:00", "AMM", "AMM"));
        assertTrue(none.status() == 200 || none.status() == 409, none.status() + " " + none.body());
        assertTrue(none.body().contains("<Warning Type=\"3\" ShortText=\"No rates are published for ") && none.body().contains("<VehAvails>"), none.body());

        // REST: malformed JSON answered as JSON
        Rs badJson = call("POST", "/partner/v1/AEU/reservations", "{not json", "application/json", "X-Api-Key", KEY);
        assertEquals(400, badJson.status(), badJson.body());
        assertTrue(badJson.body().trim().startsWith("{") && badJson.body().contains("error_code"), badJson.body());
    }
}
