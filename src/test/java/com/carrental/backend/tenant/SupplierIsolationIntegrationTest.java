package com.carrental.backend.tenant;

import com.carrental.backend.model.User;
import com.carrental.backend.model.UserPermission;
import com.carrental.backend.model.UserStatus;
import com.carrental.backend.ota.ChannelStateReader;
import com.carrental.backend.ota.PartnerKeyVerifier;
import com.carrental.backend.repository.UserRepository;
import com.carrental.backend.service.StateService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/**
 * Supplier isolation, end to end over HTTP: UR-Drive Jordan (with all the "existing" data), and two suppliers
 * created through the platform API, each with its own staff, fleet, prices and broker channel. Every attempt to
 * reach another supplier's data must answer as if that data did not exist.
 */
@SpringBootTest(properties = {
    "jwt.secret=test-secret-key-that-is-long-enough-for-hmac-sha256",
    "stripe.secret.key=sk_test_dummy",
    "stripe.price.id=price_dummy",
    "platform.multi-supplier=true",
    "platform.super-admins=platform@urd.test",
    "spring.datasource.url=jdbc:h2:mem:supplier-isolation;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class SupplierIsolationIntegrationTest {

    static final ObjectMapper M = new ObjectMapper();
    static final String Y = String.valueOf(java.time.LocalDate.now().getYear() + 1);
    static final String URD_KEY = "urd-broker-key", X_KEY = "x-broker-key", A_KEY = "a-broker-key";

    @Autowired MockMvc mvc;
    @Autowired StateService state;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;
    @Autowired SupplierRepository suppliers;
    @Autowired ChannelStateReader channels;
    @Autowired ChannelRegistry registry;

    String platformToken, urdToken, xToken, aToken;

    @BeforeAll
    void setUp() throws Exception {
        // UR-Drive Jordan as it is today: its data, its broker BKG, an administrator who is also platform super admin.
        state.applyPatch(ops(
            set("fleet", fleet("u1", "Toyota Corolla", "SDAR")),
            set("aggregators", channel("agg-urd", "BKG", URD_KEY, "SDAR", 50)),
            set("reservations", M.createObjectNode())));
        staff("platform@urd.test", "platform", UserPermission.values());
        staff("clerk@urd.test", "urd-clerk", UserPermission.VIEW_RESERVATIONS);
        platformToken = login("platform@urd.test");
        urdToken = platformToken;

        xToken = createSupplier("SPX", "Supplier X", "owner@spx.test");
        aToken = createSupplier("SPA", "Supplier A", "owner@spa.test");

        patchAs(xToken, ops(set("fleet", fleet("x1", "BMW X5 Supplier-X", "FFAR")),
            set("aggregators", channel("agg-x", "XBR", X_KEY, "FFAR", 99))));
        patchAs(aToken, ops(set("fleet", fleet("a1", "Nissan Sunny Supplier-A", "CDAR")),
            set("aggregators", channel("agg-a", "ABR", A_KEY, "CDAR", 33))));
    }

    // ------------------------------------------------------------------ office data

    @Test @Order(1)
    void eachSupplierSeesOnlyItsOwnOfficeData() throws Exception {
        String x = getAs(xToken, "/api/state");
        assertTrue(x.contains("BMW X5 Supplier-X"));
        assertFalse(x.contains("Toyota Corolla"), "no UR-Drive data");
        assertFalse(x.contains("Nissan Sunny"), "no Supplier A data");
        assertEquals("Supplier X", M.readTree(x).path("companyDetails").path("name").asText());

        String a = getAs(aToken, "/api/state");
        assertTrue(a.contains("Nissan Sunny Supplier-A"));
        assertFalse(a.contains("BMW X5") || a.contains("Toyota Corolla"));

        String u = getAs(urdToken, "/api/state");
        assertTrue(u.contains("Toyota Corolla"));
        assertFalse(u.contains("BMW X5") || u.contains("Nissan Sunny"), "UR-Drive does not see the new suppliers either");
    }

    @Test @Order(2)
    void aSupplierNamedInTheRequestIsIgnored() throws Exception {
        String body = mvc.perform(get("/api/state?supplier=urd&supplierId=urd").header("Authorization", xToken)
                .header("X-Supplier", "urd").header("X-Supplier-Id", "spa"))
            .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertTrue(body.contains("BMW X5"));
        assertFalse(body.contains("Toyota Corolla") || body.contains("Nissan Sunny"));
    }

    @Test @Order(3)
    void savingOnlyChangesTheOwnSuppliersData() throws Exception {
        String urdBefore = TenantContext.call("urd", state::getFullState);
        String aBefore = TenantContext.call("spa", state::getFullState);
        patchAs(xToken, ops(set("expenses", M.readTree("[{\"id\":\"e1\",\"description\":\"X fuel\",\"amount\":10}]"))));
        assertEquals(urdBefore, TenantContext.call("urd", state::getFullState));
        assertEquals(aBefore, TenantContext.call("spa", state::getFullState));
        assertTrue(getAs(xToken, "/api/state").contains("X fuel"));
    }

    @Test @Order(4)
    void backupsAreKeptAndRestoredPerSupplier() throws Exception {
        JsonNode list = M.readTree(getAs(xToken, "/api/state/backups"));
        assertTrue(list.size() > 0, "Supplier X has its own backups");
        for (JsonNode b : list) assertTrue(b.path("id").asText().startsWith("supplier-spx-"), b.toString());
        for (JsonNode b : M.readTree(getAs(urdToken, "/api/state/backups")))
            assertFalse(b.path("id").asText().startsWith("supplier-"), "UR-Drive's list holds only its own copies");
        // Restoring UR-Drive's or Supplier A's copy as Supplier X is refused.
        String urdBackup = M.readTree(getAs(urdToken, "/api/state/backups")).get(0).path("id").asText();
        assertEquals(400, postAs(xToken, "/api/state/restore", Map.of("id", urdBackup)).getResponse().getStatus());
        String aBackup = M.readTree(getAs(aToken, "/api/state/backups")).get(0).path("id").asText();
        assertEquals(400, postAs(xToken, "/api/state/restore", Map.of("id", aBackup)).getResponse().getStatus());
    }

    // ------------------------------------------------------------------ brokers

    @Test @Order(10)
    void brokersGetOnlyTheirSuppliersCarsAndPrices() throws Exception {
        String x = broker("XBR", X_KEY);
        assertTrue(x.contains("BMW X5 Supplier-X"), x);
        assertTrue(x.contains("99"), "Supplier X's price");
        assertFalse(x.contains("Toyota Corolla") || x.contains("Nissan Sunny"));

        String a = broker("ABR", A_KEY);
        assertTrue(a.contains("Nissan Sunny Supplier-A"), a);
        assertFalse(a.contains("BMW X5") || a.contains("Toyota Corolla"));

        String u = broker("BKG", URD_KEY);
        assertTrue(u.contains("Toyota Corolla"), "UR-Drive's broker keeps working unchanged: " + u);
        assertFalse(u.contains("BMW X5") || u.contains("Nissan Sunny"));
    }

    @Test @Order(11)
    void aKeyWorksOnlyOnItsOwnSuppliersChannel() throws Exception {
        assertTrue(broker("ABR", X_KEY).contains("AUTH_FAILED") || brokerStatus("ABR", X_KEY) == 401);
        assertEquals(401, brokerStatus("BKG", X_KEY));
        assertEquals(401, brokerStatus("XBR", URD_KEY));
        assertEquals(401, brokerStatus("XBR", "made-up-key"));
    }

    @Test @Order(12)
    void aBrokerBookingIsFiledWithItsSupplierOnly() throws Exception {
        String offer = firstOffer(broker("XBR", X_KEY));
        String booked = mvc.perform(post("/ota/v1/XBR/OTA_VehRes").contentType(MediaType.APPLICATION_XML).header("X-Api-Key", X_KEY)
                .content(vehRes(offer, "XREF-1"))).andReturn().getResponse().getContentAsString();
        assertTrue(booked.contains("RSV-"), booked);
        assertTrue(getAs(xToken, "/api/state").contains("XREF-1"), "in Supplier X's reservations");
        assertFalse(getAs(urdToken, "/api/state").contains("XREF-1"));
        assertFalse(getAs(aToken, "/api/state").contains("XREF-1"));
        // Supplier X sees it under its channel; Supplier A cannot even open that channel.
        assertTrue(getAs(xToken, "/api/channels/agg-x/bookings").contains("XREF-1"));
        assertEquals(404, status(get("/api/channels/agg-x/bookings"), aToken));
    }

    @Test @Order(13)
    void staffCannotOpenAnotherSuppliersChannelByChangingTheId() throws Exception {
        for (String path : List.of("/bookings", "/traffic", "/traffic/stats", "/webhooks", "/security", "/inventory", "/statement",
                "/oauth-clients", "/connectors")) {
            assertEquals(404, status(get("/api/channels/agg-urd" + path), xToken), "UR-Drive's channel " + path);
            assertEquals(404, status(get("/api/channels/agg-a" + path), xToken), "Supplier A's channel " + path);
            assertEquals(404, status(get("/api/channels/BKG" + path), xToken), "by code " + path);
        }
        assertEquals(404, status(post("/api/channels/agg-a/webhooks/secret"), xToken));
        assertEquals(404, status(post("/api/channels/agg-a/console").contentType(MediaType.APPLICATION_JSON)
            .content("{\"format\":\"OTA\",\"body\":\"<x/>\"}"), xToken));
        assertEquals(404, status(get("/api/channels/no-such-channel/traffic"), xToken));
        assertEquals(200, status(get("/api/channels/agg-x/traffic/stats"), xToken), "its own channel works");
        assertEquals(200, status(get("/api/channels/agg-urd/traffic/stats"), urdToken));
    }

    @Test @Order(14)
    void aChannelCodeOrIdOfAnotherSupplierCannotBeTaken() throws Exception {
        ArrayNode steal = (ArrayNode) channel("agg-x2", "BKG", "k", "FFAR", 1);
        assertEquals(409, patchStatus(xToken, ops(set("aggregators", steal))));
        ArrayNode stealId = (ArrayNode) channel("agg-a", "XB2", "k", "FFAR", 1);
        assertEquals(409, patchStatus(xToken, ops(set("aggregators", stealId))));
        assertTrue(broker("BKG", URD_KEY).contains("Toyota Corolla"), "UR-Drive's broker is untouched");
        assertTrue(getAs(xToken, "/api/state").contains("\"XBR\""), "Supplier X keeps its own channel");
    }

    @Test @Order(15)
    void backgroundJobsSeeEveryChannelAsItsOwnSupplier() {
        Map<String, String> owners = new java.util.HashMap<>();
        TenantContext.clear();
        for (var ch : channels.all()) owners.put(ch.channelCode(), ch.supplierId());
        assertEquals("urd", owners.get("BKG"));
        assertEquals("spx", owners.get("XBR"));
        assertEquals("spa", owners.get("ABR"));
        assertFalse(TenantContext.isBound(), "the job thread is not left tied to a supplier");
    }

    @Test @Order(16)
    void brokerDocumentsNameTheChannelsOwnSupplierAndNeverNct() throws Exception {
        String wsdl = mvc.perform(get("/ota/v1/XBR/soap")).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertTrue(wsdl.contains("Supplier X OpenTravel"), wsdl.substring(0, Math.min(1200, wsdl.length())));
        assertFalse(wsdl.contains("UR-Drive"));
        assertFalse(wsdl.toLowerCase().contains("nct"), "the system's own name never reaches brokers");
        String urdWsdl = mvc.perform(get("/ota/v1/BKG/soap")).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertFalse(urdWsdl.contains("Supplier X"));
        String portal = mvc.perform(get("/ota/developers").param("supplier", "SPX")).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertTrue(portal.contains("Supplier X"));
        assertFalse(portal.contains("UR-Drive Jordan"), "Supplier X's brokers see Supplier X's portal");
        assertTrue(mvc.perform(get("/ota/developers")).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8).contains("UR-Drive Jordan"),
            "the standard portal is unchanged");
    }

    // ------------------------------------------------------------------ staff, activity, files, settings

    @Test @Order(20)
    void staffAccountsAreManagedPerSupplier() throws Exception {
        String list = getAs(xToken, "/api/admin/users");
        assertTrue(list.contains("owner@spx.test"));
        assertFalse(list.contains("@urd.test") || list.contains("owner@spa.test"), list);
        String clerkId = users.findByEmail("clerk@urd.test").orElseThrow().getId();
        String aOwnerId = users.findByEmail("owner@spa.test").orElseThrow().getId();
        assertEquals(404, status(put("/api/admin/users/" + clerkId).contentType(MediaType.APPLICATION_JSON)
            .content("{\"fullName\":\"Hacked\",\"permissions\":[\"ACTION_ADMIN_MANAGE_USERS\"]}"), xToken));
        assertEquals(404, status(post("/api/admin/users/" + aOwnerId + "/password").contentType(MediaType.APPLICATION_JSON)
            .content("{\"password\":\"New-Password-12345\"}"), xToken));
        assertEquals(404, status(delete("/api/admin/users/" + clerkId), xToken));
        assertNotEquals("Hacked", users.findByEmail("clerk@urd.test").orElseThrow().getFullName());
        // A new account belongs to the creator's supplier.
        assertEquals(201, status(post("/api/admin/users").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"agent@spx.test\",\"fullName\":\"X Agent\",\"password\":\"Agent-Pass-12345\",\"permissions\":[\"VIEW_RESERVATIONS\"]}"), xToken));
        assertEquals("spx", users.findByEmail("agent@spx.test").orElseThrow().getSupplierId());
        assertFalse(getAs(urdToken, "/api/admin/users").contains("agent@spx.test"));
        // Usernames are unique on the platform whatever the letter case (sign-in by username ignores case).
        assertEquals(409, status(post("/api/admin/users").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"twin@spx.test\",\"username\":\"URD-Clerk\",\"fullName\":\"Twin\",\"password\":\"Agent-Pass-12345\",\"permissions\":[]}"), xToken));
    }

    @Test @Order(21)
    void theActivityLogShowsOnlyTheOwnSuppliersEvents() throws Exception {
        String x = getAs(xToken, "/api/activity?limit=500");
        assertTrue(x.contains("owner@spx.test"), "Supplier X's own sign-in");
        assertFalse(x.contains("platform@urd.test") || x.contains("owner@spa.test"), x);
        for (JsonNode e : M.readTree(getAs(urdToken, "/api/activity?limit=500")))
            assertNotEquals("owner@spx.test", e.path("userEmail").asText(), "Supplier X's own actions are not in UR-Drive's log");
        assertFalse(getAs(xToken, "/api/activity/users?days=30").contains("@urd.test"));
        // Each entry says where it came from.
        JsonNode first = M.readTree(getAs(xToken, "/api/activity?limit=5")).get(0);
        assertFalse(first.path("ipAddress").asText().isBlank(), first.toString());
    }

    @Test @Order(22)
    void filesOfAnotherSupplierAreNotFoundWhenSignedIn() throws Exception {
        String png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        String id = M.readTree(postAs(urdToken, "/api/media", Map.of("dataUrl", png)).getResponse().getContentAsString()).path("id").asText();
        assertEquals(404, status(get("/api/media/" + id), xToken));
        assertEquals(200, status(get("/api/media/" + id), urdToken));
    }

    @Test @Order(23)
    void emailSettingsArePerSupplier() throws Exception {
        assertEquals(200, mvc.perform(put("/api/admin/mail-settings").header("Authorization", urdToken).contentType(MediaType.APPLICATION_JSON)
            .content("{\"enabled\":false,\"host\":\"smtp.urd.example\",\"username\":\"urd@urd.example\",\"fromName\":\"UR-Drive\"}"))
            .andReturn().getResponse().getStatus());
        String x = getAs(xToken, "/api/admin/mail-settings");
        assertFalse(x.contains("smtp.urd.example") || x.contains("UR-Drive"), x);
        assertTrue(getAs(urdToken, "/api/admin/mail-settings").contains("smtp.urd.example"));
    }

    // ------------------------------------------------------------------ platform

    @Test @Order(30)
    void onlyThePlatformSuperAdminManagesSuppliers() throws Exception {
        assertEquals(200, status(get("/api/platform/suppliers"), platformToken));
        assertEquals(404, status(get("/api/platform/suppliers"), xToken), "a supplier owner does not see the platform");
        String clerk = login("clerk@urd.test");
        assertEquals(404, status(get("/api/platform/suppliers"), clerk), "a UR-Drive staff member is not a platform admin");
        assertEquals(404, status(post("/api/platform/suppliers").contentType(MediaType.APPLICATION_JSON)
            .content("{\"code\":\"EVIL\",\"name\":\"Evil\",\"ownerName\":\"E\",\"ownerEmail\":\"e@e.test\",\"ownerAccess\":\"password\",\"ownerPassword\":\"Evil-Pass-12345\"}"), xToken));
        assertTrue(suppliers.findByCodeIgnoreCase("EVIL").isEmpty());
        assertEquals(403, status(get("/api/admin/storage/check"), xToken), "platform-wide data check: not for a supplier");
    }

    @Test @Order(40)
    void aPausedSupplierCanNeitherSignInNorServeBrokers() throws Exception {
        Supplier a = suppliers.findById("spa").orElseThrow();
        a.setStatus(Supplier.Status.PAUSED.name());
        suppliers.save(a);
        try {
            assertEquals(403, mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"owner@spa.test\",\"password\":\"Owner-Pass-12345\"}")).andReturn().getResponse().getStatus());
            assertTrue(List.of(401, 403).contains(status(get("/api/state"), aToken)), "an earlier sign-in stops working");
            assertEquals(401, brokerStatus("ABR", A_KEY));
            assertTrue(broker("XBR", X_KEY).contains("BMW X5"), "the other suppliers keep working");
        } finally {
            a.setStatus(Supplier.Status.ACTIVE.name());
            suppliers.save(a);
        }
    }

    // ------------------------------------------------------------------ helpers

    String createSupplier(String code, String name, String owner) throws Exception {
        MvcResult r = postAs(platformToken, "/api/platform/suppliers", Map.of("code", code, "name", name, "currency", "USD",
            "ownerEmail", owner, "ownerName", name + " Owner", "ownerAccess", "password", "ownerPassword", "Owner-Pass-12345"));
        assertEquals(201, r.getResponse().getStatus(), r.getResponse().getContentAsString());
        return login(owner);
    }

    void staff(String email, String username, UserPermission... perms) {
        User u = users.findByEmail(email).orElseGet(User::new);
        u.setEmail(email); u.setUsername(username); u.setFullName(username); u.setPassword(encoder.encode("Owner-Pass-12345"));
        u.setStatus(UserStatus.ACTIVE); u.setWebAppAccess(true); u.setPermissions(new ArrayList<>(List.of(perms)));
        users.save(u);
    }

    String login(String email) throws Exception {
        String body = mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content(M.writeValueAsString(Map.of("email", email, "password", "Owner-Pass-12345")))).andReturn().getResponse().getContentAsString();
        String token = M.readTree(body).path("token").asText();
        assertFalse(token.isBlank(), "signed in: " + body);
        return "Bearer " + token;
    }

    String getAs(String token, String path) throws Exception {
        MvcResult r = mvc.perform(get(path).header("Authorization", token)).andReturn();
        assertEquals(200, r.getResponse().getStatus(), path + ": " + r.getResponse().getContentAsString());
        return r.getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    MvcResult postAs(String token, String path, Object body) throws Exception {
        return mvc.perform(post(path).header("Authorization", token).contentType(MediaType.APPLICATION_JSON).content(M.writeValueAsString(body))).andReturn();
    }

    int status(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder rq, String token) throws Exception {
        return mvc.perform(rq.header("Authorization", token)).andReturn().getResponse().getStatus();
    }

    void patchAs(String token, String patch) throws Exception {
        assertEquals(200, patchStatus(token, patch));
    }

    int patchStatus(String token, String patch) throws Exception {
        return mvc.perform(post("/api/state/patch").header("Authorization", token).contentType(MediaType.APPLICATION_JSON).content(patch))
            .andReturn().getResponse().getStatus();
    }

    String broker(String code, String key) throws Exception {
        return mvc.perform(post("/ota/v1/" + code + "/OTA_VehAvailRate").contentType(MediaType.APPLICATION_XML).header("X-Api-Key", key)
            .content(avail())).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    int brokerStatus(String code, String key) throws Exception {
        return mvc.perform(post("/ota/v1/" + code + "/OTA_VehAvailRate").contentType(MediaType.APPLICATION_XML).header("X-Api-Key", key)
            .content(avail())).andReturn().getResponse().getStatus();
    }

    static String avail() {
        return """
            <OTA_VehAvailRateRQ xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="I">
              <VehAvailRQCore><VehRentalCore PickUpDateTime="%s-05-01T10:00:00" ReturnDateTime="%s-05-04T10:00:00">
                <PickUpLocation LocationCode="AMM"/><ReturnLocation LocationCode="AMM"/></VehRentalCore>
                <DriverType Age="35"/></VehAvailRQCore>
            </OTA_VehAvailRateRQ>""".formatted(Y, Y);
    }

    static String vehRes(String offer, String ref) {
        return """
            <OTA_VehResRQ xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="R1">
              <VehResRQCore>
                <Customer><Primary BirthDate="1990-05-01"><PersonName><GivenName>John</GivenName><Surname>Doe</Surname></PersonName>
                  <Telephone PhoneNumber="+962790000000"/><Email>john@example.com</Email><Address><CountryName Code="JO"/></Address>
                  <Document DocID="JO123456" DocType="4" DocIssueCountry="JO"/></Primary></Customer>
              </VehResRQCore>
              <VehResRQInfo><Reference Type="16" ID="%s"/>
                <TPA_Extensions><BrokerReference>%s</BrokerReference></TPA_Extensions></VehResRQInfo>
            </OTA_VehResRQ>""".formatted(offer, ref);
    }

    static String firstOffer(String xml) {
        int i = xml.indexOf("Type=\"16\" ID=\"OFF-");
        assertTrue(i > 0, "offer id in response: " + xml);
        return xml.substring(i + 14, xml.indexOf('"', i + 14));
    }

    static JsonNode fleet(String id, String model, String sipp) throws Exception {
        return M.readTree("[{\"id\":\"%s\",\"modelName\":\"%s\",\"category\":\"Standard\",\"sippCode\":\"%s\",\"transmission\":\"Automatic\",\"licensePlate\":\"P-%s\"}]"
            .formatted(id, model, sipp, id));
    }

    static JsonNode channel(String id, String code, String key, String sipp, int price) throws Exception {
        ArrayNode a = (ArrayNode) M.readTree("""
            [{"id":"%s","name":"Broker %s","channelCode":"%s","vendorCode":"%s","locationCode":"AMM","currency":"USD","status":"active",
              "feedKeyHash":"%s","connectionDetails":{"apiUrl":"","username":"","apiKey":"","environment":"production"},
              "bookingRules":{"rateLimitPerMinute":5000,"locations":[{"code":"AMM","name":"Airport"}]},
              "extras":[],"currentRatePlans":[],
              "ratePlanHistory":[{"id":"p","submittedAt":"2026-01-01T00:00:00Z","version":1,"ratePlans":[
                {"id":"r","name":"All year","startDate":"%s-01-01","endDate":"%s-12-31","sippRates":[
                  {"id":"s","sippCode":"%s","tiers":[{"id":"t","fromDay":1,"toDay":null,"dailyPrice":%d}]}]}]}]}]
            """.formatted(id, code, code, code, PartnerKeyVerifier.sha256Hex(key), Y, Y, sipp, price));
        ObjectNode ch = (ObjectNode) a.get(0);
        ((ObjectNode) ch.get("bookingRules")).put("freeCancellationHours", 48);
        return a;
    }

    static ObjectNode set(String key, JsonNode value) {
        ObjectNode o = M.createObjectNode().put("op", "set").put("key", key);
        o.set("value", value);
        return o;
    }

    static String ops(ObjectNode... ops) throws Exception {
        ArrayNode a = M.createArrayNode();
        for (ObjectNode o : ops) a.add(o);
        return M.writeValueAsString(M.createObjectNode().set("ops", a));
    }
}
