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
        ((ObjectNode) state.get("fleet").get(0)).put("licensePlate", "SD-1").put("securityDeposit", 200).put("excess", 500);
        ObjectNode agg = (ObjectNode) state.get("aggregators").get(0);
        agg.put("status", status);
        ((ObjectNode) agg.get("connectionDetails")).put("environment", env);
        ObjectNode rules = agg.putObject("bookingRules");
        rules.put("webhookUrl", "https://hooks.partner.example/nct");
        rules.put("freeCancellationHours", 48).put("lateCancellationFeePercent", 100);
        ArrayNode locs = rules.putArray("locations");
        locs.addObject().put("code", "AMM").put("name", "Airport Office");
        locs.addObject().put("code", "AQJ").put("name", "Aqaba Branch");
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
        User u = new User();
        u.setEmail("cert@nct.test"); u.setFullName("Cert Admin"); u.setUsername("cert"); u.setPassword(encoder.encode("Pass-12345"));
        u.setStatus(UserStatus.ACTIVE); u.setWebAppAccess(true); u.setPermissions(List.of(UserPermission.VIEW_AGGREGATOR_SETUP));
        users.findByEmail("cert@nct.test").ifPresent(users::delete);
        users.save(u);
        String token = "Bearer " + jwt.generateToken("cert@nct.test");
        String report = mvc.perform(post("/api/channels/agg-1/certification").header("Authorization", token))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode r = M.readTree(report);
        for (JsonNode t : r.path("results")) assertTrue(t.path("passed").asBoolean(), t.toString());
        assertTrue(r.path("total").asInt() >= 18, report);
        assertEquals(0, reservations().path(Y).size(), "certification books nothing for real");
        mvc.perform(post("/api/channels/agg-1/certification")).andExpect(status().isUnauthorized());
        assertNotNull(LocalDate.now());
    }
}
