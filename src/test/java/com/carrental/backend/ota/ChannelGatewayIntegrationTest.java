package com.carrental.backend.ota;

import com.carrental.backend.model.User;
import com.carrental.backend.model.UserPermission;
import com.carrental.backend.model.UserStatus;
import com.carrental.backend.repository.UserRepository;
import com.carrental.backend.security.JwtUtil;
import com.carrental.backend.service.StateService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.util.List;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
    "jwt.secret=test-secret-key-that-is-long-enough-for-hmac-sha256",
    "stripe.secret.key=sk_test_dummy",
    "stripe.price.id=price_dummy",
    "spring.datasource.url=jdbc:h2:mem:gateway-it;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class ChannelGatewayIntegrationTest {

    static final ObjectMapper M = new ObjectMapper();
    static final String KEY = "secret-key";
    static final String Y = OtaXmlTest.NEXT_YEAR;

    @Autowired MockMvc mvc;
    @Autowired StateService stateService;
    @Autowired ChannelBookingRepository bookings;
    @Autowired ChannelOfferRepository offers;
    @Autowired ChannelWebhookRepository webhooks;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;
    @Autowired JwtUtil jwt;

    @BeforeEach
    void seed() throws Exception {
        webhooks.deleteAll();
        bookings.deleteAll();
        offers.deleteAll();
        seedChannel("active", "production");
    }

    void seedChannel(String status, String env) throws Exception {
        ObjectNode state = (ObjectNode) OtaXmlTest.state(PartnerKeyVerifier.sha256Hex(KEY));
        ((ObjectNode) state.get("fleet").get(0)).put("licensePlate", "SD-1").put("securityDeposit", 200).put("excess", 500).put("imageUrl", "/api/media/corolla");
        ((ObjectNode) state.get("fleet").get(1)).put("imageUrl", "https://cdn.example.com/sportage.jpg");
        ObjectNode agg = (ObjectNode) state.get("aggregators").get(0);
        agg.put("status", status);
        ((ObjectNode) agg.get("connectionDetails")).put("environment", env);
        ObjectNode rules = agg.putObject("bookingRules");
        rules.put("webhookUrl", "https://hooks.partner.example/nct");
        rules.put("freeCancellationHours", 48).put("lateCancellationFeePercent", 100);
        ArrayNode locs = rules.putArray("locations");
        ObjectNode amm = locs.addObject().put("code", "AMM").put("name", "Airport Office").put("type", "AIRPORT")
            .put("phone", "+962 6 400 0000").put("latitude", 31.7226).put("longitude", 35.9932);
        ObjectNode aqj = locs.addObject().put("code", "AQJ").put("name", "Aqaba Branch").put("phone", "+962 3 200 0000")
            .put("latitude", 29.5321).put("longitude", 35.0063);
        for (String d : List.of("mon", "tue", "wed", "thu", "fri", "sat", "sun")) {
            amm.with("openingHours").putObject(d).put("open", "06:00").put("close", "23:00");
            aqj.with("openingHours").putObject(d).put("open", "08:00").put("close", "20:00");
        }
        rules.put("oneWayFee", 30);
        stateService.applyPatch(M.writeValueAsString(M.createObjectNode().set("ops", M.createArrayNode()
            .add(M.createObjectNode().put("op", "set").put("key", "fleet").set("value", state.get("fleet")))
            .add(M.createObjectNode().put("op", "set").put("key", "stopSales").set("value", state.get("stopSales")))
            .add(M.createObjectNode().put("op", "set").put("key", "aggregators").set("value", state.get("aggregators")))
            .add(M.createObjectNode().put("op", "set").put("key", "reservations").set("value", M.createObjectNode()))
            .add(M.createObjectNode().put("op", "set").put("key", "rentalLocations").set("value",
                M.readTree("[{\"id\":\"l1\",\"name\":\"Airport Office\",\"address\":\"Queen Alia Airport\"}]"))))));
    }

    static String avail(String echo) {
        return """
            <OTA_VehAvailRateRQ xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="%s">
              <VehAvailRQCore><VehRentalCore PickUpDateTime="%s-05-01T10:00:00" ReturnDateTime="%s-05-06T10:00:00">
                <PickUpLocation LocationCode="AMM"/><ReturnLocation LocationCode="AMM"/></VehRentalCore>
                <DriverType Age="35"/></VehAvailRQCore>
              <SpecialEquipPrefs><SpecialEquipPref EquipType="13" Quantity="1"/></SpecialEquipPrefs>
            </OTA_VehAvailRateRQ>""".formatted(echo, Y, Y);
    }

    static String vehRes(String offer, String ref) {
        return """
            <OTA_VehResRQ xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="R1">
              <VehResRQCore>
                <Customer><Primary BirthDate="1990-05-01"><PersonName><GivenName>John</GivenName><Surname>Doe</Surname></PersonName>
                  <Telephone PhoneNumber="+962790000000"/><Email>john@example.com</Email><Address><CountryName Code="JO"/></Address>
                  <Document DocID="JO123456" DocType="4" DocIssueCountry="JO"/></Primary></Customer>
              </VehResRQCore>
              <VehResRQInfo><Reference Type="16" ID="%s"/><ArrivalDetails Number="RJ101"/>
                <TPA_Extensions><BrokerReference>%s</BrokerReference></TPA_Extensions></VehResRQInfo>
            </OTA_VehResRQ>""".formatted(offer, ref);
    }

    String firstOffer(String xml) {
        int i = xml.indexOf("Type=\"16\" ID=\"OFF-");
        assertTrue(i > 0, "offer id in response");
        return xml.substring(i + 14, xml.indexOf('"', i + 14));
    }

    String send(String path, String body, String... headers) throws Exception {
        var rq = post(path).contentType(MediaType.APPLICATION_XML).content(body).header("X-Api-Key", KEY);
        for (int i = 0; i + 1 < headers.length; i += 2) rq = rq.header(headers[i], headers[i + 1]);
        return mvc.perform(rq).andReturn().getResponse().getContentAsString();
    }

    /** Changes the channel's booking rules (and the channel itself) in the stored state. */
    void rules(java.util.function.BiConsumer<ObjectNode, ObjectNode> change) throws Exception {
        ArrayNode aggs = (ArrayNode) M.readTree(stateService.getFullState()).path("aggregators");
        ObjectNode agg = (ObjectNode) aggs.get(0);
        change.accept(agg, (ObjectNode) agg.get("bookingRules"));
        stateService.applyPatch(M.writeValueAsString(M.createObjectNode().set("ops", M.createArrayNode()
            .add(M.createObjectNode().put("op", "set").put("key", "aggregators").set("value", aggs)))));
    }

    String staffToken() {
        User u = users.findByEmail("cert@nct.test").orElseGet(User::new);
        u.setEmail("cert@nct.test"); u.setFullName("Cert Admin"); u.setUsername("cert"); u.setPassword(encoder.encode("Pass-12345"));
        u.setStatus(UserStatus.ACTIVE); u.setWebAppAccess(true); u.setPermissions(new java.util.ArrayList<>(List.of(UserPermission.VIEW_AGGREGATOR_SETUP)));
        users.save(u);
        return "Bearer " + jwt.generateToken("cert@nct.test");
    }

    JsonNode reservations() throws Exception {
        return M.readTree(stateService.getFullState()).path("reservations");
    }

    @Test
    void otaSearchBookRetrieveModifyCancel() throws Exception {
        // Locations
        mvc.perform(post("/ota/v1/BKG/OTA_VehLocSearch").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_XML).content("<OTA_VehLocSearchRQ/>"))
            .andExpect(status().isOk()).andExpect(content().string(containsString("Code=\"AQJ\"")));

        // Availability: live count, offer id, price 5 × 40 + GPS capped at 25
        String a = send("/ota/v1/BKG/OTA_VehAvailRate", avail("A1"));
        assertTrue(a.contains("EstimatedTotalAmount=\"225.00\""), a);
        assertTrue(a.contains("<Availability Count=\"1\""), a);
        String offer = firstOffer(a);

        // Book from the offer
        String r = send("/ota/v1/BKG/OTA_VehRes", vehRes(offer, "VOUCHER-1"), "Idempotency-Key", "idem-1");
        assertTrue(r.contains("<Success/>"), r);
        assertTrue(r.contains("ConfID Type=\"14\" ID=\"RSV-"), r);
        assertTrue(r.contains("ID=\"VOUCHER-1\" ID_Context=\"BROKER\""), r);
        assertTrue(r.contains("<ReservationStatus>CONFIRMED</ReservationStatus>"), r);
        String number = r.substring(r.indexOf("ID=\"RSV-") + 4, r.indexOf('"', r.indexOf("ID=\"RSV-") + 4));

        // It is in the reservations list, in its pick-up month, with both references
        JsonNode may = reservations().path(Y).path("May");
        assertEquals(1, may.size());
        assertEquals("VOUCHER-1", may.get(0).path("bookingId").asText());
        assertEquals(number, may.get(0).path("channelReservationNumber").asText());
        assertEquals("SDAR", may.get(0).path("sippCode").asText());
        assertEquals(225.0, may.get(0).path("amount").asDouble());

        // Retry with the same key: same booking, no duplicate
        String again = send("/ota/v1/BKG/OTA_VehRes", vehRes(offer, "VOUCHER-1"), "Idempotency-Key", "idem-1");
        assertTrue(again.contains("ID=\"" + number + "\""), again);
        assertEquals(1, reservations().path(Y).path("May").size());

        // The only SDAR car is now taken: no availability for the same dates
        String sold = send("/ota/v1/BKG/OTA_VehAvailRate", avail("A2"));
        assertTrue(sold.contains("Status=\"Closed\""), sold);
        String direct = """
            <OTA_VehResRQ xmlns="http://www.opentravel.org/OTA/2003/05"><VehResRQCore>
              <VehRentalCore PickUpDateTime="%s-05-02T10:00:00" ReturnDateTime="%s-05-04T10:00:00"><PickUpLocation LocationCode="AMM"/></VehRentalCore>
              <Customer><Primary><PersonName><Surname>Roe</Surname></PersonName></Primary></Customer><VehPref Code="SDAR"/></VehResRQCore>
              <VehResRQInfo><TPA_Extensions><BrokerReference>VOUCHER-2</BrokerReference></TPA_Extensions></VehResRQInfo></OTA_VehResRQ>""".formatted(Y, Y);
        mvc.perform(post("/ota/v1/BKG/OTA_VehRes").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_XML).content(direct))
            .andExpect(status().isConflict()).andExpect(content().string(containsString("ShortText=\"NO_AVAILABILITY\"")));

        // Retrieve by broker reference (with surname check)
        String ret = send("/ota/v1/BKG/OTA_VehRetRes", """
            <OTA_VehRetResRQ xmlns="http://www.opentravel.org/OTA/2003/05"><VehRetResRQCore><UniqueID Type="16" ID="VOUCHER-1"/>
              <PersonName><Surname>Doe</Surname></PersonName></VehRetResRQCore></OTA_VehRetResRQ>""");
        assertTrue(ret.contains("ID=\"" + number + "\"") && ret.contains("ReservationStatus=\"Reserved\""), ret);
        mvc.perform(post("/ota/v1/BKG/OTA_VehRetRes").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_XML).content("""
            <OTA_VehRetResRQ><VehRetResRQCore><UniqueID Type="14" ID="%s"/><PersonName><Surname>Wrong</Surname></PersonName></VehRetResRQCore></OTA_VehRetResRQ>""".formatted(number)))
            .andExpect(status().isNotFound());

        // Modify: one more day → re-priced (6 days × 40 + GPS 25)
        String mod = send("/ota/v1/BKG/OTA_VehModify", """
            <OTA_VehModifyRQ xmlns="http://www.opentravel.org/OTA/2003/05"><VehModifyRQCore ModifyType="Modify"><UniqueID Type="14" ID="%s"/>
              <VehRentalCore PickUpDateTime="%s-05-01T10:00:00" ReturnDateTime="%s-05-07T10:00:00"/></VehModifyRQCore></OTA_VehModifyRQ>""".formatted(number, Y, Y));
        assertTrue(mod.contains("EstimatedTotalAmount=\"265.00\""), mod);
        assertEquals(265.0, reservations().path(Y).path("May").get(0).path("amount").asDouble());

        // Cancel (far ahead → free); cancelling again is safe
        String cancel = """
            <OTA_VehCancelRQ xmlns="http://www.opentravel.org/OTA/2003/05"><VehCancelRQCore CancelType="Cancel"><UniqueID Type="14" ID="%s"/>
              <PersonName><Surname>Doe</Surname></PersonName></VehCancelRQCore></OTA_VehCancelRQ>""".formatted(number);
        String c1 = send("/ota/v1/BKG/OTA_VehCancel", cancel);
        assertTrue(c1.contains("CancelStatus=\"Cancelled\"") && c1.contains("<CancellationFee Amount=\"0.00\""), c1);
        assertEquals("CANCELLED", reservations().path(Y).path("May").get(0).path("status").asText());
        assertTrue(send("/ota/v1/BKG/OTA_VehCancel", cancel).contains("CancelStatus=\"Cancelled\""));

        // The car is free again
        assertTrue(send("/ota/v1/BKG/OTA_VehAvailRate", avail("A3")).contains("<Availability Count=\"1\""));

        // Webhooks were queued for the broker
        List<String> events = webhooks.findAll().stream().map(ChannelWebhookDelivery::getEventType).toList();
        assertTrue(events.containsAll(List.of("reservation.created", "reservation.confirmed", "reservation.modified", "reservation.cancelled")), events.toString());
    }

    @Test
    void errorsFollowTheCatalogue() throws Exception {
        mvc.perform(post("/ota/v1/BKG/OTA_VehAvailRate").header("X-Api-Key", "wrong").contentType(MediaType.APPLICATION_XML).content(avail("E")))
            .andExpect(status().isUnauthorized()).andExpect(content().string(containsString("ShortText=\"AUTH_FAILED\"")))
            .andExpect(header().exists("X-Request-ID"));
        mvc.perform(post("/ota/v1/BKG/OTA_VehAvailRate").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_XML)
                .content(avail("E").replace("LocationCode=\"AMM\"/><Return", "LocationCode=\"ZZZ\"/><Return")))
            .andExpect(status().isBadRequest()).andExpect(content().string(containsString("INVALID_LOCATION")));
        mvc.perform(post("/ota/v1/BKG/OTA_VehAvailRate").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_XML)
                .content(avail("E").replace("-05-06T10", "-04-06T10")))
            .andExpect(status().isBadRequest()).andExpect(content().string(containsString("INVALID_DATE")));
        mvc.perform(post("/ota/v1/BKG/OTA_VehRes").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_XML).content(vehRes("OFF-NOPE", "V9")))
            .andExpect(status().isConflict()).andExpect(content().string(containsString("OFFER_EXPIRED")));
        // Driver younger than the minimum age
        mvc.perform(post("/ota/v1/BKG/OTA_VehAvailRate").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_XML)
                .content(avail("E").replace("Age=\"35\"", "Age=\"18\"")))
            .andExpect(status().isUnprocessableEntity()).andExpect(content().string(containsString("POLICY_VIOLATION")));
    }

    @Test
    void nativeXmlAndRestUseTheSameCore() throws Exception {
        String nativeAvail = """
            <AvailabilityRequest><Header><RequestID>BRK-1</RequestID><ChannelCode>BKG</ChannelCode></Header>
              <Credentials><Username>bkg</Username><ApiKey>%s</ApiKey></Credentials>
              <Itinerary><PickupLocationCode>AMM</PickupLocationCode><PickupDateTime>%s-06-01T10:00:00</PickupDateTime>
                <ReturnLocationCode>AQJ</ReturnLocationCode><ReturnDateTime>%s-06-04T10:00:00</ReturnDateTime></Itinerary></AvailabilityRequest>""";
        mvc.perform(post("/xml/v1/Availability").contentType(MediaType.APPLICATION_XML).content(nativeAvail.formatted(KEY, Y, Y)))
            .andExpect(status().isOk())
            .andExpect(content().string(containsString("<RequestID>BRK-1</RequestID>")))
            .andExpect(content().string(containsString("<Status>SUCCESS</Status>")))
            // 3 days × 50 + one-way fee 30
            .andExpect(content().string(containsString("<TotalAmount>180.00</TotalAmount>")));
        mvc.perform(post("/xml/v1/Availability").contentType(MediaType.APPLICATION_XML).content(nativeAvail.formatted("bad", Y, Y)))
            .andExpect(status().isUnauthorized()).andExpect(content().string(containsString("<ErrorCode>AUTH_FAILED</ErrorCode>")));

        // REST: book without an offer, with the expected price
        String body = """
            {"broker_reference":"REST-1","itinerary":{"pickup_location":"AMM","return_location":"AMM","pickup_at":"%s-07-01T09:00:00",
             "return_at":"%s-07-03T09:00:00","vehicle_group":"SDAR"},"expected_total":100.00,
             "customer":{"first_name":"Jane","last_name":"Smith","email":"jane@example.com"},"driver":{"date_of_birth":"1988-02-02"}}""".formatted(Y, Y);
        String created = mvc.perform(post("/partner/v1/BKG/reservations").header("Authorization", "Bearer " + KEY)
                .header("Idempotency-Key", "rest-1").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andExpect(jsonPath("$.reservation.status").value("CONFIRMED"))
            .andExpect(jsonPath("$.reservation.total_amount").value(100.0))
            .andReturn().getResponse().getContentAsString();
        String id = M.readTree(created).path("reservation").path("reservation_id").asText();
        mvc.perform(get("/partner/v1/BKG/reservations/REST-1").header("X-Api-Key", KEY))
            .andExpect(status().isOk()).andExpect(jsonPath("$.reservation.reservation_id").value(id));
        // Price no longer matches → PRICE_CHANGED
        mvc.perform(post("/partner/v1/BKG/reservations").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_JSON)
                .content(body.replace("REST-1", "REST-2").replace("100.00", "90.00").replace("07-01", "08-01").replace("07-03", "08-03")))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.error_code").value("PRICE_CHANGED"));
        // Same broker reference again with other details → DUPLICATE_REFERENCE
        mvc.perform(post("/partner/v1/BKG/reservations").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_JSON)
                .content(body.replace("Jane", "Janet")))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.error_code").value("DUPLICATE_REFERENCE"));
        mvc.perform(post("/partner/v1/BKG/reservations/" + id + "/cancel").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.reservation.status").value("CANCELLED"));
    }

    @Test
    void sandboxChannelsNeverTouchRealBookings() throws Exception {
        seedChannel("testing", "test");
        String offer = firstOffer(send("/ota/v1/BKG/OTA_VehAvailRate", avail("S1")));
        String r = send("/ota/v1/BKG/OTA_VehRes", vehRes(offer, "SBX-1"));
        assertTrue(r.contains("Target=\"Test\"") && r.contains("<Sandbox>true</Sandbox>"), r);
        assertEquals(0, reservations().path(Y).path("May").size(), "sandbox booking is not in the reservations list");
    }

    @Test
    void staffCheckOutNotifiesTheBroker() throws Exception {
        String offer = firstOffer(send("/ota/v1/BKG/OTA_VehAvailRate", avail("W1")));
        send("/ota/v1/BKG/OTA_VehRes", vehRes(offer, "VOUCHER-W"));
        ObjectNode res = (ObjectNode) reservations().path(Y).path("May").get(0).deepCopy();
        res.put("voucherSubmitted", true).put("lastEditedBy", "Emily Davis").put("licensePlate", "SD-1");
        stateService.applyPatch(M.writeValueAsString(M.createObjectNode().set("ops", M.createArrayNode().add(
            M.createObjectNode().put("op", "upsertReservation").put("year", Y).put("month", "May").set("reservation", res)))));
        List<String> events = webhooks.findAll().stream().map(ChannelWebhookDelivery::getEventType).toList();
        assertTrue(events.contains("reservation.picked_up") && events.contains("agreement.created"), events.toString());
        ChannelWebhookDelivery d = webhooks.findAll().stream().filter(w -> w.getEventType().equals("reservation.picked_up")).findFirst().orElseThrow();
        assertTrue(d.getPayload().contains("\"status\":\"IN_PROGRESS\""), d.getPayload());
    }

    @Test
    void signatureIsHmacOfTimestampAndBody() {
        // Known HMAC-SHA256 test vector (RFC 4231 style): key "key", message "The quick brown fox jumps over the lazy dog"
        assertEquals("f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
            ChannelWebhookService.sign("key", "The quick brown fox jumps over the lazy dog"));
    }

    @Test
    void certificationSuitePasses() throws Exception {
        rules((agg, r) -> {
            r.with("pricing").putArray("coverages").addObject().put("code", "SCDW").put("name", "Super cover").put("dailyPrice", 10).put("excess", 0);
            ((ObjectNode) r.get("pricing")).putArray("promotions").addObject().put("code", "CERT10").put("percentOff", 10);
        });
        String token = staffToken();
        String report = mvc.perform(post("/api/channels/agg-1/certification").header("Authorization", token))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode r = M.readTree(report);
        for (JsonNode t : r.path("results")) assertTrue(t.path("passed").asBoolean(), t.toString());
        assertTrue(r.path("total").asInt() >= 25, report);
        assertEquals(0, reservations().path(Y).size(), "certification books nothing for real");
        mvc.perform(post("/api/channels/agg-1/certification")).andExpect(status().isUnauthorized());
        assertNotNull(LocalDate.now());
    }

    // ======================================================================= details, pricing rules

    @Autowired ChannelBookingService core;
    @Autowired ChannelStateReader channelReader;
    @Autowired ChannelJobs jobs;

    @Test
    void locationsAndVehicleGroupsCarryFullDetails() throws Exception {
        String loc = send("/ota/v1/BKG/OTA_VehLocSearch", "<OTA_VehLocSearchRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\"/>");
        assertTrue(loc.contains("AtAirport=\"true\"") && loc.contains("<Telephone PhoneNumber=\"+962 6 400 0000\""), loc);
        assertTrue(loc.contains("<Position Latitude=\"31.7226\" Longitude=\"35.9932\"/>"), loc);
        assertTrue(loc.contains("<OperationTime Mon=\"true\" Start=\"06:00\" End=\"23:00\"/>"), loc);

        rules((agg, r) -> r.putObject("groupDetails").putObject("SDAR").put("seats", 5).put("doors", 4).put("largeBags", 2).put("smallBags", 2));
        String a = send("/ota/v1/BKG/OTA_VehAvailRate", avail("D1"));
        // SDAR: staff details; IFAR: from the SIPP code (intermediate SUV, 5 doors)
        assertTrue(a.contains("PassengerQuantity=\"5\" BaggageQuantity=\"4\" Code=\"SDAR\""), a);
        assertTrue(a.contains("<VehType VehicleCategory=\"1\" DoorCount=\"4\"/>"), a);
        assertTrue(a.contains("<PictureURL>http://localhost/api/media/corolla</PictureURL>"), a);
        assertTrue(a.contains("<PictureURL>https://cdn.example.com/sportage.jpg</PictureURL>"), a);
        assertTrue(a.contains("<VehType VehicleCategory=\"3\" DoorCount=\"5\"/>"), a);

        mvc.perform(get("/partner/v1/BKG/vehicle-groups").header("X-Api-Key", KEY))
            .andExpect(jsonPath("$.vehicle_groups[0].vehicle.seats").value(5))
            .andExpect(jsonPath("$.vehicle_groups[1].vehicle.fuel").value("Unspecified"));
        mvc.perform(get("/partner/v1/BKG/locations").header("X-Api-Key", KEY))
            .andExpect(jsonPath("$.locations[0].opening_hours.length()").value(7))
            .andExpect(jsonPath("$.locations[0].type").value("AIRPORT"));
    }

    @Test
    void coversTaxMileagePromotionAndDriverFees() throws Exception {
        rules((agg, r) -> {
            ObjectNode p = r.putObject("pricing");
            p.put("taxPercent", 16).put("taxIncluded", false).put("taxName", "Sales tax");
            p.put("unlimitedMileage", false).put("kmPerDay", 200).put("extraKmPrice", 0.25);
            ArrayNode cv = p.putArray("coverages");
            cv.addObject().put("code", "CDW").put("name", "Collision damage waiver").put("included", true).put("excess", 500);
            cv.addObject().put("code", "SCDW").put("name", "Super cover").put("dailyPrice", 10).put("excess", 0);
            p.putArray("promotions").addObject().put("code", "SUMMER10").put("percentOff", 10).putArray("groups").add("SDAR");
            p.put("youngDriverUnder", 25).put("youngDriverFee", 5);
        });
        String rq = avail("P1").replace("Age=\"35\"", "Age=\"23\"")
            .replace("</VehAvailRQCore>", "<RateQualifier PromotionCode=\"SUMMER10\"/></VehAvailRQCore>")
            .replace("</SpecialEquipPrefs>", "</SpecialEquipPrefs><CoveragePrefs><CoveragePref CoverageType=\"SCDW\"/></CoveragePrefs>");
        String a = send("/ota/v1/BKG/OTA_VehAvailRate", rq);
        // SDAR: 200 − 10% = 180, GPS 25, SCDW 5 × 10 = 50, young driver 5 × 5 = 25 → 280 + 16% tax 44.80 = 324.80
        assertTrue(a.contains("EstimatedTotalAmount=\"324.80\""), a);
        assertTrue(a.contains("<TaxAmount Total=\"44.80\" CurrencyCode=\"USD\" Percentage=\"16\" Description=\"Sales tax\"/>"), a);
        assertTrue(a.contains("<RateDistance Unlimited=\"false\" Quantity=\"200\" DistUnitName=\"Km\""), a);
        assertTrue(a.contains("PromotionCode=\"SUMMER10\""), a);
        assertTrue(a.contains("<Coverage CoverageType=\"SCDW\" Code=\"SCDW\">") && a.contains("<Deductible ExcessAmount=\"0.00\""), a);
        assertTrue(a.contains("<PricedCoverage Required=\"true\" Selected=\"true\">"), a);
        assertTrue(a.contains("Purpose=\"YOUNG_DRIVER\"") && a.contains("Purpose=\"SUMMER10\""), a);
        assertTrue(a.contains("<Excess Amount=\"0.00\""), "super cover lowers the excess: " + a);

        // Book it: the price snapshot, the covers and the promotion stay with the booking
        String r = send("/ota/v1/BKG/OTA_VehRes", vehRes(firstOffer(a), "PROMO-1").replace("BirthDate=\"1990-05-01\"", "BirthDate=\"" + (Integer.parseInt(Y) - 23) + "-01-01\""));
        assertTrue(r.contains("EstimatedTotalAmount=\"324.80\"") && r.contains("<PromotionCode>SUMMER10</PromotionCode>"), r);
        JsonNode res = reservations().path(Y).path("May").get(0);
        assertEquals("SUMMER10", res.path("channelPrice").path("promoCode").asText());
        assertTrue(res.path("extras").toString().contains("Super cover"), res.path("extras").toString());

        // Unknown promotion → POLICY_VIOLATION
        mvc.perform(post("/ota/v1/BKG/OTA_VehAvailRate").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_XML)
                .content(rq.replace("SUMMER10", "NOPE")))
            .andExpect(status().isUnprocessableEntity()).andExpect(content().string(containsString("Unknown promotion code NOPE")));
    }

    @Test
    void openingHoursAndAfterHoursFee() throws Exception {
        String night = avail("H1").replace("-05-01T10:00:00", "-05-01T03:00:00");
        mvc.perform(post("/ota/v1/BKG/OTA_VehAvailRate").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_XML).content(night))
            .andExpect(status().isBadRequest()).andExpect(content().string(containsString("AMM is closed at 03:00")));
        rules((agg, r) -> ((ObjectNode) r.get("locations").get(0)).put("afterHoursPickup", true).put("afterHoursFee", 20));
        String a = send("/ota/v1/BKG/OTA_VehAvailRate", night);
        assertTrue(a.contains("Purpose=\"AFTER_HOURS\"") && a.contains("EstimatedTotalAmount=\"285.00\""), a);   // 03:00 → 10:00 is 6 days: 240 + GPS 25 + 20
    }

    @Test
    void allotmentsAndStopSellPerBroker() throws Exception {
        rules((agg, r) -> r.putArray("allotments").addObject().put("group", "SDAR").put("from", Y + "-05-01").put("to", Y + "-05-31").put("quantity", 0));
        String a = send("/ota/v1/BKG/OTA_VehAvailRate", avail("L1"));
        assertTrue(a.contains("<ClosedReason>Allotment of 0 used</ClosedReason>"), a);
        rules((agg, r) -> ((ObjectNode) r.get("allotments").get(0)).put("quantity", 0).put("stopSell", true));
        assertTrue(send("/ota/v1/BKG/OTA_VehAvailRate", avail("L2")).contains("<ClosedReason>Stop sell for this channel</ClosedReason>"));
        // Outside the period the broker sells normally
        assertTrue(send("/ota/v1/BKG/OTA_VehAvailRate", avail("L3").replace("-05-01T10", "-06-01T10").replace("-05-06T10", "-06-06T10"))
            .contains("<Availability Count=\"1\""));
    }

    // ======================================================================= SOAP, WSDL, XSD

    static String soap11(String user, String password, String inner) {
        return """
            <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
              <soapenv:Header><wsse:Security><wsse:UsernameToken><wsse:Username>%s</wsse:Username><wsse:Password>%s</wsse:Password>
              </wsse:UsernameToken></wsse:Security></soapenv:Header>
              <soapenv:Body>%s</soapenv:Body>
            </soapenv:Envelope>""".formatted(user, password, inner);
    }

    @Test
    void soapEnvelopesWsdlAndPosCredentials() throws Exception {
        String rs = mvc.perform(post("/ota/v1/BKG/soap").contentType(MediaType.TEXT_XML).content(soap11("BKG", KEY, avail("S1"))))
            .andExpect(status().isOk()).andExpect(content().contentTypeCompatibleWith("text/xml"))
            .andReturn().getResponse().getContentAsString();
        assertTrue(rs.contains("<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\">") && rs.contains("<OTA_VehAvailRateRS"), rs);
        assertTrue(rs.contains("EchoToken=\"S1\"") && rs.contains("EstimatedTotalAmount=\"225.00\""), rs);
        // well-formed
        OtaXmlTest.parse(rs);

        // Wrong password, and a UsernameToken naming another channel, both fail
        mvc.perform(post("/ota/v1/BKG/soap").contentType(MediaType.TEXT_XML).content(soap11("BKG", "nope", avail("S2"))))
            .andExpect(status().isUnauthorized()).andExpect(content().string(containsString("ShortText=\"AUTH_FAILED\"")));
        mvc.perform(post("/ota/v1/BKG/soap").contentType(MediaType.TEXT_XML).content(soap11("OTHER", KEY, avail("S3"))))
            .andExpect(status().isUnauthorized());

        // SOAP 1.2, prefixed OTA body
        String s12 = """
            <env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope" xmlns:ota="http://www.opentravel.org/OTA/2003/05">
              <env:Body><ota:OTA_VehLocSearchRQ><ota:POS><ota:Source><ota:RequestorID ID="BKG" MessagePassword="%s"/></ota:Source></ota:POS>
              </ota:OTA_VehLocSearchRQ></env:Body></env:Envelope>""".formatted(KEY);
        mvc.perform(post("/ota/v1/BKG/soap").contentType(MediaType.parseMediaType("application/soap+xml")).content(s12))
            .andExpect(status().isOk()).andExpect(content().contentTypeCompatibleWith("application/soap+xml"))
            .andExpect(content().string(containsString("<soap:Envelope xmlns:soap=\"http://www.w3.org/2003/05/soap-envelope\">")))
            .andExpect(content().string(containsString("Code=\"AQJ\"")));

        // Not an envelope → SOAP Fault
        mvc.perform(post("/ota/v1/BKG/soap").contentType(MediaType.TEXT_XML).content("<x/>"))
            .andExpect(status().isInternalServerError()).andExpect(content().string(containsString("<faultstring>Not a SOAP 1.1 or 1.2 Envelope</faultstring>")));

        // POS MessagePassword also works on the plain OTA endpoints
        String withPos = avail("S4").replace("<VehAvailRQCore>", "<POS><Source><RequestorID ID=\"BKG\" MessagePassword=\"" + KEY + "\"/></Source></POS><VehAvailRQCore>");
        mvc.perform(post("/ota/v1/BKG/OTA_VehAvailRate").contentType(MediaType.APPLICATION_XML).content(withPos))
            .andExpect(status().isOk()).andExpect(content().string(containsString("<Success/>")));

        // WSDL
        String wsdl = mvc.perform(get("/ota/v1/BKG/soap").param("wsdl", "")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        OtaXmlTest.parse(wsdl);
        assertTrue(wsdl.contains("<wsdl:operation name=\"OTA_VehRes\">") && wsdl.contains("<soap:address location=\"http://localhost/ota/v1/BKG/soap\"/>"), wsdl);
    }

    @Test
    void nativeResponsesValidateAgainstThePublishedXsd() throws Exception {
        String xsd = mvc.perform(get("/xml/v1/schema.xsd")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        var schema = javax.xml.validation.SchemaFactory.newInstance(javax.xml.XMLConstants.W3C_XML_SCHEMA_NS_URI)
            .newSchema(new javax.xml.transform.stream.StreamSource(new java.io.StringReader(xsd)));
        rules((agg, r) -> {
            ObjectNode p = r.putObject("pricing");
            p.put("taxPercent", 16).put("unlimitedMileage", false).put("kmPerDay", 250).put("extraKmPrice", 0.2);
            p.putArray("coverages").addObject().put("code", "SCDW").put("name", "Super cover").put("dailyPrice", 10).put("excess", 0);
        });
        String head = "<Header><RequestID>V-1</RequestID><ChannelCode>BKG</ChannelCode></Header><Credentials><ApiKey>" + KEY + "</ApiKey></Credentials>";
        String it = "<Itinerary><PickupLocationCode>AMM</PickupLocationCode><PickupDateTime>" + Y + "-06-01T10:00:00</PickupDateTime>"
            + "<ReturnDateTime>" + Y + "-06-04T10:00:00</ReturnDateTime></Itinerary>";
        String[][] calls = {
            {"Locations", "<LocationsRequest>" + head + "</LocationsRequest>"},
            {"VehicleGroups", "<VehicleGroupsRequest>" + head + "</VehicleGroupsRequest>"},
            {"Extras", "<ExtrasRequest>" + head + "</ExtrasRequest>"},
            {"Coverages", "<CoveragesRequest>" + head + "</CoveragesRequest>"},
            {"Inventory", "<InventoryRequest>" + head + "<Days>10</Days></InventoryRequest>"},
            {"Availability", "<AvailabilityRequest>" + head + it + "<Coverages><CoverageCode>SCDW</CoverageCode></Coverages><OnlyAvailable>false</OnlyAvailable></AvailabilityRequest>"},
            {"ReservationCreate", "<ReservationCreateRequest>" + head + "<BrokerReference>XSD-1</BrokerReference>"
                + it.replace("</Itinerary>", "<VehicleGroupCode>SDAR</VehicleGroupCode></Itinerary>")
                + "<Customer><FirstName>Jane</FirstName><LastName>Smith</LastName></Customer></ReservationCreateRequest>"},
            {"ReservationStatus", "<ReservationStatusRequest>" + head + "<BrokerReference>XSD-1</BrokerReference></ReservationStatusRequest>"},
            {"ReservationCancel", "<ReservationCancelRequest>" + head + "<BrokerReference>XSD-1</BrokerReference></ReservationCancelRequest>"},
            {"ReservationStatus", "<ReservationStatusRequest>" + head + "<BrokerReference>MISSING</BrokerReference></ReservationStatusRequest>"},
        };
        for (String[] c : calls) {
            schema.newValidator().validate(new javax.xml.transform.stream.StreamSource(new java.io.StringReader(c[1])));
            String rs = send("/xml/v1/" + c[0], c[1]);
            try {
                schema.newValidator().validate(new javax.xml.transform.stream.StreamSource(new java.io.StringReader(rs)));
            } catch (Exception e) {
                fail(c[0] + ": " + e.getMessage() + "\n" + rs);
            }
        }
    }

    // ======================================================================= no-shows, inventory push, statement

    @Test
    void automaticNoShowWithFee() throws Exception {
        rules((agg, r) -> r.put("noShowAfterHours", 2).put("noShowFeePercent", 50));
        String offer = firstOffer(send("/ota/v1/BKG/OTA_VehAvailRate", avail("N1")));
        send("/ota/v1/BKG/OTA_VehRes", vehRes(offer, "NOSHOW-1"));
        ChannelBooking b = bookings.findFirstByChannelIdAndBrokerReference("agg-1", "NOSHOW-1").orElseThrow();
        b.setPickupAt(java.time.LocalDateTime.now().minusHours(3));
        bookings.save(b);
        ChannelBookingService.Ctx c = core.context(channelReader.find("BKG").orElseThrow(), false);
        assertEquals(1, core.markNoShows(c));
        JsonNode res = reservations().path(Y).path("May").get(0);
        assertEquals("NO_SHOW", res.path("status").asText());
        assertEquals(112.5, res.path("noShowFee").asDouble());
        assertEquals("NO_SHOW", bookings.findById(b.getId()).orElseThrow().getStatus());
        assertTrue(webhooks.findAll().stream().anyMatch(w -> w.getEventType().equals("reservation.no_show")));
        assertEquals(0, core.markNoShows(c), "only once");
    }

    @Test
    void inventoryIsPushedOnlyWhenItChanges() throws Exception {
        rules((agg, r) -> r.put("inventoryPushDays", 14).putArray("webhookEvents").add("inventory.updated").add("reservation.created"));
        ChannelBookingService.Ctx c = core.context(channelReader.find("BKG").orElseThrow(), false);
        assertTrue(jobs.pushInventory(c, false), "first push");
        assertFalse(jobs.pushInventory(c, false), "nothing changed (and checked recently)");
        assertTrue(jobs.pushInventory(c, true), "staff can force a push");
        ChannelWebhookDelivery d = webhooks.findAll().stream().filter(w -> w.getEventType().equals("inventory.updated")).findFirst().orElseThrow();
        JsonNode body = M.readTree(d.getPayload());
        assertEquals(14, body.path("data").path("groups").get(0).path("days").size());
        assertEquals("SDAR", body.path("data").path("groups").get(0).path("vehicle_group").asText());
        mvc.perform(get("/partner/v1/BKG/inventory").param("days", "3").header("X-Api-Key", KEY))
            .andExpect(status().isOk()).andExpect(jsonPath("$.inventory.groups[0].days.length()").value(3));
    }

    @Test
    void commissionStatementByPickupMonth() throws Exception {
        rules((agg, r) -> agg.put("commissionPercent", 15));
        String body = """
            {"broker_reference":"ST-%s","itinerary":{"pickup_location":"AMM","pickup_at":"%s-07-%s","return_at":"%s-07-%s","vehicle_group":"SDAR"},
             "customer":{"first_name":"Jane","last_name":"Smith"}}""";
        mvc.perform(post("/partner/v1/BKG/reservations").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_JSON)
            .content(body.formatted("1", Y, "01T09:00:00", Y, "03T09:00:00"))).andExpect(status().isOk());       // 2 × 50 = 100
        String second = mvc.perform(post("/partner/v1/BKG/reservations").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_JSON)
            .content(body.formatted("2", Y, "10T09:00:00", Y, "15T09:00:00"))).andReturn().getResponse().getContentAsString();   // 5 × 40 = 200
        String id = M.readTree(second).path("reservation").path("reservation_id").asText();
        mvc.perform(post("/partner/v1/BKG/reservations/" + id + "/cancel").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_JSON).content("{}"));
        mvc.perform(get("/api/channels/agg-1/statement").param("month", Y + "-07").header("Authorization", staffToken()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.bookings").value(1)).andExpect(jsonPath("$.cancelled").value(1))
            .andExpect(jsonPath("$.gross").value(100.0)).andExpect(jsonPath("$.commission").value(15.0))
            .andExpect(jsonPath("$.net").value(85.0)).andExpect(jsonPath("$.rows.length()").value(2));
    }
}
