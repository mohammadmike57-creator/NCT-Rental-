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
    @Autowired WebhookV2Service webhooksV2;
    @Autowired ChannelRetentionService retention;
    @Autowired OutboundConnectorService connectorsSvc;
    @Autowired OutboundConnectorRepository connectorRepo;
    @Autowired ConnectorSendRepository connectorSends;
    @Autowired WebhookSubscriptionRepository subscriptions;
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
        rules.put("rateLimitPerMinute", 5000);   // the suite sends far more than a broker would in a minute
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
    void gracePeriodAirportFeeAndOneWayFeePerRoute() throws Exception {
        // 45 minutes late on the 5th day: without a grace period it is 6 days (240 + GPS 25)
        String late = avail("G1").replace("-05-06T10:00:00", "-05-06T10:45:00");
        assertTrue(send("/ota/v1/BKG/OTA_VehAvailRate", late).contains("EstimatedTotalAmount=\"265.00\""));
        rules((agg, r) -> r.put("graceMinutes", 60));
        assertTrue(send("/ota/v1/BKG/OTA_VehAvailRate", late).contains("EstimatedTotalAmount=\"225.00\""), "within the grace period: 5 days");
        String later = late.replace("-05-06T10:45:00", "-05-06T11:01:00");
        assertTrue(send("/ota/v1/BKG/OTA_VehAvailRate", later).contains("EstimatedTotalAmount=\"265.00\""), "past the grace period: 6 days");

        // Airport fee once per rental at the airport branch
        rules((agg, r) -> ((ObjectNode) r.get("locations").get(0)).put("stationFee", 15));
        String a = send("/ota/v1/BKG/OTA_VehAvailRate", avail("G2"));
        assertTrue(a.contains("Purpose=\"AIRPORT\"") && a.contains("Airport fee") && a.contains("EstimatedTotalAmount=\"240.00\""), a);
        // Free of charge chosen: no fee even with an amount saved
        rules((agg, r) -> ((ObjectNode) r.get("locations").get(0)).put("airportFeeCharged", false));
        assertTrue(send("/ota/v1/BKG/OTA_VehAvailRate", avail("G2a")).contains("EstimatedTotalAmount=\"225.00\""));
        rules((agg, r) -> ((ObjectNode) r.get("locations").get(0)).put("airportFeeCharged", true));
        // A city branch never charges it, even with an amount saved
        rules((agg, r) -> ((ObjectNode) r.get("locations").get(0)).put("type", "CITY"));
        assertTrue(send("/ota/v1/BKG/OTA_VehAvailRate", avail("G2b")).contains("EstimatedTotalAmount=\"225.00\""));
        rules((agg, r) -> ((ObjectNode) r.get("locations").get(0)).put("type", "AIRPORT"));

        // One-way: the general fee (30), then the route's own fee (50, both ways)
        String oneWay = avail("G3").replace("<ReturnLocation LocationCode=\"AMM\"/>", "<ReturnLocation LocationCode=\"AQJ\"/>");
        assertTrue(send("/ota/v1/BKG/OTA_VehAvailRate", oneWay).contains("EstimatedTotalAmount=\"270.00\""));
        rules((agg, r) -> r.putArray("oneWayRoutes").addObject().put("from", "AQJ").put("to", "AMM").put("fee", 50));
        String w = send("/ota/v1/BKG/OTA_VehAvailRate", oneWay);
        assertTrue(w.contains("Purpose=\"ONE_WAY\"") && w.contains("EstimatedTotalAmount=\"290.00\""), w);
    }

    @Test
    void rateRulesPriceDayByDayOnlyForChannelsSwitchedToDynamic() throws Exception {
        stateService.applyPatch(M.writeValueAsString(M.createObjectNode().set("ops", M.createArrayNode().add(M.createObjectNode()
            .put("op", "set").put("key", "channelPricing").set("value", M.readTree(("{\"version\":1,\"published\":{\"seasonal\":{\"enabled\":true,\"stack\":false,\"rules\":["
                + "{\"name\":\"Eid Al-Adha\",\"kind\":\"eid_adha\",\"from\":\"%s-05-04\",\"to\":\"%s-05-05\",\"priority\":1,\"active\":true,"
                + "\"groups\":[\"SDAR\"],\"adjust\":{\"type\":\"fixed\",\"value\":60}}]}}}").formatted(Y, Y)))))));
        // Default (net): unchanged, 5 × 40 + GPS 25
        assertTrue(send("/ota/v1/BKG/OTA_VehAvailRate", avail("D1")).contains("EstimatedTotalAmount=\"225.00\""));
        // Dynamic: 3 days × 40 + 2 Eid days × 60 + GPS 25 = 265
        rules((agg, r) -> agg.put("pricingMode", "dynamic"));
        String a = send("/ota/v1/BKG/OTA_VehAvailRate", avail("D2"));
        assertTrue(a.contains("EstimatedTotalAmount=\"265.00\""), a);
        assertTrue(a.contains("<Calculation UnitCharge=\"48.00\" UnitName=\"Day\" Quantity=\"5\"/>"), "average of the day rates: " + a);
        // and the booking keeps that price
        String r = send("/ota/v1/BKG/OTA_VehRes", vehRes(firstOffer(a), "DYN-1"));
        assertTrue(r.contains("EstimatedTotalAmount=\"265.00\""), r);
        rules((agg, rr) -> agg.put("pricingMode", "net"));
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
            r.putObject("currencies").put("EUR", 0.9);
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
            {"Ping", "<PingRequest>" + head + "<EchoData>hello</EchoData></PingRequest>"},
            {"LocationDetail", "<LocationDetailRequest>" + head + "<LocationCode>AQJ</LocationCode></LocationDetailRequest>"},
            {"RateRules", "<RateRulesRequest>" + head + it.replace("</Itinerary>", "<VehicleGroupCode>SDAR</VehicleGroupCode></Itinerary>") + "<Currency>EUR</Currency></RateRulesRequest>"},
            {"Availability", "<AvailabilityRequest>" + head + it + "<Currency>EUR</Currency></AvailabilityRequest>"},
            {"ReservationList", "<ReservationListRequest>" + head + "<From>" + Y + "-06-01</From><To>" + Y + "-06-30</To></ReservationListRequest>"},
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

    // ======================================================================= enterprise: penalties, currencies, rate rules, traffic, console

    @Test
    void tieredCancellationPenaltiesWithDeadlines() throws Exception {
        rules((agg, r) -> {
            ArrayNode t = r.putArray("cancellationTiers");
            t.addObject().put("hoursBefore", 24 * 365).put("feePercent", 25);    // already applies for a pick-up next year
            t.addObject().put("hoursBefore", 24).put("feePercent", 100);
        });
        String a = send("/ota/v1/BKG/OTA_VehAvailRate", avail("T1"));
        assertTrue(a.contains("<CancellationPolicy Code=\"TIERED8760\"/>"), a);
        assertTrue(a.contains("<AmountPercent Percent=\"25\" Amount=\"56.25\" CurrencyCode=\"USD\"/>"), a);
        assertTrue(a.contains("AbsoluteDeadline=\"" + Y + "-04-30T10:00:00\" OffsetTimeUnit=\"Hour\" OffsetUnitMultiplier=\"24\""), a);
        String r = send("/ota/v1/BKG/OTA_VehRes", vehRes(firstOffer(a), "TIER-1"));
        String number = r.substring(r.indexOf("ID=\"RSV-") + 4, r.indexOf('"', r.indexOf("ID=\"RSV-") + 4));
        // The agreed schedule applies even if the channel's rules change afterwards
        rules((agg, rr) -> rr.remove("cancellationTiers"));
        String c = send("/ota/v1/BKG/OTA_VehCancel", """
            <OTA_VehCancelRQ xmlns="http://www.opentravel.org/OTA/2003/05"><VehCancelRQCore><UniqueID Type="14" ID="%s"/></VehCancelRQCore></OTA_VehCancelRQ>""".formatted(number));
        assertTrue(c.contains("<CancellationFee Amount=\"56.25\""), c);
    }

    @Test
    void pricesInTheBrokersCurrency() throws Exception {
        rules((agg, r) -> r.putObject("currencies").put("EUR", 0.9).put("JOD", 0.709));
        String rq = avail("C1").replace("<VehAvailRQCore>", "<POS><Source ISOCurrency=\"EUR\"/></POS><VehAvailRQCore>");
        String a = send("/ota/v1/BKG/OTA_VehAvailRate", rq);
        assertTrue(a.contains("EstimatedTotalAmount=\"202.50\" CurrencyCode=\"EUR\""), a);      // 225 USD × 0.9
        assertTrue(a.contains("<Conversion SourceCurrencyCode=\"USD\" RequestedCurrencyCode=\"EUR\" RateConversion=\"0.9\"/>"), a);
        String r = send("/ota/v1/BKG/OTA_VehRes", vehRes(firstOffer(a), "EUR-1"));
        assertTrue(r.contains("EstimatedTotalAmount=\"202.50\" CurrencyCode=\"EUR\""), r);
        JsonNode res = reservations().path(Y).path("May").get(0);
        assertEquals(225.0, res.path("amount").asDouble(), "the reservations list keeps the channel currency");
        assertEquals("EUR", res.path("channelPrice").path("currency").asText());
        mvc.perform(post("/ota/v1/BKG/OTA_VehAvailRate").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_XML)
                .content(rq.replace("EUR", "XXX")))
            .andExpect(status().isBadRequest()).andExpect(content().string(containsString("Currency XXX is not offered")));
        mvc.perform(post("/partner/v1/BKG/availability").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_JSON).content("""
                {"itinerary":{"pickup_location":"AMM","pickup_at":"%s-05-01T10:00:00","return_at":"%s-05-06T10:00:00","currency":"JOD"}}""".formatted(Y, Y)))
            .andDo(x -> assertEquals(200, x.getResponse().getStatus(), x.getResponse().getContentAsString()))
            .andExpect(jsonPath("$.offers[0].currency").value("JOD"));
    }

    @Test
    void rateRulesLocationDetailPingAndReconciliation() throws Exception {
        rules((agg, r) -> agg.put("termsAndConditions", "Fuel: full to full."));
        String rr = send("/ota/v1/BKG/OTA_VehRateRule", """
            <OTA_VehRateRuleRQ xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="RR1"><RentalInfo>
              <VehRentalCore PickUpDateTime="%s-05-01T10:00:00" ReturnDateTime="%s-05-06T10:00:00"><PickUpLocation LocationCode="AMM"/></VehRentalCore>
              <VehPref Code="SDAR"/></RentalInfo></OTA_VehRateRuleRQ>""".formatted(Y, Y));
        assertTrue(rr.contains("<OTA_VehRateRuleRS") && rr.contains("<Success/>") && rr.contains("EchoToken=\"RR1\""), rr);
        assertTrue(rr.contains("<MinimumAge Age=\"21\"/>") && rr.contains("<CancelPenalties>") && rr.contains("<RentalTerms>"), rr);
        assertTrue(rr.contains("<Equipment EquipType=\"13\">") && rr.contains("Reference Type=\"16\" ID=\"OFF-"), rr);
        OtaXmlTest.parse(rr);
        // …and by the offer id it returned
        String offer = rr.substring(rr.indexOf("ID=\"OFF-") + 4, rr.indexOf('"', rr.indexOf("ID=\"OFF-") + 4));
        assertTrue(send("/ota/v1/BKG/OTA_VehRateRule", "<OTA_VehRateRuleRQ><Reference Type=\"16\" ID=\"" + offer + "\"/></OTA_VehRateRuleRQ>")
            .contains("EstimatedTotalAmount=\"200.00\""));

        String ld = send("/ota/v1/BKG/OTA_VehLocDetail", "<OTA_VehLocDetailRQ><Location LocationCode=\"AQJ\"/></OTA_VehLocDetailRQ>");
        assertTrue(ld.contains("<OTA_VehLocDetailRS") && ld.contains("Code=\"AQJ\"") && ld.contains("Start=\"08:00\""), ld);
        assertTrue(send("/ota/v1/BKG/OTA_Ping", "<OTA_PingRQ EchoToken=\"P\"><EchoData>hello</EchoData></OTA_PingRQ>").contains("<EchoData>hello</EchoData>"));
        mvc.perform(post("/ota/v1/BKG/soap").contentType(MediaType.TEXT_XML).content(soap11("BKG", KEY, "<OTA_PingRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\"><EchoData>soap</EchoData></OTA_PingRQ>")))
            .andExpect(status().isOk()).andExpect(content().string(containsString("<EchoData>soap</EchoData>")));

        send("/ota/v1/BKG/OTA_VehRes", vehRes(firstOffer(send("/ota/v1/BKG/OTA_VehAvailRate", avail("L1"))), "LIST-1"));
        mvc.perform(get("/partner/v1/BKG/reservations").param("from", Y + "-05-01").param("to", Y + "-05-31").header("X-Api-Key", KEY))
            .andExpect(status().isOk()).andExpect(jsonPath("$.page.total").value(1))
            .andExpect(jsonPath("$.page.reservations[0].broker_reference").value("LIST-1"));
        mvc.perform(get("/partner/v1/BKG/reservations").param("from", Y + "-06-01").param("to", Y + "-06-30").header("X-Api-Key", KEY))
            .andExpect(jsonPath("$.page.total").value(0));
    }

    @Test
    void everyCallIsInTheTrafficLogWithSecretsMasked() throws Exception {
        String rid = "TRACE-" + System.nanoTime();
        send("/xml/v1/Locations", "<LocationsRequest><Header><RequestID>" + rid + "</RequestID><ChannelCode>BKG</ChannelCode></Header>"
            + "<Credentials><ApiKey>" + KEY + "</ApiKey></Credentials></LocationsRequest>");
        mvc.perform(post("/ota/v1/BKG/OTA_VehAvailRate").header("X-Api-Key", "wrong").contentType(MediaType.APPLICATION_XML).content(avail("E")));
        String token = staffToken();
        String list = mvc.perform(get("/api/channels/agg-1/traffic").param("q", rid).header("Authorization", token))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode rows = M.readTree(list);
        assertEquals(1, rows.size(), list);
        assertEquals("XML", rows.get(0).path("format").asText());
        String detail = mvc.perform(get("/api/channels/agg-1/traffic/" + rows.get(0).path("id").asLong()).header("Authorization", token))
            .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        JsonNode d = M.readTree(detail);
        assertTrue(d.path("requestBody").asText().contains("<ApiKey>•••••</ApiKey>"), detail);
        assertFalse(d.path("requestBody").asText().contains(KEY), "the key is never stored");
        assertTrue(d.path("responseBody").asText().contains("<Code>AQJ</Code>"), detail);
        mvc.perform(get("/api/channels/agg-1/traffic").param("result", "error").header("Authorization", token))
            .andExpect(jsonPath("$[0].errorCode").value("AUTH_FAILED"));
        mvc.perform(get("/api/channels/agg-1/traffic/stats").param("hours", "24").header("Authorization", token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.calls").value(greaterThanOrEqualTo(2)))
            .andExpect(jsonPath("$.errors").value(greaterThanOrEqualTo(1))).andExpect(jsonPath("$.series.length()").value(24));
        assertEquals("•••• •••• •••• 1111 and +962790000000", ChannelTrafficService.mask("4111 1111 1111 1111 and +962790000000"));
        mvc.perform(get("/api/channels/agg-1/traffic")).andExpect(status().isUnauthorized());
    }

    @Test
    void consoleSendsRealMessagesInTheSandbox() throws Exception {
        String token = staffToken();
        String offer = M.readTree(mvc.perform(post("/api/channels/agg-1/console").header("Authorization", token).contentType(MediaType.APPLICATION_JSON)
                .content(M.writeValueAsString(java.util.Map.of("format", "OTA", "body", avail("K1")))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value(200))
            .andReturn().getResponse().getContentAsString()).path("body").asText();
        assertTrue(offer.contains("Target=\"Test\""), "console calls are sandbox: " + offer);
        String booked = M.readTree(mvc.perform(post("/api/channels/agg-1/console").header("Authorization", token).contentType(MediaType.APPLICATION_JSON)
                .content(M.writeValueAsString(java.util.Map.of("format", "OTA", "body", vehRes(firstOffer(offer), "CONSOLE-1")))))
            .andReturn().getResponse().getContentAsString()).path("body").asText();
        assertTrue(booked.contains("<Sandbox>true</Sandbox>"), booked);
        assertEquals(0, reservations().path(Y).path("May").size(), "nothing is booked for real");
        mvc.perform(post("/api/channels/agg-1/console").header("Authorization", token).contentType(MediaType.APPLICATION_JSON)
                .content(M.writeValueAsString(java.util.Map.of("format", "REST", "method", "GET", "operation", "/locations"))))
            .andExpect(jsonPath("$.status").value(200)).andExpect(jsonPath("$.body").value(containsString("\"environment\":\"SANDBOX\"")));
        mvc.perform(post("/api/channels/agg-1/console").header("Authorization", token).contentType(MediaType.APPLICATION_JSON)
                .content(M.writeValueAsString(java.util.Map.of("format", "XML", "operation", "Ping",
                    "body", "<PingRequest><Header><ChannelCode>BKG</ChannelCode></Header></PingRequest>"))))
            .andExpect(jsonPath("$.status").value(200)).andExpect(jsonPath("$.body").value(containsString("<EchoData>pong</EchoData>")));
        mvc.perform(post("/api/channels/agg-1/console").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
    }

    // ============================================================ acceptance cases

    static String direct(String from, String to, String ref, String surname) {
        return """
            <OTA_VehResRQ xmlns="http://www.opentravel.org/OTA/2003/05"><VehResRQCore>
              <VehRentalCore PickUpDateTime="%s" ReturnDateTime="%s"><PickUpLocation LocationCode="AMM"/></VehRentalCore>
              <Customer><Primary><PersonName><GivenName>Jane</GivenName><Surname>%s</Surname></PersonName></Primary></Customer><VehPref Code="SDAR"/></VehResRQCore>
              <VehResRQInfo><TPA_Extensions><BrokerReference>%s</BrokerReference></TPA_Extensions></VehResRQInfo></OTA_VehResRQ>""".formatted(from, to, surname, ref);
    }

    static String availAt(String from, String to) {
        return """
            <OTA_VehAvailRateRQ xmlns="http://www.opentravel.org/OTA/2003/05"><VehAvailRQCore>
              <VehRentalCore PickUpDateTime="%s" ReturnDateTime="%s"><PickUpLocation LocationCode="AMM"/><ReturnLocation LocationCode="AMM"/></VehRentalCore>
              <DriverType Age="35"/></VehAvailRQCore></OTA_VehAvailRateRQ>""".formatted(from, to);
    }

    /** True when the SDAR group (the only Corolla) is offered as available. */
    static boolean sdarOpen(String xml) {
        int i = xml.indexOf("Code=\"SDAR\"");
        assertTrue(i > 0, xml);
        int start = xml.lastIndexOf("<VehAvail>", i), end = xml.indexOf("</VehAvail>", i);
        return !xml.substring(start, end).contains("Status=\"Closed\"");
    }

    /** Puts a booking of the Corolla (SD-1) straight into the reservations list, as staff would. */
    void stateBooking(String id, String start, String end, boolean out, boolean back) throws Exception {
        ObjectNode r = M.createObjectNode().put("id", id).put("bookingId", id).put("personName", "Walk In").put("status", "CONFIRMED")
            .put("startDate", start).put("endDate", end).put("carModel", "Toyota Corolla").put("licensePlate", "SD-1")
            .put("voucherSubmitted", out).put("dropOffCompleted", back);
        String y = start.substring(0, 4), m = java.time.Month.of(Integer.parseInt(start.substring(5, 7))).getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.ENGLISH);
        stateService.applyPatch(M.writeValueAsString(M.createObjectNode().set("ops", M.createArrayNode().add(
            M.createObjectNode().put("op", "upsertReservation").put("year", y).put("month", m).set("reservation", r)))));
    }

    @Test
    void twoBrokersRacingForTheLastCarOnlyOneWins() throws Exception {
        var pool = java.util.concurrent.Executors.newFixedThreadPool(2);
        var go = new java.util.concurrent.CountDownLatch(1);
        List<java.util.concurrent.Future<String>> results = new java.util.ArrayList<>();
        for (String ref : List.of("RACE-A", "RACE-B")) {
            results.add(pool.submit(() -> { go.await(); return send("/ota/v1/BKG/OTA_VehRes", direct(Y + "-05-01T10:00:00", Y + "-05-04T10:00:00", ref, "Roe")); }));
        }
        go.countDown();
        int ok = 0, sold = 0;
        for (var f : results) {
            String r = f.get();
            if (r.contains("<Success/>")) ok++;
            if (r.contains("NO_AVAILABILITY")) sold++;
        }
        pool.shutdown();
        assertEquals(1, ok, "exactly one booking confirmed");
        assertEquals(1, sold, "the other is refused");
        assertEquals(1, reservations().path(Y).path("May").size());
    }

    @Test
    void sameKeyWithDifferentDetailsIsAConflict() throws Exception {
        String first = send("/ota/v1/BKG/OTA_VehRes", direct(Y + "-05-01T10:00:00", Y + "-05-04T10:00:00", "K-1", "Roe"), "Idempotency-Key", "idem-x");
        assertTrue(first.contains("<Success/>"), first);
        String retry = send("/ota/v1/BKG/OTA_VehRes", direct(Y + "-05-01T10:00:00", Y + "-05-04T10:00:00", "K-1", "Roe"), "Idempotency-Key", "idem-x");
        assertTrue(retry.contains("<Success/>"), "lost response: the retry returns the same booking");
        String changed = send("/ota/v1/BKG/OTA_VehRes", direct(Y + "-05-01T10:00:00", Y + "-05-05T10:00:00", "K-1", "Roe"), "Idempotency-Key", "idem-x");
        assertTrue(changed.contains("DUPLICATE_REFERENCE"), changed);
        assertEquals(1, reservations().path(Y).path("May").size());
    }

    @Test
    void expiredOfferAndPriceChangedBeforeBooking() throws Exception {
        String offer = firstOffer(send("/ota/v1/BKG/OTA_VehAvailRate", avail("E1")));
        ChannelOffer o = offers.findById(offer).orElseThrow();
        o.setExpiresAt(java.time.Instant.now().minusSeconds(60));
        offers.save(o);
        assertTrue(send("/ota/v1/BKG/OTA_VehRes", vehRes(offer, "EXP-1")).contains("OFFER_EXPIRED"));

        String offer2 = firstOffer(send("/ota/v1/BKG/OTA_VehAvailRate", avail("E2")));
        // New rates published between the search and the booking.
        rules((agg, r) -> ((ObjectNode) agg.path("ratePlanHistory").get(0).path("ratePlans").get(0).path("sippRates").get(0).path("tiers").get(1)).put("dailyPrice", 45));
        String r = send("/ota/v1/BKG/OTA_VehRes", vehRes(offer2, "EXP-2"));
        assertTrue(r.contains("PRICE_CHANGED"), r);
        assertEquals(0, reservations().path(Y).path("May").size(), "nothing booked");
    }

    @Test
    void failedModificationKeepsTheOriginalAndVersionsCountChanges() throws Exception {
        String r = send("/ota/v1/BKG/OTA_VehRes", direct(Y + "-05-01T10:00:00", Y + "-05-04T10:00:00", "V-1", "Roe"));
        String number = r.substring(r.indexOf("ID=\"RSV-") + 4, r.indexOf('"', r.indexOf("ID=\"RSV-") + 4));
        JsonNode before = reservations().path(Y).path("May").get(0);
        String bad = send("/ota/v1/BKG/OTA_VehModify", """
            <OTA_VehModifyRQ xmlns="http://www.opentravel.org/OTA/2003/05"><VehModifyRQCore ModifyType="Modify"><UniqueID Type="14" ID="%s"/>
              <VehRentalCore PickUpDateTime="%s-05-01T10:00:00" ReturnDateTime="%s-05-03T10:00:00"><PickUpLocation LocationCode="XXX"/></VehRentalCore></VehModifyRQCore></OTA_VehModifyRQ>""".formatted(number, Y, Y));
        assertTrue(bad.contains("INVALID_LOCATION"), bad);
        JsonNode after = reservations().path(Y).path("May").get(0);
        assertEquals(before.path("endDate").asText(), after.path("endDate").asText());
        assertEquals(before.path("amount").asDouble(), after.path("amount").asDouble());
        assertEquals(1, bookings.findByReservationNumber(number).orElseThrow().currentVersion(), "a failed change is not a new version");

        send("/ota/v1/BKG/OTA_VehModify", """
            <OTA_VehModifyRQ xmlns="http://www.opentravel.org/OTA/2003/05"><VehModifyRQCore ModifyType="Modify"><UniqueID Type="14" ID="%s"/>
              <VehRentalCore PickUpDateTime="%s-05-01T10:00:00" ReturnDateTime="%s-05-05T10:00:00"/></VehModifyRQCore></OTA_VehModifyRQ>""".formatted(number, Y, Y));
        String cancel = """
            <OTA_VehCancelRQ xmlns="http://www.opentravel.org/OTA/2003/05"><VehCancelRQCore CancelType="Cancel"><UniqueID Type="14" ID="%s"/>
              <PersonName><Surname>Roe</Surname></PersonName></VehCancelRQCore></OTA_VehCancelRQ>""".formatted(number);
        send("/ota/v1/BKG/OTA_VehCancel", cancel);
        send("/ota/v1/BKG/OTA_VehCancel", cancel);
        assertEquals(3, bookings.findByReservationNumber(number).orElseThrow().currentVersion(), "created 1, modified 2, cancelled 3; cancelling again changes nothing");
        List<Integer> versions = webhooks.findAll().stream().filter(d -> number.equals(d.getReservationNumber()) && d.getSubscriptionId() == null)
            .map(d -> { try { return M.readTree(d.getPayload()).path("reservation_version").asInt(); } catch (Exception e) { return -1; } }).toList();
        assertEquals(List.of(1, 1, 2, 3), versions, "every update carries the booking version");
    }

    @Test
    void oneBrokerCannotSeeAnothersBookings() throws Exception {
        rules((agg, r) -> {});
        ArrayNode aggs = (ArrayNode) M.readTree(stateService.getFullState()).path("aggregators");
        ObjectNode other = aggs.get(0).deepCopy();
        other.put("id", "agg-2").put("name", "Other Broker").put("channelCode", "OTH").put("feedKeyHash", PartnerKeyVerifier.sha256Hex("other-key"));
        aggs.add(other);
        stateService.applyPatch(M.writeValueAsString(M.createObjectNode().set("ops", M.createArrayNode()
            .add(M.createObjectNode().put("op", "set").put("key", "aggregators").set("value", aggs)))));
        String r = send("/ota/v1/BKG/OTA_VehRes", direct(Y + "-05-01T10:00:00", Y + "-05-04T10:00:00", "ISO-1", "Roe"));
        String number = r.substring(r.indexOf("ID=\"RSV-") + 4, r.indexOf('"', r.indexOf("ID=\"RSV-") + 4));
        String ret = """
            <OTA_VehRetResRQ xmlns="http://www.opentravel.org/OTA/2003/05"><VehRetResRQCore><UniqueID Type="14" ID="%s"/>
              <PersonName><Surname>Roe</Surname></PersonName></VehRetResRQCore></OTA_VehRetResRQ>""".formatted(number);
        mvc.perform(post("/ota/v1/OTH/OTA_VehRetRes").header("X-Api-Key", "other-key").contentType(MediaType.APPLICATION_XML).content(ret))
            .andExpect(status().isNotFound()).andExpect(content().string(containsString("RESERVATION_NOT_FOUND")));
        mvc.perform(post("/ota/v1/OTH/OTA_VehCancel").header("X-Api-Key", "other-key").contentType(MediaType.APPLICATION_XML).content(ret.replace("VehRetRes", "VehCancel")))
            .andExpect(status().isNotFound());
        mvc.perform(post("/ota/v1/BKG/OTA_VehRetRes").header("X-Api-Key", "other-key").contentType(MediaType.APPLICATION_XML).content(ret))
            .andExpect(status().isUnauthorized());
        assertEquals("CONFIRMED", reservations().path(Y).path("May").get(0).path("status").asText());
    }

    @Test
    void operationsNotAgreedWithTheBrokerAreRefused() throws Exception {
        String r = send("/ota/v1/BKG/OTA_VehRes", direct(Y + "-05-01T10:00:00", Y + "-05-04T10:00:00", "OP-1", "Roe"));
        String number = r.substring(r.indexOf("ID=\"RSV-") + 4, r.indexOf('"', r.indexOf("ID=\"RSV-") + 4));
        rules((agg, rl) -> rl.putObject("operations").put("retrieve", false).put("modify", false).put("cancel", false));
        mvc.perform(post("/ota/v1/BKG/OTA_VehModify").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_XML).content("""
            <OTA_VehModifyRQ xmlns="http://www.opentravel.org/OTA/2003/05"><VehModifyRQCore ModifyType="Modify"><UniqueID Type="14" ID="%s"/>
              <VehRentalCore PickUpDateTime="%s-05-01T10:00:00" ReturnDateTime="%s-05-05T10:00:00"/></VehModifyRQCore></OTA_VehModifyRQ>""".formatted(number, Y, Y)))
            .andExpect(status().isConflict()).andExpect(content().string(containsString("MODIFICATION_NOT_ALLOWED")));
        mvc.perform(post("/ota/v1/BKG/OTA_VehCancel").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_XML).content("""
            <OTA_VehCancelRQ xmlns="http://www.opentravel.org/OTA/2003/05"><VehCancelRQCore CancelType="Cancel"><UniqueID Type="14" ID="%s"/></VehCancelRQCore></OTA_VehCancelRQ>""".formatted(number)))
            .andExpect(status().isConflict()).andExpect(content().string(containsString("CANCELLATION_NOT_ALLOWED")));
        mvc.perform(post("/ota/v1/BKG/OTA_VehRetRes").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_XML).content("""
            <OTA_VehRetResRQ xmlns="http://www.opentravel.org/OTA/2003/05"><VehRetResRQCore><UniqueID Type="14" ID="%s"/></VehRetResRQCore></OTA_VehRetResRQ>""".formatted(number)))
            .andExpect(status().isForbidden());
        assertEquals("CONFIRMED", reservations().path(Y).path("May").get(0).path("status").asText(), "nothing changed");
    }

    @Test
    void turnaroundTimeIsKeptBetweenRentals() throws Exception {
        stateBooking("walk-1", Y + "-05-01T06:00", Y + "-05-01T09:00", false, false);
        assertTrue(sdarOpen(send("/ota/v1/BKG/OTA_VehAvailRate", availAt(Y + "-05-01T10:00:00", Y + "-05-03T10:00:00"))), "back-to-back allowed without turnaround");
        rules((agg, r) -> r.put("turnaroundMinutes", 120));
        assertFalse(sdarOpen(send("/ota/v1/BKG/OTA_VehAvailRate", availAt(Y + "-05-01T10:00:00", Y + "-05-03T10:00:00"))), "2 h cleaning after the 09:00 return");
        assertTrue(sdarOpen(send("/ota/v1/BKG/OTA_VehAvailRate", availAt(Y + "-05-01T11:00:00", Y + "-05-03T10:00:00"))));
    }

    @Test
    void aCarNotBackYetStaysBusy() throws Exception {
        java.time.LocalDateTime now = java.time.LocalDateTime.now(java.time.ZoneId.of("Asia/Amman")).withSecond(0).withNano(0);
        rules((agg, r) -> {
            r.put("overdueHoldHours", 72).put("minLeadHours", 0);
            ((ObjectNode) agg.path("ratePlanHistory").get(0).path("ratePlans").get(0)).put("startDate", now.getYear() + "-01-01");
            for (JsonNode l : r.path("locations")) ((ObjectNode) l).remove("openingHours");
        });
        String from = now.plusDays(1).toString() + ":00", to = now.plusDays(3).toString() + ":00";
        // Went out last week, due back yesterday, not checked in.
        stateBooking("late-1", now.minusDays(7).toString(), now.minusDays(1).toString(), true, false);
        assertFalse(sdarOpen(send("/ota/v1/BKG/OTA_VehAvailRate", availAt(from, to))), "overdue car is not sold again");
        stateBooking("late-1", now.minusDays(7).toString(), now.minusDays(1).toString(), true, true);
        assertTrue(sdarOpen(send("/ota/v1/BKG/OTA_VehAvailRate", availAt(from, to))), "free once checked in");
    }

    @Test
    void timeRulesUseTheBranchTimeZone() throws Exception {
        java.time.LocalDateTime amman = java.time.LocalDateTime.now(java.time.ZoneId.of("Asia/Amman")).withSecond(0).withNano(0);
        rules((agg, r) -> {
            r.put("minLeadHours", 2);
            for (JsonNode l : r.path("locations")) ((ObjectNode) l).remove("openingHours");
        });
        String from = amman.plusHours(3).toString() + ":00", to = amman.plusDays(2).toString() + ":00";
        assertFalse(send("/ota/v1/BKG/OTA_VehAvailRate", availAt(from, to)).contains("INVALID_DATE"), "3 h ahead in Amman is accepted");
        // The same clock time is already past where the branches are 11 hours ahead of Amman.
        rules((agg, r) -> r.put("timeZone", "Etc/GMT-14"));
        assertTrue(send("/ota/v1/BKG/OTA_VehAvailRate", availAt(from, to)).contains("INVALID_DATE"));
    }

    @Test
    void brokerCallsCarryCorrelationAndVersionHeadersWithTheSameBody() throws Exception {
        String ping = "<OTA_PingRQ EchoToken=\"P\"><EchoData>hello</EchoData></OTA_PingRQ>";
        var res = mvc.perform(post("/ota/v1/BKG/OTA_Ping").contentType(MediaType.APPLICATION_XML).content(ping)
                .header("X-Api-Key", KEY).header("X-Correlation-ID", "hog-7731904")).andReturn().getResponse();
        assertEquals(200, res.getStatus());
        assertEquals("hog-7731904", res.getHeader("X-Correlation-ID"), "the broker's own ID comes back");
        assertEquals("ota-1.0", res.getHeader("X-API-Version"));
        assertTrue(res.getContentAsString().contains("<EchoData>hello</EchoData>"), "body unchanged");
        // Without one, an ID is made; an unsafe one is not reused.
        var made = mvc.perform(post("/ota/v1/BKG/OTA_Ping").contentType(MediaType.APPLICATION_XML).content(ping)
                .header("X-Api-Key", KEY).header("X-Correlation-ID", "<script>")).andReturn().getResponse();
        assertTrue(made.getHeader("X-Correlation-ID").startsWith("cor-"), made.getHeader("X-Correlation-ID"));
        // Staff screens and the hosting health check are untouched.
        var plain = mvc.perform(get("/health")).andReturn().getResponse();
        assertEquals("OK", plain.getContentAsString());
        assertNull(plain.getHeader("X-Correlation-ID"));
    }

    @Test
    void ota2024AAnd2018AAddressesServeTheSameCoreStrictly() throws Exception {
        // Same search through v1 and 2024A: same offers.
        String v1 = send("/ota/v1/BKG/OTA_VehAvailRate", avail("V1"));
        var res = mvc.perform(post("/ota/2024A/BKG/OTA_VehAvailRate").contentType(MediaType.APPLICATION_XML).content(avail("V24"))
                .header("X-Api-Key", KEY)).andReturn().getResponse();
        assertEquals(200, res.getStatus(), res.getContentAsString());
        assertEquals("2024A", res.getHeader("X-OTA-Release"));
        assertEquals("ota-2024A-1.0", res.getHeader("X-API-Version"));
        String v24 = res.getContentAsString();
        assertTrue(v24.contains("<Success/>") && v24.contains("Code=\"SDAR\""), v24);
        assertEquals(v1.split("RateTotalAmount").length, v24.split("RateTotalAmount").length, "same offers");
        // The offer (quote token) books through 2024A, and the broker reference prevents a duplicate.
        String booked = send("/ota/2024A/BKG/OTA_VehRes", vehRes(firstOffer(v24), "V24-1"));
        assertTrue(booked.contains("<ReservationStatus>CONFIRMED</ReservationStatus>"), booked);
        String again = send("/ota/2024A/BKG/OTA_VehRes", vehRes(firstOffer(v24), "V24-1"));
        assertEquals(booked.substring(booked.indexOf("ConfID")).split("\"")[2], again.substring(again.indexOf("ConfID")).split("\"")[2], "same booking returned");
        // 2018A works the same way.
        var r18 = mvc.perform(post("/ota/2018A/BKG/OTA_Ping").contentType(MediaType.APPLICATION_XML)
                .content("<OTA_PingRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\"><EchoData>e</EchoData></OTA_PingRQ>")
                .header("X-Api-Key", KEY)).andReturn().getResponse();
        assertEquals(200, r18.getStatus());
        assertEquals("ota-2018A-1.0", r18.getHeader("X-API-Version"));
    }

    @Test
    void releaseAddressesRejectMessagesThatDoNotMatchTheSchema() throws Exception {
        var noNs = mvc.perform(post("/ota/2024A/BKG/OTA_Ping").contentType(MediaType.APPLICATION_XML)
                .content("<OTA_PingRQ><EchoData>e</EchoData></OTA_PingRQ>").header("X-Api-Key", KEY)).andReturn().getResponse();
        assertEquals(400, noNs.getStatus());
        assertTrue(noNs.getContentAsString().contains("Code=\"321\"") && noNs.getContentAsString().contains("namespace"), noNs.getContentAsString());
        var wrongRoot = mvc.perform(post("/ota/2024A/BKG/OTA_VehRes").contentType(MediaType.APPLICATION_XML)
                .content(avail("X")).header("X-Api-Key", KEY)).andReturn().getResponse();
        assertEquals(400, wrongRoot.getStatus());
        assertTrue(wrongRoot.getContentAsString().contains("root element must be OTA_VehResRQ"));
        var xxe = mvc.perform(post("/ota/2024A/BKG/OTA_Ping").contentType(MediaType.APPLICATION_XML)
                .content("<?xml version=\"1.0\"?><!DOCTYPE x [<!ENTITY e SYSTEM \"file:///etc/passwd\">]><OTA_PingRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\"><EchoData>&e;</EchoData></OTA_PingRQ>")
                .header("X-Api-Key", KEY)).andReturn().getResponse();
        assertEquals(400, xxe.getStatus());
        assertFalse(xxe.getContentAsString().contains("root:"), "no file contents");
        assertEquals(405, mvc.perform(get("/ota/2024A/BKG/OTA_VehAvailRate")).andReturn().getResponse().getStatus());
        assertEquals(404, mvc.perform(post("/ota/2024A/BKG/OTA_Nothing").content("<x/>")).andReturn().getResponse().getStatus());
        // No key: refused by the same gateway as v1.
        var nokey = mvc.perform(post("/ota/2024A/BKG/OTA_Ping").contentType(MediaType.APPLICATION_XML)
                .content("<OTA_PingRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\"/>")).andReturn().getResponse();
        assertTrue(nokey.getContentAsString().contains("AUTH_FAILED"), nokey.getContentAsString());
    }

    @Test
    void versionNeutralPingRateSheetAndSoapAddresses() throws Exception {
        assertTrue(mvc.perform(get("/ota/BKG/ping").header("X-Api-Key", KEY)).andReturn().getResponse().getContentAsString().contains("<Success/>"));
        assertTrue(mvc.perform(get("/ota/BKG/ratesheet").header("X-Api-Key", KEY)).andReturn().getResponse().getContentAsString().contains("RateSheet"));
        String wsdl = mvc.perform(get("/ota/BKG/soap").param("wsdl", "")).andReturn().getResponse().getContentAsString();
        assertTrue(wsdl.contains("definitions") && wsdl.contains("/ota/BKG/soap"), wsdl.substring(0, Math.min(300, wsdl.length())));
        String soapRs = mvc.perform(post("/ota/BKG/soap").contentType(MediaType.TEXT_XML).content(soap11("BKG", KEY,
            "<OTA_PingRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\"><EchoData>soap</EchoData></OTA_PingRQ>"))).andReturn().getResponse().getContentAsString();
        assertTrue(soapRs.contains("<EchoData>soap</EchoData>"), soapRs);
    }

    /** Creates an OAuth client through the staff API and returns {clientId, secret}. */
    String[] oauthClient(String env, String... scopes) throws Exception {
        String body = M.writeValueAsString(M.createObjectNode().put("environment", env).put("name", "test")
            .set("scopes", M.valueToTree(java.util.List.of(scopes))));
        JsonNode c = M.readTree(mvc.perform(post("/api/channels/agg-1/oauth-clients").contentType(MediaType.APPLICATION_JSON).content(body)
            .header("Authorization", staffToken())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        return new String[] { c.path("clientId").asText(), c.path("clientSecret").asText() };
    }

    String accessToken(String[] client, String scope) throws Exception {
        var rq = post("/oauth/token").contentType(MediaType.APPLICATION_FORM_URLENCODED).param("grant_type", "client_credentials")
            .header("Authorization", "Basic " + java.util.Base64.getEncoder().encodeToString((client[0] + ":" + client[1]).getBytes()));
        if (scope != null) rq = rq.param("scope", scope);
        JsonNode t = M.readTree(mvc.perform(rq).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals("Bearer", t.path("token_type").asText());
        assertEquals(1800, t.path("expires_in").asInt());
        return "Bearer " + t.path("access_token").asText();
    }

    @Test
    void oauthClientCredentialsIssueScopedTokensAndKeepStaffAndBrokersApart() throws Exception {
        String[] all = oauthClient("production");
        assertTrue(all[0].startsWith("urd_live_") && all[1].length() >= 40);
        String list = mvc.perform(get("/api/channels/agg-1/oauth-clients").header("Authorization", staffToken())).andReturn().getResponse().getContentAsString();
        assertTrue(list.contains(all[0]) && !list.contains(all[1]), "the secret is never shown again");
        // Wrong secret, wrong grant, scope not granted.
        assertEquals(401, mvc.perform(post("/oauth/token").contentType(MediaType.APPLICATION_FORM_URLENCODED).param("grant_type", "client_credentials")
            .param("client_id", all[0]).param("client_secret", "nope")).andReturn().getResponse().getStatus());
        assertEquals(400, mvc.perform(post("/oauth/token").contentType(MediaType.APPLICATION_FORM_URLENCODED).param("grant_type", "password")
            .param("client_id", all[0]).param("client_secret", all[1])).andReturn().getResponse().getStatus());
        String[] narrow = oauthClient("production", "locations:read");
        assertEquals(400, mvc.perform(post("/oauth/token").contentType(MediaType.APPLICATION_FORM_URLENCODED).param("grant_type", "client_credentials")
            .param("client_id", narrow[0]).param("client_secret", narrow[1]).param("scope", "reservations:write")).andReturn().getResponse().getStatus());
        // No token / a staff token on v3 -> 401; a missing scope -> 403.
        JsonNode noTok = M.readTree(mvc.perform(get("/api/v3/locations")).andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString());
        assertEquals("error", noTok.path("status").asText());
        assertEquals("AUTH_FAILED", noTok.path("error").path("code").asText());
        assertEquals("3.0.0", noTok.path("apiVersion").asText());
        mvc.perform(get("/api/v3/locations").header("Authorization", staffToken())).andExpect(status().isUnauthorized());
        String narrowTok = accessToken(narrow, null);
        mvc.perform(get("/api/v3/fleet-groups").header("Authorization", narrowTok)).andExpect(status().isForbidden());
        // A broker token never passes as a staff login.
        int staffWithBroker = mvc.perform(get("/api/channels/agg-1/oauth-clients").header("Authorization", narrowTok)).andReturn().getResponse().getStatus();
        assertTrue(staffWithBroker == 401 || staffWithBroker == 403, "got " + staffWithBroker);
        // Revoked clients' tokens stop working at once.
        mvc.perform(get("/api/v3/locations").header("Authorization", narrowTok)).andExpect(status().isOk());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/channels/agg-1/oauth-clients/" + narrow[0])
            .header("Authorization", staffToken())).andExpect(status().isOk());
        mvc.perform(get("/api/v3/locations").header("Authorization", narrowTok)).andExpect(status().isUnauthorized());
    }

    @Test
    void restV3SearchQuoteBookRetrieveCancelWithEnvelopeEtagAndIdempotency() throws Exception {
        String tok = accessToken(oauthClient("production"), null);
        // Reference data: envelope + ETag.
        var loc = mvc.perform(get("/api/v3/locations").header("Authorization", tok).header("X-Correlation-ID", "aue-1")).andReturn().getResponse();
        JsonNode env = M.readTree(loc.getContentAsString());
        for (String f : new String[] {"status", "requestId", "correlationId", "apiVersion", "timestamp", "data"}) assertTrue(env.has(f), f);
        assertEquals("aue-1", env.path("correlationId").asText());
        assertTrue(loc.getContentType().toLowerCase().contains("charset=utf-8"), loc.getContentType());
        assertEquals("production", env.path("environment").asText());
        assertEquals("AMM", env.path("data").path("items").get(0).path("code").asText());
        String etag = loc.getHeader("ETag");
        assertNotNull(etag);
        mvc.perform(get("/api/v3/locations").header("Authorization", tok).header("If-None-Match", etag)).andExpect(status().isNotModified());
        // Search (camelCase, pickUp/return objects) -> quotes.
        String search = """
            {"pickUp": {"location": "AMM", "local": "%s-05-01T10:00"}, "return": {"location": "AMM", "local": "%s-05-06T10:00"}, "driverAge": 35}""".formatted(Y, Y);
        JsonNode found = M.readTree(mvc.perform(post("/api/v3/availability/search").contentType(MediaType.APPLICATION_JSON).content(search)
            .header("Authorization", tok)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        JsonNode offer = null;
        for (JsonNode o : found.path("data").path("offers")) if ("SDAR".equals(o.path("vehicleGroup").asText())) offer = o;
        assertNotNull(offer, found.toString());
        String quoteId = offer.path("quoteId").asText();
        assertTrue(quoteId.startsWith("OFF-"));
        mvc.perform(get("/api/v3/quotes/" + quoteId + "/rules").header("Authorization", tok)).andExpect(status().isOk());
        // Book: Idempotency-Key required; the same key returns the same booking.
        String book = """
            {"quoteId": "%s", "brokerReference": "V3-1", "customer": {"firstName": "Omar", "lastName": "Haddad", "email": "omar@example.com"}}""".formatted(quoteId);
        mvc.perform(post("/api/v3/reservations").contentType(MediaType.APPLICATION_JSON).content(book).header("Authorization", tok)).andExpect(status().isBadRequest());
        JsonNode made = M.readTree(mvc.perform(post("/api/v3/reservations").contentType(MediaType.APPLICATION_JSON).content(book)
            .header("Authorization", tok).header("Idempotency-Key", "v3-key-1")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String id = made.path("data").path("reservationId").asText();
        assertTrue(id.matches("RSV-\\d{4}-\\d{6}"), id);
        JsonNode again = M.readTree(mvc.perform(post("/api/v3/reservations").contentType(MediaType.APPLICATION_JSON).content(book)
            .header("Authorization", tok).header("Idempotency-Key", "v3-key-1")).andReturn().getResponse().getContentAsString());
        assertEquals(id, again.path("data").path("reservationId").asText());
        // Retrieve, list, cancel.
        assertEquals("CONFIRMED", M.readTree(mvc.perform(get("/api/v3/reservations/" + id).header("Authorization", tok)).andReturn().getResponse()
            .getContentAsString()).path("data").path("status").asText());
        JsonNode page = M.readTree(mvc.perform(get("/api/v3/reservations").param("from", Y + "-05-01").param("to", Y + "-05-31").param("limit", "1")
            .header("Authorization", tok)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals(1, page.path("data").path("reservations").size());
        JsonNode cancelled = M.readTree(mvc.perform(post("/api/v3/reservations/" + id + "/cancellations").contentType(MediaType.APPLICATION_JSON)
            .content("{\"reason\": \"customer request\"}").header("Authorization", tok).header("Idempotency-Key", "v3-cancel-1"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals("CANCELLED", cancelled.path("data").path("status").asText());
        // A v3 error keeps the envelope, with the OTA code.
        JsonNode missing = M.readTree(mvc.perform(get("/api/v3/reservations/RSV-1999-000001").header("Authorization", tok)).andReturn().getResponse().getContentAsString());
        assertEquals("RESERVATION_NOT_FOUND", missing.path("error").path("code").asText());
        assertEquals("245", missing.path("error").path("otaCode").asText());
    }

    @Test
    void sandboxOauthClientsOnlyEverReachTheSandbox() throws Exception {
        String tok = accessToken(oauthClient("sandbox"), null);
        JsonNode env = M.readTree(mvc.perform(get("/api/v3/locations").header("Authorization", tok)).andReturn().getResponse().getContentAsString());
        assertEquals("sandbox", env.path("environment").asText());
        String search = """
            {"pickupLocation": "AMM", "pickupAt": "%s-05-01T10:00", "returnAt": "%s-05-06T10:00"}""".formatted(Y, Y);
        JsonNode found = M.readTree(mvc.perform(post("/api/v3/availability/search").contentType(MediaType.APPLICATION_JSON).content(search)
            .header("Authorization", tok)).andReturn().getResponse().getContentAsString());
        String quoteId = found.path("data").path("offers").get(0).path("quoteId").asText();
        mvc.perform(post("/api/v3/reservations").contentType(MediaType.APPLICATION_JSON)
            .content("{\"quoteId\": \"" + quoteId + "\", \"brokerReference\": \"SBX-V3\", \"customer\": {\"firstName\": \"T\", \"lastName\": \"Test\"}}")
            .header("Authorization", tok).header("Idempotency-Key", "sbx-1")).andExpect(status().isCreated());
        assertEquals(0, reservations().path(Y).path("May").size(), "a sandbox booking never reaches the reservations list");
    }

    @Test
    void webhooksV2SignRetryFor72HoursDeadLetterAndKeepEnvironmentsApart() throws Exception {
        String tok = accessToken(oauthClient("production"), null);
        // Only public HTTPS endpoints.
        mvc.perform(post("/api/v3/webhooks/subscriptions").contentType(MediaType.APPLICATION_JSON).content("{\"url\": \"https://localhost/hook\"}")
            .header("Authorization", tok)).andExpect(status().isBadRequest());
        JsonNode sub = M.readTree(mvc.perform(post("/api/v3/webhooks/subscriptions").contentType(MediaType.APPLICATION_JSON)
            .content("{\"url\": \"https://hooks.example.com/urdrive\", \"events\": [\"reservation.confirmed\", \"reservation.cancelled\"]}")
            .header("Authorization", tok)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("data");
        String subId = sub.path("subscriptionId").asText(), secret = sub.path("secret").asText();
        assertTrue(subId.startsWith("whsub_") && secret.startsWith("whsec_"));
        WebhookSubscription stored = subscriptions.findByPublicId(subId).orElseThrow();
        assertFalse(stored.getSecretEnc().contains(secret), "secret stored encrypted");
        // A booking queues a signed v2 event with the v3 envelope.
        String search = """
            {"pickupLocation": "AMM", "pickupAt": "%s-05-01T10:00", "returnAt": "%s-05-06T10:00"}""".formatted(Y, Y);
        String quoteId = M.readTree(mvc.perform(post("/api/v3/availability/search").contentType(MediaType.APPLICATION_JSON).content(search)
            .header("Authorization", tok)).andReturn().getResponse().getContentAsString()).path("data").path("offers").get(0).path("quoteId").asText();
        String rsv = M.readTree(mvc.perform(post("/api/v3/reservations").contentType(MediaType.APPLICATION_JSON)
            .content("{\"quoteId\": \"" + quoteId + "\", \"brokerReference\": \"WH-1\", \"customer\": {\"firstName\": \"A\", \"lastName\": \"B\"}}")
            .header("Authorization", tok).header("Idempotency-Key", "wh-1")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString())
            .path("data").path("reservationId").asText();
        java.util.List<ChannelWebhookDelivery> mine = webhooks.findAll().stream().filter(d -> stored.getId().equals(d.getSubscriptionId())).toList();
        assertEquals(1, mine.size(), "only the subscribed event (confirmed) was queued");
        ChannelWebhookDelivery d = mine.get(0);
        JsonNode payload = M.readTree(d.getPayload());
        assertEquals("reservation.confirmed", payload.path("type").asText());
        assertEquals(rsv, payload.path("subject").path("reservationId").asText());
        assertEquals("production", payload.path("environment").asText());
        assertEquals("3.0.0", payload.path("apiVersion").asText());
        // Signature: v1=HMAC(secret, id.timestamp.nonce.body); during a rotation both secrets sign.
        String header = webhooksV2.signatureHeader(stored, d.getEventId(), 1700000000L, "n1", d.getPayload());
        assertEquals("v1=" + WebhookV2Service.hmac(secret, d.getEventId() + ".1700000000.n1." + d.getPayload()), header);
        JsonNode rotated = M.readTree(mvc.perform(post("/api/v3/webhooks/subscriptions/" + subId + "/rotate-secret").header("Authorization", tok))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("data");
        String two = webhooksV2.signatureHeader(subscriptions.findByPublicId(subId).orElseThrow(), "evt_x", 1L, "n", "{}");
        assertEquals("v1=" + WebhookV2Service.hmac(rotated.path("secret").asText(), "evt_x.1.n.{}") + ",v1=" + WebhookV2Service.hmac(secret, "evt_x.1.n.{}"), two);
        // A failed attempt is retried after about a minute; the schedule ends after 72 hours (dead letter).
        ChannelWebhookDelivery after = webhooksV2.attempt(d);
        assertEquals(ChannelWebhookDelivery.Status.PENDING, after.getStatus());
        long wait = java.time.Duration.between(java.time.Instant.now(), after.getNextAttemptAt()).getSeconds();
        assertTrue(wait > 30 && wait < 90, "first retry ~1 min, got " + wait);
        java.time.Instant created = java.time.Instant.now().minus(java.time.Duration.ofHours(71));
        assertNull(WebhookV2Service.nextAttempt(created, 9, java.time.Instant.now()), "past 72 h: dead letter");
        assertNotNull(WebhookV2Service.nextAttempt(java.time.Instant.now(), 3, java.time.Instant.now()));
        // Pausing holds deliveries; a later event of the same reservation waits for the earlier one.
        mvc.perform(patch("/api/v3/webhooks/subscriptions/" + subId).contentType(MediaType.APPLICATION_JSON).content("{\"status\": \"paused\"}")
            .header("Authorization", tok)).andExpect(status().isOk());
        assertFalse(webhooksV2.mayDeliverNow(after));
        mvc.perform(patch("/api/v3/webhooks/subscriptions/" + subId).contentType(MediaType.APPLICATION_JSON).content("{\"status\": \"active\"}")
            .header("Authorization", tok)).andExpect(status().isOk());
        mvc.perform(post("/api/v3/reservations/" + rsv + "/cancellations").header("Authorization", tok).header("Idempotency-Key", "wh-c1")).andExpect(status().isOk());
        ChannelWebhookDelivery cancelled = webhooks.findAll().stream().filter(x -> stored.getId().equals(x.getSubscriptionId())
            && "reservation.cancelled".equals(x.getEventType())).findFirst().orElseThrow();
        assertFalse(webhooksV2.mayDeliverNow(cancelled), "waits for the pending confirmed event");
        // The broker sees its deliveries and can replay one.
        JsonNode log = M.readTree(mvc.perform(get("/api/v3/webhooks/deliveries").header("Authorization", tok)).andReturn().getResponse().getContentAsString());
        assertEquals(2, log.path("data").path("deliveries").size());
        mvc.perform(post("/api/v3/webhooks/deliveries/" + d.getEventId() + "/replay").header("Authorization", tok)).andExpect(status().isOk());
        // A sandbox client sees none of the production subscriptions.
        String sbx = accessToken(oauthClient("sandbox"), null);
        assertEquals(0, M.readTree(mvc.perform(get("/api/v3/webhooks/subscriptions").header("Authorization", sbx)).andReturn().getResponse()
            .getContentAsString()).path("data").path("subscriptions").size());
        mvc.perform(post("/api/v3/webhooks/deliveries/" + d.getEventId() + "/replay").header("Authorization", sbx)).andExpect(status().isNotFound());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/v3/webhooks/subscriptions/" + subId)
            .header("Authorization", tok)).andExpect(status().isOk());
    }

    @Test
    void brokerMayUseNctOrTheCodeOfTheSupplierName() throws Exception {
        java.util.function.Function<String, String> withVendor = code -> avail("V-" + code)
            .replace("<VehAvailRQCore>", "<VehAvailRQCore><VendorPrefs><VendorPref Code=\"" + code + "\"/></VendorPrefs>");
        assertTrue(send("/ota/v1/BKG/OTA_VehAvailRate", avail("V0")).contains("<Vendor Code=\"NCT\""), "no code sent: unchanged");
        assertTrue(send("/ota/v1/BKG/OTA_VehAvailRate", withVendor.apply("NCT")).contains("<Vendor Code=\"NCT\""), "NCT answered with NCT");
        String urd = send("/ota/v1/BKG/OTA_VehAvailRate", withVendor.apply("URD"));
        assertTrue(urd.contains("<Vendor Code=\"URD\"") && urd.contains("<Success"), "URD (from UR-Drive Jordan) answered with URD: " + urd);
        assertTrue(send("/ota/v1/BKG/OTA_VehAvailRate", withVendor.apply("udj")).contains("<Vendor Code=\"UDJ\""), "initials, any case");
        assertTrue(send("/ota/v1/BKG/OTA_VehAvailRate", withVendor.apply("ZZZ")).contains("<Vendor Code=\"NCT\""), "unknown code: the channel's code");
    }

    @Test
    void supplierNameShownToBrokersIsAChannelSetting() throws Exception {
        String v1 = send("/ota/v1/BKG/OTA_VehAvailRate", avail("N1"));
        assertTrue(v1.contains(">UR-Drive Jordan</Vendor>") && !v1.contains("NCT Rental"), "company default, never the NCT name: " + v1);
        rules((agg, r) -> agg.put("vendorName", "UR-Drive Jordan"));
        String v24 = send("/ota/2024A/BKG/OTA_VehAvailRate", avail("N2"));
        assertTrue(v24.contains(">UR-Drive Jordan</Vendor>") && !v24.contains("NCT Rental"), v24);
    }

    @Test
    void brokerCommercialTermsAreBuiltIntoTheNetRateAndClosedDatesAreEnforced() throws Exception {
        assertTrue(send("/ota/v1/BKG/OTA_VehAvailRate", avail("C0")).contains("EstimatedTotalAmount=\"225.00\""), "5 × 40 + GPS 25 without terms");
        try {
            rules((agg, r) -> r.putObject("commercial").put("markupPercent", 10).put("version", 1));
            String up = send("/ota/v1/BKG/OTA_VehAvailRate", avail("C1"));
            assertTrue(up.contains("EstimatedTotalAmount=\"245.00\"") && up.contains("UnitCharge=\"44.00\""), "10 % on the daily rate, extras unchanged: " + up);
            assertFalse(up.contains("MARKUP") || up.contains("markup"), "the markup is never shown to the broker");

            rules((agg, r) -> ((ObjectNode) r.path("commercial")).putObject("groups").putObject("SDAR").put("markupPercent", -5));
            assertTrue(send("/ota/v1/BKG/OTA_VehAvailRate", avail("C2")).contains("EstimatedTotalAmount=\"215.00\""), "group terms win: 5 × 38 + 25");

            rules((agg, r) -> ((ObjectNode) r.path("commercial")).put("minRentalDays", 7));
            String shortRental = send("/ota/v1/BKG/OTA_VehAvailRate", avail("C3"));
            assertTrue(shortRental.contains("The shortest rental is 7 days"), shortRental);

            rules((agg, r) -> ((ObjectNode) r.path("commercial")).put("minRentalDays", 1).putArray("closedToArrival").add(Y + "-05-01"));
            assertTrue(send("/ota/v1/BKG/OTA_VehAvailRate", avail("C4")).contains("No pick-ups on " + Y + "-05-01"));

            rules((agg, r) -> {
                ObjectNode com = (ObjectNode) r.path("commercial");
                com.putArray("closedToArrival");
                com.putArray("blackouts").addObject().put("from", Y + "-05-03").put("to", Y + "-05-03").put("note", "Fully booked event");
            });
            String stop = send("/ota/v1/BKG/OTA_VehAvailRate", avail("C5"));
            assertFalse(stop.contains("EstimatedTotalAmount=\"215.00\""), "stop sale closes the group: " + stop);
            String book = send("/ota/v1/BKG/OTA_VehRes", direct(Y + "-05-01T10:00:00", Y + "-05-04T10:00:00", "COM-1", "Roe"));
            assertFalse(book.contains("<Success/>"), "a stop sale cannot be booked around: " + book);
        } finally {
            rules((agg, r) -> r.remove("commercial"));
        }
        assertTrue(send("/ota/v1/BKG/OTA_VehAvailRate", avail("C6")).contains("EstimatedTotalAmount=\"225.00\""), "back to the published rate");
    }

    @Test
    void commercialTermsAddUpByDayAndBookingWindow() {
        ObjectNode r = M.createObjectNode();
        ObjectNode com = r.putObject("commercial").put("markupPercent", 10).put("roundTo", 1);
        com.putObject("pickupDayPercent").put("fri", 15);
        com.putObject("earlyBooking").put("days", 60).put("percent", -8);
        com.putObject("lastMinute").put("hours", 48).put("percent", 5);
        ChannelCommercial c = ChannelCommercial.of(r);
        java.time.LocalDateTime friday = java.time.LocalDateTime.of(2027, 3, 12, 10, 0);
        assertEquals(java.time.DayOfWeek.FRIDAY, friday.getDayOfWeek());
        assertEquals(0, new java.math.BigDecimal("25").compareTo(c.percentFor("CDAR", friday, friday.minusDays(10))), "10 + 15");
        assertEquals(0, new java.math.BigDecimal("17").compareTo(c.percentFor("CDAR", friday, friday.minusDays(90))), "10 + 15 - 8");
        assertEquals(0, new java.math.BigDecimal("15").compareTo(c.percentFor("CDAR", friday.plusDays(1), friday)), "10 + 5 within 48 h");
        assertEquals("44.00", c.adjustDaily(new java.math.BigDecimal("39.90"), java.math.BigDecimal.TEN).toPlainString(), "43.89 rounded to whole units");
        assertTrue(ChannelCommercial.of(M.createObjectNode()).neutral(), "no block = no change");
        assertTrue(ChannelCommercial.of(M.createObjectNode().set("commercial", M.createObjectNode().put("markupPercent", 0))).neutral());
    }

    /** Sends one request of the Postman collection as Postman would: variables filled, its own auth and headers. */
    org.springframework.mock.web.MockHttpServletResponse postman(JsonNode collection, String folder, String name, java.util.Map<String, String> vars) throws Exception {
        JsonNode item = null;
        for (JsonNode f : collection.path("item")) if (f.path("name").asText().endsWith(folder)) for (JsonNode i : f.path("item")) if (name.equals(i.path("name").asText())) item = i;
        assertNotNull(item, folder + " / " + name);
        JsonNode r = item.path("request");
        java.util.function.UnaryOperator<String> fill = in -> {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("\\{\\{([$A-Za-z]+)}}").matcher(in);
            StringBuilder out = new StringBuilder();
            while (m.find()) {
                String k = m.group(1);
                String v = "$guid".equals(k) ? java.util.UUID.randomUUID().toString() : "$timestamp".equals(k) ? String.valueOf(System.nanoTime()) : vars.get(k);
                assertNotNull(v, "variable " + k + " in " + name);
                m.appendReplacement(out, java.util.regex.Matcher.quoteReplacement(v));
            }
            return m.appendTail(out).toString();
        };
        String url = fill.apply(r.path("url").path("raw").asText());
        var rq = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request(org.springframework.http.HttpMethod.valueOf(r.path("method").asText()), java.net.URI.create(url));
        for (JsonNode h : r.path("header")) rq = rq.header(h.path("key").asText(), fill.apply(h.path("value").asText()));
        String auth = r.path("auth").path("type").asText(collection.path("auth").path("type").asText());
        if ("basic".equals(auth)) rq = rq.header("Authorization", "Basic " + java.util.Base64.getEncoder().encodeToString((vars.get("clientId") + ":" + vars.get("clientSecret")).getBytes()));
        else if ("bearer".equals(auth)) rq = rq.header("Authorization", "Bearer " + vars.get("accessToken"));
        JsonNode body = r.path("body");
        if ("raw".equals(body.path("mode").asText())) rq = rq.content(fill.apply(body.path("raw").asText()));
        if ("urlencoded".equals(body.path("mode").asText())) for (JsonNode f : body.path("urlencoded")) rq = rq.param(f.path("key").asText(), f.path("value").asText());
        return mvc.perform(rq).andReturn().getResponse();
    }

    @Test
    void developerPortalAndPostmanCollectionWorkAsPublished() throws Exception {
        var page = mvc.perform(get("/ota/developers")).andExpect(status().isOk()).andReturn().getResponse();
        String html = page.getContentAsString();
        assertTrue(page.getContentType().startsWith("text/html") && page.getHeader("Content-Security-Policy").contains("frame-ancestors 'none'"));
        assertTrue(html.contains("UR-Drive Jordan") && html.contains("https://www.nctrental.com/api/v3/postman.json") && html.contains("X-URD-Signature"), "brand and links");
        assertFalse(html.contains("NCT") || html.contains("__BASE__") || html.contains("__BRAND__") || html.contains(KEY), "no system name, placeholders or keys");

        JsonNode col = M.readTree(mvc.perform(get("/api/v3/postman.json")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals("https://schema.getpostman.com/json/collection/v2.1.0/collection.json", col.path("info").path("schema").asText());
        assertFalse(col.toString().contains("NCT"), "brokers never see the system name");

        // REST v3 exactly as the collection sends it.
        String[] client = oauthClient("sandbox");
        java.util.Map<String, String> v = new java.util.HashMap<>(java.util.Map.of("baseUrl", "", "clientId", client[0], "clientSecret", client[1],
            "pickUpLocation", "AMM", "pickUpAt", Y + "-06-01T10:00", "returnAt", Y + "-06-05T10:00", "listFrom", Y + "-06-01", "listTo", Y + "-06-30"));
        v.put("channel", "BKG"); v.put("apiKey", KEY);
        var tok = postman(col, "Authentication", "Get access token", v);
        assertEquals(200, tok.getStatus(), tok.getContentAsString());
        v.put("accessToken", M.readTree(tok.getContentAsString()).path("access_token").asText());
        for (String n : List.of("Health", "Locations", "Location detail", "Vehicle groups", "Extras", "Insurance covers")) {
            var r = postman(col, "Reference data", n, v);
            assertEquals(200, r.getStatus(), n + ": " + r.getContentAsString());
        }
        JsonNode found = M.readTree(postman(col, "Availability and quotes", "Search availability", v).getContentAsString());
        for (JsonNode o : found.path("data").path("offers")) if ("Available".equals(o.path("status").asText())) { v.put("quoteId", o.path("quoteId").asText()); break; }
        assertNotNull(v.get("quoteId"), found.toString());
        assertEquals(200, postman(col, "Availability and quotes", "Quote", v).getStatus());
        assertEquals(200, postman(col, "Availability and quotes", "Quote rules", v).getStatus());
        var made = postman(col, "Reservations", "Book the quote", v);
        assertEquals(201, made.getStatus(), made.getContentAsString());
        v.put("reservationId", M.readTree(made.getContentAsString()).path("data").path("reservationId").asText());
        for (String n : List.of("Retrieve", "List by pick-up date", "Modify", "Cancel")) {
            var r = postman(col, "Reservations", n, v);
            assertEquals(200, r.getStatus(), n + ": " + r.getContentAsString());
        }
        assertEquals(200, postman(col, "Inventory", "Inventory", v).getStatus());
        assertEquals(200, postman(col, "Webhooks v2", "List subscriptions", v).getStatus());
        assertEquals(200, postman(col, "Webhooks v2", "Dead-letter list", v).getStatus());

        // OTA XML 2024A exactly as the collection sends it.
        for (String n : List.of("Ping", "Locations")) assertTrue(postman(col, "OTA XML 2024A", n, v).getContentAsString().contains("<Success/>"), n);
        String avail = postman(col, "OTA XML 2024A", "Availability and rates", v).getContentAsString();
        java.util.regex.Matcher offer = java.util.regex.Pattern.compile("Type=\"16\" ID=\"(OFF-[^\"]+)\"").matcher(avail);
        assertTrue(offer.find(), "the collection's own pattern finds the offer: " + avail);
        v.put("offerId", offer.group(1));
        String booked = postman(col, "OTA XML 2024A", "Book", v).getContentAsString();
        java.util.regex.Matcher rsv = java.util.regex.Pattern.compile("ID=\"(RSV-[^\"]+)\"").matcher(booked);
        assertTrue(booked.contains("<Success/>") && rsv.find(), booked);
        v.put("reservationId", rsv.group(1));
        assertTrue(postman(col, "OTA XML 2024A", "Retrieve", v).getContentAsString().contains("<Success/>"));
        assertTrue(postman(col, "OTA XML 2024A", "Cancel", v).getContentAsString().contains("<Success/>"));
    }

    @Test
    void signedRequestsAcceptTheDocumentedHeaderNames() throws Exception {
        String secret = hooks.rotateSecret("agg-1");
        rules((agg, r) -> r.put("requireSignature", true));
        try {
            String body = avail("URD1");
            long ts = System.currentTimeMillis() / 1000;
            String ok = mvc.perform(post("/ota/2024A/BKG/OTA_VehAvailRate").header("X-Api-Key", KEY).header("X-URD-Timestamp", String.valueOf(ts))
                .header("X-URD-Signature", "sha256=" + ChannelWebhookService.sign(secret, ts + "." + body)).contentType(MediaType.APPLICATION_XML).content(body))
                .andReturn().getResponse().getContentAsString();
            assertTrue(ok.contains("<Success/>"), ok);
            String missing = send("/ota/2024A/BKG/OTA_VehAvailRate", avail("URD2"));
            assertTrue(missing.contains("X-URD-Signature") && !missing.contains("NCT"), missing);
        } finally {
            rules((agg, r) -> r.put("requireSignature", false));
        }
    }

    @Test
    void arabicIsServedOnlyWhenTheBrokerAsksForIt() throws Exception {
        rules((agg, r) -> {
            ((ObjectNode) r.path("locations").get(0)).put("nameAr", "مكتب المطار").put("addressAr", "مطار الملكة علياء الدولي");
            r.putObject("groupDetails").putObject("SDAR").put("description", "Compact sedan").put("descriptionAr", "سيارة سيدان صغيرة");
            ((ObjectNode) agg.path("extras").get(0)).put("nameAr", "جهاز ملاحة");
            agg.put("termsAndConditions", "Fuel: full to full.").put("termsAndConditionsAr", "الوقود: ممتلئ عند الاستلام والتسليم.");
        });
        String loc = "<OTA_VehLocSearchRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\"%s/>";
        var en = mvc.perform(post("/ota/2024A/BKG/OTA_VehLocSearch").header("X-Api-Key", KEY).header("Accept-Language", "ar-JO")
            .contentType(MediaType.APPLICATION_XML).content(loc.formatted(""))).andReturn().getResponse();
        assertTrue(en.getContentAsString().contains("Airport Office") && !en.getContentAsString().contains("مكتب"), "an XML header alone never switches the language");
        assertNull(en.getHeader("Content-Language"), "answers for brokers that do not ask stay exactly as before");
        var ar = mvc.perform(post("/ota/2024A/BKG/OTA_VehLocSearch").header("X-Api-Key", KEY)
            .contentType(MediaType.APPLICATION_XML).content(loc.formatted(" PrimaryLangID=\"ar\""))).andReturn().getResponse();
        ar.setCharacterEncoding("UTF-8");
        assertTrue(ar.getContentAsString().contains("مكتب المطار") && ar.getContentAsString().contains("مطار الملكة علياء الدولي"), ar.getContentAsString());
        assertTrue(ar.getContentAsString().contains("Aqaba Branch"), "no Arabic entered = English");
        assertEquals("ar", ar.getHeader("Content-Language"));
        String availAr = avail("AR1").replace("EchoToken=", "PrimaryLangID=\"ar\" EchoToken=");
        var a = mvc.perform(post("/ota/2024A/BKG/OTA_VehAvailRate").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_XML).content(availAr)).andReturn().getResponse();
        a.setCharacterEncoding("UTF-8");
        assertTrue(a.getContentAsString().contains("جهاز ملاحة"), "extras in Arabic: " + a.getContentAsString());
        assertFalse(send("/ota/v1/BKG/OTA_VehAvailRate", avail("EN1")).contains("جهاز"), "v1 without the attribute is unchanged");

        String tok = accessToken(oauthClient("sandbox"), null);
        var v3 = mvc.perform(get("/api/v3/locations").header("Authorization", tok).header("Accept-Language", "ar")).andReturn().getResponse();
        v3.setCharacterEncoding("UTF-8");
        assertTrue(v3.getContentAsString().contains("مكتب المطار"), v3.getContentAsString());
        var err = mvc.perform(get("/api/v3/locations/NOPE").header("Authorization", tok).header("Accept-Language", "ar")).andReturn().getResponse();
        err.setCharacterEncoding("UTF-8");
        JsonNode e = M.readTree(err.getContentAsString()).path("error");
        assertEquals("INVALID_LOCATION", e.path("code").asText());
        assertEquals("رمز الموقع غير معروف أو غير فعال", e.path("localizedMessage").asText());
        assertFalse(M.readTree(mvc.perform(get("/api/v3/locations/NOPE").header("Authorization", tok)).andReturn().getResponse().getContentAsString())
            .path("error").has("localizedMessage"), "English by default");
        assertEquals(ChannelError.values().length, ChannelLanguage.ERRORS_AR.size(), "every error has an Arabic text");
    }

    @Test
    void retentionRemovesOnlyOldGatewayRecordsNeverLiveBookings() {
        java.time.LocalDateTime old = java.time.LocalDateTime.now().minusDays(200);
        ChannelBooking sbx = new ChannelBooking(), live = new ChannelBooking();
        for (ChannelBooking b : List.of(sbx, live)) {
            b.setChannelId("agg-1"); b.setReservationNumber("RSV-RET-" + (b == sbx ? "S" : "L")); b.setIdempotencyKey("ret-" + System.nanoTime());
            b.setRequestHash("x".repeat(64)); b.setSippCode("SDAR"); b.setPickupAt(old.minusDays(3)); b.setReturnAt(old); b.setStatus("CONFIRMED");
            b.setCreatedAt(java.time.Instant.now().minus(java.time.Duration.ofDays(203)));
        }
        sbx.setSandbox(true);
        bookings.save(sbx); bookings.save(live);
        ChannelWebhookDelivery done = new ChannelWebhookDelivery();
        done.setEventId("evt_ret_1"); done.setChannelId("agg-1"); done.setEventType("reservation.created"); done.setPayload("{}");
        done.setStatus(ChannelWebhookDelivery.Status.DELIVERED); done.setCreatedAt(java.time.Instant.now().minus(java.time.Duration.ofDays(120)));
        webhooks.save(done);
        java.util.Map<String, Object> r = retention.run();
        assertTrue(bookings.findByReservationNumber("RSV-RET-S").isEmpty(), "old test booking removed");
        assertTrue(bookings.findByReservationNumber("RSV-RET-L").isPresent(), "a live booking is never removed");
        assertTrue(webhooks.findById(done.getId()).isEmpty());
        assertTrue(((Number) r.get("sandboxBookings")).intValue() >= 1);
        assertEquals(90, retention.policy().get("sandboxBookingDays"));
        bookings.delete(bookings.findByReservationNumber("RSV-RET-L").orElseThrow());
    }

    @Test
    void statementCanBeSettledInUsd() throws Exception {
        rules((agg, r) -> { agg.put("commissionPercent", 10).put("currency", "JOD"); r.putObject("currencies").put("USD", 1.41); });
        try { settleInUsd(); } finally { rules((agg, r) -> { agg.put("currency", "USD"); r.remove("currencies"); }); }
    }

    void settleInUsd() throws Exception {
        String body = """
            {"idempotency_key":"usd-1","broker_reference":"USD-1","itinerary":{"pickup_location":"AMM","pickup_at":"%s-08-01T09:00:00","return_at":"%s-08-03T09:00:00","vehicle_group":"SDAR"},
             "customer":{"first_name":"Jane","last_name":"Smith"}}""".formatted(Y, Y);
        mvc.perform(post("/partner/v1/BKG/reservations").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        JsonNode jod = M.readTree(mvc.perform(get("/api/channels/agg-1/statement").param("month", Y + "-08").header("Authorization", staffToken()))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        JsonNode usd = M.readTree(mvc.perform(get("/api/channels/agg-1/statement").param("month", Y + "-08").param("currency", "USD").header("Authorization", staffToken()))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals("USD", usd.path("currency").asText());
        assertEquals(jod.path("currency").asText(), usd.path("channelCurrency").asText());
        java.math.BigDecimal expect = jod.path("gross").decimalValue().multiply(new java.math.BigDecimal("1.41")).setScale(2, java.math.RoundingMode.HALF_UP);
        assertEquals(0, expect.compareTo(usd.path("gross").decimalValue()), usd.toString());
        assertEquals(0, usd.path("gross").decimalValue().subtract(usd.path("commission").decimalValue()).compareTo(usd.path("net").decimalValue()), "adds up");
        mvc.perform(get("/api/channels/agg-1/statement").param("month", Y + "-08").param("currency", "EUR").header("Authorization", staffToken()))
            .andExpect(status().isBadRequest());
    }

    // ======================================================================= phase 4b: outbound connectors

    record Sent(String url, String method, java.util.Map<String, String> headers, String body) {}

    /** Every call the connectors make goes to `calls`; `answer` decides the broker's reply. */
    java.util.List<Sent> fakeBroker(java.util.function.Function<Sent, OutboundConnectorService.Reply> answer) {
        java.util.List<Sent> calls = java.util.Collections.synchronizedList(new java.util.ArrayList<>());
        connectorsSvc.sender = (url, method, headers, body) -> { Sent x = new Sent(url, method, headers, body); calls.add(x); return answer.apply(x); };
        return calls;
    }

    JsonNode connector(String json) throws Exception {
        var r = mvc.perform(post("/api/channels/agg-1/connectors").header("Authorization", staffToken()).contentType(MediaType.APPLICATION_JSON).content(json))
            .andReturn().getResponse();
        assertEquals(200, r.getStatus(), r.getContentAsString());
        return M.readTree(r.getContentAsString());
    }

    @Test
    void bookingNotificationsReachTheBrokersSystemInOrderWithItsCredentials() throws Exception {
        var calls = fakeBroker(x -> new OutboundConnectorService.Reply(200, "{\"ok\":true}"));
        try {
            JsonNode c = connector("{\"type\":\"RES_NOTIFY\",\"name\":\"Broker bookings\",\"url\":\"https://api.broker.example/bookings\",\"format\":\"JSON\",\"authType\":\"BEARER\",\"secret\":\"brk-token-123\"}");
            String list = mvc.perform(get("/api/channels/agg-1/connectors").header("Authorization", staffToken())).andReturn().getResponse().getContentAsString();
            assertTrue(list.contains("\"hasSecret\":true") && !list.contains("brk-token-123"), "the secret is never shown again: " + list);
            String booked = send("/ota/v1/BKG/OTA_VehRes", direct(Y + "-11-02T10:00:00", Y + "-11-05T10:00:00", "CONN-1", "Doe"));
            String number = booked.substring(booked.indexOf("ID=\"RSV-") + 4, booked.indexOf('"', booked.indexOf("ID=\"RSV-") + 4));
            send("/ota/v1/BKG/OTA_VehCancel", "<OTA_VehCancelRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\"><VehCancelRQCore CancelType=\"Book\"><UniqueID Type=\"14\" ID=\"" + number + "\"/></VehCancelRQCore></OTA_VehCancelRQ>");
            connectorsSvc.deliverDue();
            connectorsSvc.deliverDue();
            List<Sent> mine = calls.stream().filter(x -> x.url().contains("broker.example/bookings")).toList();
            assertEquals(List.of("reservation.created", "reservation.confirmed", "reservation.cancelled"),
                mine.stream().map(x -> x.headers().get("X-URD-Event")).toList(), "every event, in order");
            assertTrue(mine.get(0).body().contains("\"totalAmount\":150") && !mine.get(0).body().contains("E+"), "plain amounts: " + mine.get(0).body());
            assertEquals("Bearer brk-token-123", mine.get(0).headers().get("Authorization"));
            assertTrue(mine.get(0).body().contains(number) && mine.get(0).body().contains("UR-Drive Jordan") && !mine.get(0).body().contains("NCT"), mine.get(0).body());
            String sends = mvc.perform(get("/api/channels/agg-1/connectors/" + c.path("id").asText() + "/sends").header("Authorization", staffToken())).andReturn().getResponse().getContentAsString();
            assertTrue(sends.contains("\"status\":\"SENT\""), sends);
            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/channels/agg-1/connectors/" + c.path("id").asText())
                .header("Authorization", staffToken())).andExpect(status().isOk());
        } finally {
            connectorRepo.deleteAll();
        }
    }

    @Test
    void rateFilesCarryTheBrokersPriceRulesAndAvailabilityPushUsesOAuthAndItsFieldNames() throws Exception {
        var calls = fakeBroker(x -> x.url().endsWith("/token")
            ? new OutboundConnectorService.Reply(200, "{\"access_token\":\"tok-abc\",\"expires_in\":3600}")
            : new OutboundConnectorService.Reply(202, "accepted"));
        try {
            rules((agg, r) -> r.putObject("commercial").put("markupPercent", 10));
            connector("{\"type\":\"RATE_FILE\",\"url\":\"https://files.broker.example/rates\",\"format\":\"CSV\",\"method\":\"PUT\",\"authType\":\"BASIC\",\"authUser\":\"urd\",\"secret\":\"pw\",\"dailyHour\":-1}");
            connector("{\"type\":\"ARI_PUSH\",\"url\":\"https://ari.broker.example/availability\",\"authType\":\"OAUTH2\",\"authUser\":\"client-1\",\"secret\":\"s3cret\","
                + "\"tokenUrl\":\"https://auth.broker.example/token\",\"scope\":\"ari:write\",\"days\":14,\"dailyHour\":-1,\"fieldMap\":{\"vehicle_group\":\"sipp\",\"available\":\"qty\"}}");
            connectorsSvc.tick();
            Sent rates = calls.stream().filter(x -> x.url().contains("/rates")).findFirst().orElseThrow();
            assertEquals("PUT", rates.method());
            assertTrue(rates.headers().get("Authorization").startsWith("Basic "));
            assertTrue(rates.body().startsWith("season,from,to,vehicle_group,min_days,max_days,daily_amount,currency"), rates.body());
            assertTrue(rates.body().contains(",SDAR,4,,44.00,") && rates.body().contains(",SDAR,1,3,55.00,"), "published 40 and 50 + 10 %: " + rates.body());
            Sent ari = calls.stream().filter(x -> x.url().contains("/availability")).findFirst().orElseThrow();
            assertEquals("Bearer tok-abc", ari.headers().get("Authorization"));
            assertTrue(ari.body().contains("\"sipp\"") && ari.body().contains("\"qty\"") && !ari.body().contains("\"vehicle_group\""), ari.body());
            Sent token = calls.stream().filter(x -> x.url().endsWith("/token")).findFirst().orElseThrow();
            assertTrue(token.body().contains("grant_type=client_credentials") && token.body().contains("scope=ari%3Awrite"), token.body());
            int before = calls.size();
            connectorsSvc.tick();
            assertEquals(before, calls.size(), "nothing changed and nothing republished: nothing is sent again");
            assertEquals(1, calls.stream().filter(x -> x.url().endsWith("/token")).count(), "the OAuth token is reused");
        } finally {
            connectorRepo.deleteAll();
            rules((agg, r) -> r.remove("commercial"));
        }
    }

    @Test
    void connectorsRetryRefuseUnsafeAddressesAndNeedStaff() throws Exception {
        fakeBroker(x -> new OutboundConnectorService.Reply(503, "busy"));
        try {
            JsonNode c = connector("{\"type\":\"RES_NOTIFY\",\"url\":\"https://api.broker.example/n\",\"format\":\"XML\"}");
            OutboundConnector oc = connectorRepo.findAll().get(0);
            ConnectorSend s = connectorsSvc.enqueue(oc, "reservation.created", "RSV-T-1", "application/xml", "<x/>");
            connectorsSvc.deliverDue();
            ConnectorSend after = connectorSends.findById(s.getId()).orElseThrow();
            assertEquals(ConnectorSend.Status.PENDING, after.getStatus());
            assertEquals(1, after.getAttempts());
            assertEquals(503, after.getLastHttpStatus());
            assertTrue(after.getNextAttemptAt().isAfter(java.time.Instant.now().plusSeconds(30)), "retried in about a minute");
            var test = M.readTree(mvc.perform(post("/api/channels/agg-1/connectors/" + c.path("id").asText() + "/test").header("Authorization", staffToken()))
                .andReturn().getResponse().getContentAsString());
            assertFalse(test.path("ok").asBoolean());
            assertEquals(503, test.path("httpStatus").asInt());
            for (String bad : List.of("{\"type\":\"RES_NOTIFY\",\"url\":\"http://api.broker.example/n\"}", "{\"type\":\"RES_NOTIFY\",\"url\":\"https://10.0.0.8/n\"}",
                    "{\"type\":\"ARI_PUSH\",\"url\":\"https://a.example/x\",\"format\":\"XML\"}", "{\"type\":\"RES_NOTIFY\",\"url\":\"https://a.example/x\",\"authType\":\"HEADER\",\"secret\":\"k\"}",
                    "{\"type\":\"RES_NOTIFY\",\"url\":\"https://a.example/x\",\"authType\":\"BEARER\"}", "{\"type\":\"FTP\",\"url\":\"https://a.example/x\"}")) {
                assertEquals(400, mvc.perform(post("/api/channels/agg-1/connectors").header("Authorization", staffToken()).contentType(MediaType.APPLICATION_JSON).content(bad))
                    .andReturn().getResponse().getStatus(), bad);
            }
            assertTrue(mvc.perform(get("/api/channels/agg-1/connectors")).andReturn().getResponse().getStatus() >= 401);
        } finally {
            connectorSends.deleteAll();
            connectorRepo.deleteAll();
        }
    }

    // ======================================================================= phase 9: attacks and load

    static void noLeak(String body) {
        assertFalse(body.contains("Exception") || body.contains("at com.") || body.contains("org.springframework") || body.contains("/etc/passwd")
            || body.contains("root:x:"), "no internals in an answer: " + body);
    }

    @Test
    void hostileXmlIsRefusedEverywhereWithoutLeakingAnything() throws Exception {
        String xxe = "<?xml version=\"1.0\"?><!DOCTYPE r [<!ENTITY x SYSTEM \"file:///etc/passwd\">]><OTA_VehLocSearchRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\">&x;</OTA_VehLocSearchRQ>";
        String lol = "<?xml version=\"1.0\"?><!DOCTYPE l [<!ENTITY a \"aaaaaaaaaa\"><!ENTITY b \"&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;\"><!ENTITY c \"&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;\">]><OTA_PingRQ>&c;</OTA_PingRQ>";
        String huge = "<OTA_PingRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\"><EchoData>" + "A".repeat(200_000) + "</EchoData></OTA_PingRQ>";
        String soap = "<?xml version=\"1.0\"?><!DOCTYPE r [<!ENTITY x SYSTEM \"file:///etc/passwd\">]><s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\"><s:Body>&x;</s:Body></s:Envelope>";
        for (String[] c : new String[][] {{"/ota/v1/BKG/OTA_VehLocSearch", xxe}, {"/ota/2024A/BKG/OTA_VehLocSearch", xxe}, {"/ota/2018A/BKG/OTA_Ping", lol},
                {"/ota/v1/BKG/OTA_Ping", huge}, {"/ota/2024A/BKG/OTA_Ping", huge}, {"/ota/BKG/soap", soap}, {"/ota/v1/BKG/soap", soap}}) {
            long t = System.nanoTime();
            var r = mvc.perform(post(c[0]).header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_XML).content(c[1])).andReturn().getResponse();
            long ms = (System.nanoTime() - t) / 1_000_000;
            if (c[0].endsWith("/soap")) {    // SOAP 1.1: every fault is HTTP 500 with a Client fault code, no internals
                assertTrue(r.getContentAsString().contains("<faultcode>soap:Client</faultcode>"), c[0] + " -> " + r.getContentAsString());
            } else {
                assertTrue(r.getStatus() >= 400 && r.getStatus() < 500 || r.getContentAsString().contains("Error"), c[0] + " -> " + r.getStatus() + " " + r.getContentAsString());
                assertNotEquals(500, r.getStatus(), c[0]);
            }
            noLeak(r.getContentAsString());
            assertTrue(ms < 3000, c[0] + " took " + ms + " ms");
        }
    }

    @Test
    void forgedTamperedOrRevokedTokensNeverGetIn() throws Exception {
        String[] client = oauthClient("production");
        String good = accessToken(client, null);
        String jwt = good.substring(7);
        String[] part = jwt.split("\\.");
        java.util.Base64.Encoder b64 = java.util.Base64.getUrlEncoder().withoutPadding();
        String none = b64.encodeToString("{\"alg\":\"none\",\"typ\":\"JWT\"}".getBytes()) + "." + part[1] + ".";
        String payload = new String(java.util.Base64.getUrlDecoder().decode(part[1])).replace("\"production\"", "\"sandbox\"").replace("urd_live_", "urd_lixe_");
        String tampered = part[0] + "." + b64.encodeToString(payload.getBytes()) + "." + part[2];
        for (String tok : List.of(none, tampered, jwt.substring(0, jwt.length() - 3) + "abc", staffToken().replace("Bearer ", ""), "", "null", "a.b.c")) {
            var r = mvc.perform(get("/api/v3/locations").header("Authorization", "Bearer " + tok)).andReturn().getResponse();
            assertEquals(401, r.getStatus(), "token " + tok);
            noLeak(r.getContentAsString());
        }
        assertEquals(200, mvc.perform(get("/api/v3/locations").header("Authorization", good)).andReturn().getResponse().getStatus());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/channels/agg-1/oauth-clients/" + client[0])
            .header("Authorization", staffToken())).andExpect(status().isOk());
        assertEquals(401, mvc.perform(get("/api/v3/locations").header("Authorization", good)).andReturn().getResponse().getStatus(), "revoked = out at once");
        // The OAuth token cannot be used on staff endpoints either.
        assertTrue(mvc.perform(get("/api/channels/agg-1/oauth-clients").header("Authorization", good)).andReturn().getResponse().getStatus() >= 401);
    }

    @Test
    void injectionAttemptsAreTreatedAsPlainText() throws Exception {
        var r = mvc.perform(post("/ota/2024A/BKG/OTA_Ping").header("X-Api-Key", KEY).header("X-Correlation-ID", "abc\r\nSet-Cookie: x=1")
            .contentType(MediaType.APPLICATION_XML).content("<OTA_PingRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\"><EchoData>x</EchoData></OTA_PingRQ>")).andReturn().getResponse();
        assertTrue(r.getHeader("X-Correlation-ID").startsWith("cor-"), "unsafe correlation ids are replaced: " + r.getHeader("X-Correlation-ID"));
        assertNull(r.getHeader("Set-Cookie"));
        String ref = "X' OR '1'='1'--";
        String sur = "<script>alert(1)</script>";
        String booked = send("/ota/v1/BKG/OTA_VehRes", direct(Y + "-09-01T10:00:00", Y + "-09-04T10:00:00", ref.replace("'", "&apos;"), sur.replace("<", "&lt;").replace(">", "&gt;")));
        assertTrue(booked.contains("<Success/>"), booked);
        assertFalse(booked.contains("<script>"), "markup in names is escaped");
        String number = booked.substring(booked.indexOf("ID=\"RSV-") + 4, booked.indexOf('"', booked.indexOf("ID=\"RSV-") + 4));
        assertEquals(ref, bookings.findByReservationNumber(number).orElseThrow().getBrokerReference(), "stored literally");
        for (String path : List.of("/ota/v1/..%2F..%2Fetc/OTA_Ping", "/ota/2024A/B%00KG/OTA_Ping", "/ota/v1/" + "Z".repeat(300) + "/OTA_Ping")) {
            var x = mvc.perform(post(java.net.URI.create(path)).header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_XML).content("<OTA_PingRQ/>")).andReturn().getResponse();
            assertNotEquals(500, x.getStatus(), path);
            noLeak(x.getContentAsString());
        }
        String tok = accessToken(oauthClient("sandbox"), null);
        var bad = mvc.perform(post("/api/v3/availability/search").header("Authorization", tok).contentType(MediaType.APPLICATION_JSON).content("{\"pickUp\": [1,2,")).andReturn().getResponse();
        assertEquals(400, bad.getStatus(), bad.getContentAsString());
        noLeak(bad.getContentAsString());
    }

    @Test
    void webhooksCannotBePointedAtOurOwnNetwork() throws Exception {
        String tok = accessToken(oauthClient("sandbox"), null);
        for (String url : List.of("http://example.com/hook", "https://127.0.0.1/hook", "https://169.254.169.254/latest/meta-data", "https://10.0.0.5/x",
                "https://localhost/x", "https://[::1]/x", "https://192.168.1.10/x", "file:///etc/passwd")) {
            var r = mvc.perform(post("/api/v3/webhooks/subscriptions").header("Authorization", tok).contentType(MediaType.APPLICATION_JSON)
                .content("{\"url\":\"" + url + "\",\"events\":[\"reservation.created\"]}")).andReturn().getResponse();
            assertEquals(400, r.getStatus(), url + " -> " + r.getContentAsString());
        }
    }

    @Test
    void staffEndpointsNeedStaffAndRateLimitsHold() throws Exception {
        for (String path : List.of("/api/channels/agg-1/oauth-clients", "/api/channel-platform/retention", "/api/channels/agg-1/statement?month=2027-01",
                "/api/channels/agg-1/traffic")) {
            int st = mvc.perform(get(path)).andReturn().getResponse().getStatus();
            assertTrue(st == 401 || st == 403, path + " -> " + st);
        }
        rules((agg, r) -> r.put("rateLimitPerMinute", 3));
        try {
            int limited = 0;
            for (int i = 0; i < 8; i++) {
                var r = mvc.perform(post("/ota/2024A/BKG/OTA_Ping").header("X-Api-Key", KEY).contentType(MediaType.APPLICATION_XML)
                    .content("<OTA_PingRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\"><EchoData>x</EchoData></OTA_PingRQ>")).andReturn().getResponse();
                if (r.getContentAsString().contains("Rate limit")) limited++;
            }
            assertTrue(limited >= 4, "requests over the limit are refused, " + limited);
        } finally {
            rules((agg, r) -> r.put("rateLimitPerMinute", 5000));
        }
    }

    @Test
    void twentyBrokersRacingForTheLastCarGetExactlyOneBooking() throws Exception {
        String from = Y + "-10-05T10:00:00", to = Y + "-10-08T10:00:00";
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(20);
        java.util.concurrent.CountDownLatch go = new java.util.concurrent.CountDownLatch(1);
        List<java.util.concurrent.Future<String>> out = new java.util.ArrayList<>();
        for (int i = 0; i < 20; i++) {
            int n = i;
            out.add(pool.submit(() -> { go.await(); return send("/ota/v1/BKG/OTA_VehRes", direct(from, to, "RACE-" + n, "Racer")); }));
        }
        go.countDown();
        int ok = 0;
        for (var f : out) { String r = f.get(60, java.util.concurrent.TimeUnit.SECONDS); if (r.contains("<Success/>")) ok++; else noLeak(r); }
        pool.shutdown();
        assertEquals(1, ok, "one car, one booking: never a double booking");
    }

    @Test
    void searchStaysFastUnderParallelLoad() throws Exception {
        int threads = 16, perThread = 15;
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(threads);
        List<Long> times = java.util.Collections.synchronizedList(new java.util.ArrayList<>());
        java.util.concurrent.atomic.AtomicInteger errors = new java.util.concurrent.atomic.AtomicInteger();
        List<java.util.concurrent.Future<?>> fs = new java.util.ArrayList<>();
        long all = System.nanoTime();
        for (int t = 0; t < threads; t++) fs.add(pool.submit(() -> {
            for (int i = 0; i < perThread; i++) {
                long s = System.nanoTime();
                String r = send("/ota/2024A/BKG/OTA_VehAvailRate", avail("L" + i));
                times.add((System.nanoTime() - s) / 1_000_000);
                if (!r.contains("<Success/>")) errors.incrementAndGet();
            }
            return null;
        }));
        for (var f : fs) f.get(120, java.util.concurrent.TimeUnit.SECONDS);
        pool.shutdown();
        long wall = (System.nanoTime() - all) / 1_000_000;
        java.util.List<Long> sorted = new java.util.ArrayList<>(times); java.util.Collections.sort(sorted);
        long p50 = sorted.get(sorted.size() / 2), p95 = sorted.get((int) (sorted.size() * 0.95)), max = sorted.get(sorted.size() - 1);
        System.out.printf("LOAD: %d searches, %d threads, %d ms wall, %.1f/s, p50 %d ms, p95 %d ms, max %d ms, errors %d%n",
            sorted.size(), threads, wall, sorted.size() * 1000.0 / wall, p50, p95, max, errors.get());
        assertEquals(0, errors.get());
        assertTrue(p95 < 2000, "p95 " + p95 + " ms");
    }

    @Test
    void publicErrorCatalogueAndPlatformHealth() throws Exception {
        String errors = mvc.perform(get("/ota/errors")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode list = M.readTree(errors).path("errors");
        assertEquals(ChannelError.values().length, list.size());
        JsonNode auth = null;
        for (JsonNode e : list) if ("AUTH_FAILED".equals(e.path("code").asText())) auth = e;
        assertNotNull(auth);
        assertEquals(401, auth.path("httpStatus").asInt());
        assertEquals("497", auth.path("otaCode").asText());
        JsonNode health = M.readTree(mvc.perform(get("/ota/health")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals("UP", health.path("status").asText());
        assertEquals("UP", health.path("components").path("database").path("status").asText());
        assertEquals("Asia/Amman", health.path("timeZone").asText());
        assertFalse(errors.contains(KEY) || health.toString().contains(KEY), "no secrets");
        String openapi = mvc.perform(get("/api/v3/openapi.yaml")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertTrue(openapi.startsWith("openapi: 3.1.0") && openapi.contains("tokenUrl: https://www.nctrental.com/oauth/token"));
        assertEquals("success", M.readTree(mvc.perform(get("/api/v3/health")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("status").asText());
    }

    @Test
    void staffCanDeleteABrokerBookingFromOtaXml() throws Exception {
        String r = send("/ota/v1/BKG/OTA_VehRes", direct(Y + "-05-01T10:00:00", Y + "-05-04T10:00:00", "DEL-X", "Roe"));
        assertTrue(r.contains("<Success/>"), r);
        String number = r.substring(r.indexOf("ID=\"RSV-") + 4, r.indexOf('"', r.indexOf("ID=\"RSV-") + 4));
        assertEquals(1, reservations().path(Y).path("May").size());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/channels/agg-1/bookings/" + number))
            .andExpect(status().isUnauthorized());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/channels/agg-2/bookings/" + number)
                .header("Authorization", staffToken())).andExpect(status().isNotFound());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/channels/agg-1/bookings/" + number)
                .header("Authorization", staffToken())).andExpect(status().isOk());
        assertEquals(0, reservations().path(Y).path("May").size(), "its copy in the reservations list is gone too");
        assertTrue(bookings.findByReservationNumber(number).isEmpty());
    }

    @Test
    void staffCannotDeleteABrokerBookingItIsCancelledInstead() throws Exception {
        String r = send("/ota/v1/BKG/OTA_VehRes", direct(Y + "-05-01T10:00:00", Y + "-05-04T10:00:00", "DEL-1", "Roe"));
        assertTrue(r.contains("<Success/>"), r);
        String id = reservations().path(Y).path("May").get(0).path("id").asText();
        stateService.applyPatch(M.writeValueAsString(M.createObjectNode().set("ops", M.createArrayNode().add(
            M.createObjectNode().put("op", "deleteReservation").put("id", id)))));
        JsonNode kept = reservations().path(Y).path("May");
        assertEquals(1, kept.size(), "the booking stays on record");
        assertEquals("CANCELLED", kept.get(0).path("status").asText());
        assertTrue(webhooks.findAll().stream().anyMatch(d -> "reservation.cancelled".equals(d.getEventType())), "the broker is told");
        // An ordinary walk-in booking is still deleted normally.
        stateBooking("walk-del", Y + "-06-01T10:00", Y + "-06-03T10:00", false, false);
        stateService.applyPatch(M.writeValueAsString(M.createObjectNode().set("ops", M.createArrayNode().add(
            M.createObjectNode().put("op", "deleteReservation").put("id", "walk-del")))));
        assertEquals(0, reservations().path(Y).path("June").size());
    }

    @Test
    void holidaysCloseTheBranchAndSpecialHoursReplaceTheUsualOnes() throws Exception {
        rules((agg, r) -> {
            ArrayNode sd = ((ObjectNode) r.path("locations").get(0)).putArray("specialDays");
            sd.addObject().put("date", Y + "-05-01").put("closed", true).put("note", "Labour Day");
            sd.addObject().put("date", Y + "-05-02").put("open", "10:00").put("close", "14:00").put("note", "Short day");
        });
        String closed = send("/ota/v1/BKG/OTA_VehAvailRate", availAt(Y + "-05-01T10:00:00", Y + "-05-04T10:00:00"));
        assertTrue(closed.contains("INVALID_DATE") && closed.contains("Labour Day"), closed);
        // Returning on the holiday is refused too
        assertTrue(send("/ota/v1/BKG/OTA_VehAvailRate", availAt(Y + "-04-28T10:00:00", Y + "-05-01T10:00:00")).contains("INVALID_DATE"));
        String early = send("/ota/v1/BKG/OTA_VehAvailRate", availAt(Y + "-05-02T09:00:00", Y + "-05-04T10:00:00"));
        assertTrue(early.contains("INVALID_DATE") && early.contains("open 10:00-14:00"), early);
        assertTrue(send("/ota/v1/BKG/OTA_VehAvailRate", availAt(Y + "-05-02T11:00:00", Y + "-05-04T10:00:00")).contains("<Success/>"));
        // The broker sees the days in the station list
        String locs = send("/ota/v1/BKG/OTA_VehLocSearch", "<OTA_VehLocSearchRQ/>");
        assertTrue(locs.contains("<SpecialDay Date=\"" + Y + "-05-01\" Closed=\"true\" Note=\"Labour Day\"/>"), locs);
    }

    @Test
    void theTestKeyOnlyEverReachesTheSandbox() throws Exception {
        rules((agg, r) -> agg.put("testKeyHash", PartnerKeyVerifier.sha256Hex("test-only-key")));
        String rq = direct(Y + "-05-01T10:00:00", Y + "-05-04T10:00:00", "TK-1", "Roe");
        String test = mvc.perform(post("/ota/v1/BKG/OTA_VehRes").header("X-Api-Key", "test-only-key").contentType(MediaType.APPLICATION_XML).content(rq))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertTrue(test.contains("Target=\"Test\""), test);
        assertEquals(0, reservations().path(Y).path("May").size(), "a test-key booking is never a real reservation");
        // The live key on the same live channel books for real
        String live = send("/ota/v1/BKG/OTA_VehRes", rq.replace("TK-1", "LIVE-1"));
        assertTrue(live.contains("Target=\"Production\""), live);
        assertEquals(1, reservations().path(Y).path("May").size());
        mvc.perform(post("/ota/v1/BKG/OTA_VehRes").header("X-Api-Key", "nope").contentType(MediaType.APPLICATION_XML).content(rq))
            .andExpect(status().isUnauthorized());
    }

    // ======================================================================= security

    @Autowired ChannelSecurityGuard guard;
    @Autowired ChannelWebhookService hooks;

    org.springframework.test.web.servlet.ResultActions from(String ip, String key, String body) throws Exception {
        return mvc.perform(post("/ota/v1/BKG/OTA_VehLocSearch").header("X-Forwarded-For", ip).header("X-Api-Key", key)
            .contentType(MediaType.APPLICATION_XML).content(body));
    }

    @Test
    void anAddressThatKeepsGuessingKeysIsLockedOut() throws Exception {
        String ip = "198.51.100.66";
        try {
            for (int i = 0; i < ChannelSecurityGuard.MAX_FAILURES; i++) from(ip, "guess-" + i, "<OTA_VehLocSearchRQ/>").andExpect(status().isUnauthorized());
            // Now even the right key is refused from that address…
            from(ip, KEY, "<OTA_VehLocSearchRQ/>").andExpect(status().isUnauthorized())
                .andExpect(content().string(containsString("Too many failed attempts")));
            // …while the broker's own address is not affected
            from("203.0.113.5", KEY, "<OTA_VehLocSearchRQ/>").andExpect(status().isOk());
            // Staff lift the lock from the Security tab
            mvc.perform(post("/api/channels/agg-1/security/unlock").header("Authorization", staffToken()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"ip\":\"" + ip + "\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.unlocked").value(true));
            from(ip, KEY, "<OTA_VehLocSearchRQ/>").andExpect(status().isOk());
            mvc.perform(get("/api/channels/agg-1/security").header("Authorization", staffToken()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.authFailures24h").value(greaterThanOrEqualTo(ChannelSecurityGuard.MAX_FAILURES)));
        } finally {
            guard.unlock(ip);
        }
    }

    @Test
    void aSpoofedForwardedForCannotPassTheAllowList() throws Exception {
        rules((agg, r) -> r.putArray("ipAllowlist").add("203.0.113.10"));
        // The caller writes the allowed address first; our load balancer appends the real one last.
        from("203.0.113.10, 198.51.100.7", KEY, "<OTA_VehLocSearchRQ/>").andExpect(status().isForbidden());
        from("203.0.113.10", KEY, "<OTA_VehLocSearchRQ/>").andExpect(status().isOk());
    }

    @Test
    void signedRequestsAreCheckedAndCannotBeReplayed() throws Exception {
        String secret = hooks.rotateSecret("agg-1");
        rules((agg, r) -> r.put("requireSignature", true));
        String body = "<OTA_VehLocSearchRQ/>";
        long ts = System.currentTimeMillis() / 1000;
        String sig = "sha256=" + ChannelWebhookService.sign(secret, ts + "." + body);
        var signed = post("/ota/v1/BKG/OTA_VehLocSearch").header("X-Api-Key", KEY).header("X-Forwarded-For", "203.0.113.20")
            .header("X-NCT-Timestamp", String.valueOf(ts)).header("X-NCT-Signature", sig).contentType(MediaType.APPLICATION_XML).content(body);
        mvc.perform(signed).andExpect(status().isOk());
        mvc.perform(signed).andExpect(status().isUnauthorized()).andExpect(content().string(containsString("replay")));
        from("203.0.113.20", KEY, body).andExpect(status().isUnauthorized()).andExpect(content().string(containsString("requires signed requests")));
        long old = ts - 3600;
        mvc.perform(post("/ota/v1/BKG/OTA_VehLocSearch").header("X-Api-Key", KEY).header("X-Forwarded-For", "203.0.113.20")
                .header("X-NCT-Timestamp", String.valueOf(old)).header("X-NCT-Signature", "sha256=" + ChannelWebhookService.sign(secret, old + "." + body))
                .contentType(MediaType.APPLICATION_XML).content(body))
            .andExpect(status().isUnauthorized()).andExpect(content().string(containsString("5 minutes")));
        // A changed body breaks the signature
        long now = System.currentTimeMillis() / 1000;
        mvc.perform(post("/ota/v1/BKG/OTA_VehLocSearch").header("X-Api-Key", KEY).header("X-Forwarded-For", "203.0.113.20")
                .header("X-NCT-Timestamp", String.valueOf(now)).header("X-NCT-Signature", "sha256=" + ChannelWebhookService.sign(secret, now + "." + body))
                .contentType(MediaType.APPLICATION_XML).content(body + " "))
            .andExpect(status().isUnauthorized()).andExpect(content().string(containsString("does not match")));
        guard.unlock("203.0.113.20");
    }

    @Test
    void aReplacedKeyKeepsWorkingUntilItsGracePeriodEnds() throws Exception {
        rules((agg, r) -> agg.put("feedKeyHash", PartnerKeyVerifier.sha256Hex("new-key"))
            .put("previousKeyHash", PartnerKeyVerifier.sha256Hex(KEY)).put("previousKeyExpiresAt", java.time.Instant.now().plusSeconds(3600).toString()));
        from("203.0.113.30", KEY, "<OTA_VehLocSearchRQ/>").andExpect(status().isOk());
        from("203.0.113.30", "new-key", "<OTA_VehLocSearchRQ/>").andExpect(status().isOk());
        rules((agg, r) -> agg.put("previousKeyExpiresAt", java.time.Instant.now().minusSeconds(1).toString()));
        from("203.0.113.30", KEY, "<OTA_VehLocSearchRQ/>").andExpect(status().isUnauthorized());
        guard.unlock("203.0.113.30");
    }

    // ======================================================================= review fixes

    @Test
    void aKeyAndReferenceUsedInTestingStillBookForRealAfterGoLive() throws Exception {
        seedChannel("testing", "test");
        String rq = direct(Y + "-05-01T10:00:00", Y + "-05-04T10:00:00", "AE-500", "Roe");
        String test = send("/ota/v1/BKG/OTA_VehRes", rq, "Idempotency-Key", "AE-500");
        assertTrue(test.contains("Target=\"Test\""), test);
        // Go live: the broker's booking numbers restart, so the same key and reference come again
        rules((agg, r) -> { agg.put("status", "active"); ((ObjectNode) agg.get("connectionDetails")).put("environment", "production"); });
        String live = send("/ota/v1/BKG/OTA_VehRes", rq, "Idempotency-Key", "AE-500");
        assertTrue(live.contains("Target=\"Production\"") && live.contains("<Success/>"), "a real booking, not the test one replayed: " + live);
        assertEquals(1, reservations().path(Y).path("May").size(), "the live booking is in the reservations list");
        assertNotEquals(firstConf(test), firstConf(live));
        // Retrieving by the reference finds the live booking
        String ret = send("/ota/v1/BKG/OTA_VehRetRes", "<OTA_VehRetResRQ><VehRetResRQCore><UniqueID Type=\"16\" ID=\"AE-500\"/></VehRetResRQCore></OTA_VehRetResRQ>");
        assertTrue(ret.contains(firstConf(live)), ret);
    }

    static String firstConf(String xml) {
        int i = xml.indexOf("ConfID Type=\"14\" ID=\"");
        return xml.substring(i + 21, xml.indexOf('"', i + 21));
    }

    @Test
    void badDatesInStaffDataDoNotBreakSearches() throws Exception {
        ArrayNode fleet = (ArrayNode) M.readTree(stateService.getFullState()).path("fleet");
        ((ObjectNode) fleet.get(0)).put("registrationExpiry", "31/12/2027");
        ArrayNode stops = M.createArrayNode();
        stops.addObject().put("id", "x").put("type", "vehicle").put("target", "v1").put("startDate", "soon").put("endDate", "later");
        stateService.applyPatch(M.writeValueAsString(M.createObjectNode().set("ops", M.createArrayNode()
            .add(M.createObjectNode().put("op", "set").put("key", "fleet").set("value", fleet))
            .add(M.createObjectNode().put("op", "set").put("key", "stopSales").set("value", stops)))));
        String a = send("/ota/v1/BKG/OTA_VehAvailRate", avail("BD"));
        assertTrue(a.contains("<Success/>") && a.contains("Code=\"SDAR\""), a);
    }

    @Test
    void timesWithAnOffsetAreConvertedToTheStationsTime() {
        assertEquals(java.time.LocalDateTime.parse(Y + "-05-01T10:00"), OtaRequestParser.parseDateTime(Y + "-05-01T07:00:00Z", "t"));
        assertEquals(java.time.LocalDateTime.parse(Y + "-05-01T10:00"), OtaRequestParser.parseDateTime(Y + "-05-01T10:00:00+03:00", "t"));
        assertEquals(java.time.LocalDateTime.parse(Y + "-05-01T10:00"), OtaRequestParser.parseDateTime(Y + "-05-01T10:00:00", "t"));
    }

    @Test
    void aWrongExpectedTotalIsAClearErrorNotAServerError() throws Exception {
        String head = "<Header><RequestID>N</RequestID><ChannelCode>BKG</ChannelCode></Header><Credentials><ApiKey>" + KEY + "</ApiKey></Credentials>";
        mvc.perform(post("/xml/v1/ReservationCreate").contentType(MediaType.APPLICATION_XML).content("<ReservationCreateRequest>" + head
                + "<BrokerReference>N-1</BrokerReference><Itinerary><PickupLocationCode>AMM</PickupLocationCode><PickupDateTime>" + Y
                + "-06-01T10:00:00</PickupDateTime><ReturnDateTime>" + Y + "-06-04T10:00:00</ReturnDateTime><VehicleGroupCode>SDAR</VehicleGroupCode></Itinerary>"
                + "<Customer><FirstName>A</FirstName><LastName>B</LastName></Customer><ExpectedTotalAmount>about 100</ExpectedTotalAmount></ReservationCreateRequest>"))
            .andExpect(status().isBadRequest()).andExpect(content().string(containsString("ExpectedTotalAmount must be a number")));
    }

    @Test
    void theRatePullEndpointsFollowTheAllowListToo() throws Exception {
        rules((agg, r) -> r.putArray("ipAllowlist").add("203.0.113.10"));
        mvc.perform(get("/ota/v1/BKG/ratesheet").header("X-Api-Key", KEY).header("X-Forwarded-For", "198.51.100.9"))
            .andExpect(status().isForbidden());
        mvc.perform(get("/ota/v1/BKG/ratesheet").header("X-Api-Key", KEY).header("X-Forwarded-For", "203.0.113.10"))
            .andExpect(status().isOk());
    }

    @Test
    void signedRequestsWorkOverSoapToo() throws Exception {
        String secret = hooks.rotateSecret("agg-1");
        rules((agg, r) -> r.put("requireSignature", true));
        String env = soap11("BKG", KEY, "<OTA_VehLocSearchRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\"/>");
        long ts = System.currentTimeMillis() / 1000;
        mvc.perform(post("/ota/v1/BKG/soap").contentType(MediaType.TEXT_XML).header("X-Forwarded-For", "203.0.113.70")
                .header("X-NCT-Timestamp", String.valueOf(ts)).header("X-NCT-Signature", "sha256=" + ChannelWebhookService.sign(secret, ts + "." + env))
                .content(env))
            .andExpect(status().isOk()).andExpect(content().string(containsString("Code=\"AQJ\"")));
        guard.unlock("203.0.113.70");
    }

    @Test
    void deeplyNestedXmlIsRefused() {
        String deep = "<a>".repeat(200) + "</a>".repeat(200);
        assertThrows(OtaRequestParser.InvalidRequestException.class, () -> OtaRequestParser.parse("<OTA_VehAvailRateRQ>" + deep + "</OTA_VehAvailRateRQ>"));
        assertThrows(ChannelError.ChannelException.class, () -> OtaBookingXml.parse("<OTA_VehResRQ>" + deep + "</OTA_VehResRQ>", "OTA_VehResRQ"));
    }

    @Test
    void xmlBookingNotificationsCarryTheSupplierNameAndCode() throws Exception {
        var calls = fakeBroker(x -> new OutboundConnectorService.Reply(200, "<OK/>"));
        try {
            connector("{\"type\":\"RES_NOTIFY\",\"url\":\"https://api.broker.example/xml\",\"format\":\"XML\"}");
            send("/ota/v1/BKG/OTA_VehRes", direct(Y + "-11-10T10:00:00", Y + "-11-12T10:00:00", "XMLV-1", "Doe"));
            connectorsSvc.deliverDue();
            String xml = calls.stream().filter(x -> x.url().contains("broker.example/xml")).findFirst().orElseThrow().body();
            var vendor = java.util.regex.Pattern.compile("<Vendor Code=\"([A-Z]{2,})\">([^<]+)</Vendor>").matcher(xml);
            assertTrue(vendor.find(), "a supplier code and a supplier name: " + xml);
            assertNotEquals(vendor.group(1), vendor.group(2), "the name is not used as the code");
            assertEquals("UR-Drive Jordan", vendor.group(2), "the supplier name, never the system's name: " + xml);
        } finally {
            connectorRepo.deleteAll();
        }
    }

    @Test
    void errorsForTheTestKeySayTest() throws Exception {
        rules((agg, r) -> agg.put("testKeyHash", PartnerKeyVerifier.sha256Hex("test-only-key")));
        String bad = mvc.perform(post("/ota/v1/BKG/OTA_VehAvailRate").header("X-Api-Key", "test-only-key")
                .contentType(MediaType.APPLICATION_XML).content("<OTA_VehAvailRateRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\"><VehAvailRQCore/></OTA_VehAvailRateRQ>"))
            .andReturn().getResponse().getContentAsString();
        assertTrue(bad.contains("<Errors>") && bad.contains("Target=\"Test\""), bad);
        String live = mvc.perform(post("/ota/v1/BKG/OTA_VehAvailRate").header("X-Api-Key", KEY)
                .contentType(MediaType.APPLICATION_XML).content("<OTA_VehAvailRateRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\"><VehAvailRQCore/></OTA_VehAvailRateRQ>"))
            .andReturn().getResponse().getContentAsString();
        assertTrue(live.contains("<Errors>") && live.contains("Target=\"Production\""), live);
    }

    @Test
    void aChannelWithoutAStationListUsesItsMainStation() throws Exception {
        rules((agg, r) -> r.putArray("locations"));
        String rs = send("/ota/v1/BKG/OTA_VehAvailRate", avail("NOLOC"));
        assertTrue(rs.contains("<Success/>") && rs.contains("<VehAvails>"), "falls back to the channel's main station: " + rs);
    }

    /**
     * The standard layout is valid against the official OpenTravel 2017B schemas for every message, on a channel with
     * covers (one without an OTA code), tax, a promotion, limited mileage, a change and a cancellation.
     */
    @Test
    void everyStandardAnswerIsValidAgainstTheOfficialOpenTravelSchemas() throws Exception {
        rules((agg, r) -> agg.put("otaProfile", "standard"));
        rules((agg, r) -> {
            ObjectNode p = r.putObject("pricing");
            p.put("taxPercent", 16).put("taxIncluded", false).put("taxName", "Sales tax");
            p.put("unlimitedMileage", false).put("kmPerDay", 200).put("extraKmPrice", 0.25);
            ArrayNode cv = p.putArray("coverages");
            cv.addObject().put("code", "CDW").put("name", "Collision damage waiver").put("included", true).put("excess", 500);
            cv.addObject().put("code", "SCDW").put("name", "Super cover").put("dailyPrice", 10).put("excess", 0);
            p.putArray("promotions").addObject().put("code", "SUMMER10").put("percentOff", 10).putArray("groups").add("SDAR");
        });
        java.util.Map<String, String> out = new java.util.LinkedHashMap<>();
        out.put("ping", send("/ota/v1/BKG/OTA_Ping", "<OTA_PingRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\"><EchoData>hi</EchoData></OTA_PingRQ>"));
        out.put("locsearch", send("/ota/v1/BKG/OTA_VehLocSearch", "<OTA_VehLocSearchRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\"/>"));
        out.put("locdetail", send("/ota/v1/BKG/OTA_VehLocDetail", "<OTA_VehLocDetailRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\"><Location LocationCode=\"AMM\"/></OTA_VehLocDetailRQ>"));
        String av = send("/ota/v1/BKG/OTA_VehAvailRate", avail("E1").replace("</VehAvailRQCore>", "<RateQualifier PromotionCode=\"SUMMER10\"/></VehAvailRQCore>")
            .replace("</SpecialEquipPrefs>", "</SpecialEquipPrefs><CoveragePrefs><CoveragePref CoverageType=\"SCDW\"/></CoveragePrefs>"));
        out.put("avail", av);
        String offer = firstOffer(av);
        out.put("raterule", send("/ota/v1/BKG/OTA_VehRateRule", "<OTA_VehRateRuleRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\"><Reference Type=\"16\" ID=\"" + offer + "\"/></OTA_VehRateRuleRQ>"));
        String res = send("/ota/v1/BKG/OTA_VehRes", vehRes(offer, "PROBE-1"));
        out.put("res", res);
        String number = res.substring(res.indexOf("ID=\"RSV-") + 4, res.indexOf('"', res.indexOf("ID=\"RSV-") + 4));
        out.put("modify", send("/ota/v1/BKG/OTA_VehModify", "<OTA_VehModifyRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\"><VehModifyRQCore ModifyType=\"Modify\"><UniqueID Type=\"14\" ID=\"" + number
            + "\"/><VehRentalCore PickUpDateTime=\"" + Y + "-05-01T10:00:00\" ReturnDateTime=\"" + Y + "-05-07T10:00:00\"/></VehModifyRQCore></OTA_VehModifyRQ>"));
        out.put("retres", send("/ota/v1/BKG/OTA_VehRetRes", "<OTA_VehRetResRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\"><VehRetResRQCore><UniqueID Type=\"14\" ID=\"" + number + "\"/></VehRetResRQCore></OTA_VehRetResRQ>"));
        out.put("cancel", send("/ota/v1/BKG/OTA_VehCancel", "<OTA_VehCancelRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\"><VehCancelRQCore CancelType=\"Book\"><UniqueID Type=\"14\" ID=\"" + number + "\"/></VehCancelRQCore></OTA_VehCancelRQ>"));
        out.put("error", send("/ota/v1/BKG/OTA_VehAvailRate", "<OTA_VehAvailRateRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\"><VehAvailRQCore/></OTA_VehAvailRateRQ>"));
        out.forEach((message, xml) -> assertEquals(List.of(), OfficialOtaSchemas.violations(xml), message + ":\n" + xml));
        assertTrue(out.get("avail").contains("CoverageType=\"7\" Code=\"CDW\""), "a known cover gets its OTA code");
        assertTrue(out.get("avail").contains("<AdditionalCoverages>") && out.get("avail").contains("Code=\"SCDW\""), "a cover without an OTA code is still offered");
        assertTrue(out.get("avail").contains("Purpose=\"7\"") && !out.get("avail").contains("<TaxAmounts>"), "tax once, as an OTA tax fee");
        assertTrue(out.get("locsearch").contains("Weds=\"true\"") && out.get("locsearch").contains("Start=\"06:00:00\""), "OTA day names and times");
        assertTrue(out.get("res").contains("<VehResRSInfo>"), "booking details in VehResRSInfo");
    }

    @Test
    void channelsConnectedBeforeKeepTheirLayout() throws Exception {
        String av = send("/ota/v1/BKG/OTA_VehAvailRate", avail("KEEP"));
        String locs = send("/ota/v1/BKG/OTA_VehLocSearch", "<OTA_VehLocSearchRQ xmlns=\"http://www.opentravel.org/OTA/2003/05\"/>");
        assertTrue(locs.contains("Wed=\"true\"") && locs.contains("Start=\"06:00\"") && locs.contains("<VehRentLocInfos/>"), locs);
        assertTrue(av.contains("<VehAvailInfo>\n") || av.contains("<VehAvailInfo>"), av);
        assertFalse(av.contains("<AdditionalCoverages>"), "no standard-only blocks: " + av);
    }
}
