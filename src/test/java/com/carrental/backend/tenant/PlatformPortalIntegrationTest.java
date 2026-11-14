package com.carrental.backend.tenant;

import com.carrental.backend.model.User;
import com.carrental.backend.model.UserPermission;
import com.carrental.backend.model.UserStatus;
import com.carrental.backend.ota.PartnerKeyVerifier;
import com.carrental.backend.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/** The platform admin portal: packages, invitations, supplier status, broker access switches and support access. */
@SpringBootTest(properties = {
    "jwt.secret=test-secret-key-that-is-long-enough-for-hmac-sha256",
    "stripe.secret.key=sk_test_dummy",
    "stripe.price.id=price_dummy",
    "platform.multi-supplier=true",
    "platform.super-admins=\"boss@urd.test\"; ops",   // quotes and semicolons as pasted in a dashboard; "ops" is a username
    "app.base-url=https://portal.example.test",
    "spring.datasource.url=jdbc:h2:mem:platform-portal;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class PlatformPortalIntegrationTest {

    static final ObjectMapper M = new ObjectMapper();
    static final String Y = String.valueOf(java.time.LocalDate.now().getYear() + 1);
    static final String PASS = "Owner-Pass-12345";

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;
    @Autowired com.carrental.backend.security.JwtUtil jwt;

    String boss, clerk, xmlOwner, crmOwner;
    String inviteLink;

    @BeforeAll
    void setUp() throws Exception {
        account("boss@urd.test", UserPermission.values());
        account("clerk@urd.test", UserPermission.VIEW_RESERVATIONS);
        boss = login("boss@urd.test", PASS);
        clerk = login("clerk@urd.test", PASS);
    }

    @Test @Order(1)
    void onlyTheSuperAdminSeesThePortal() throws Exception {
        JsonNode me = json(get("/api/platform/me"), boss);
        assertEquals(3, me.path("plans").size());
        // The person refused is told why and as whom, so the setting can be fixed.
        MvcResult refused = mvc.perform(get("/api/platform/me").header("Authorization", clerk)).andReturn();
        assertEquals(403, refused.getResponse().getStatus());
        JsonNode why = M.readTree(refused.getResponse().getContentAsString());
        assertEquals("not-listed", why.path("reason").asText());
        assertEquals("clerk@urd.test", why.path("signedInAs").asText());
        assertEquals(404, status(get("/api/platform/overview"), clerk));
        // Listed by username rather than email works too.
        account("ops@urd.test", UserPermission.values());
        assertEquals(200, status(get("/api/platform/me"), login("ops@urd.test", PASS)));
        assertEquals(401, mvc.perform(get("/api/platform/me")).andReturn().getResponse().getStatus());
    }

    @Test @Order(2)
    void anXmlOnlySupplierIsCreatedWithAnInvitationTheOwnerUsesOnce() throws Exception {
        MvcResult r = send(boss, "/api/platform/suppliers", Map.of("code", "XMO", "name", "Xml Only Cars", "plan", "XML", "currency", "USD",
            "country", "jo", "timeZone", "Asia/Amman", "contactEmail", "Ops@XmlOnly.test", "ownerName", "Omar Owner", "ownerEmail", "owner@xmlonly.test", "ownerAccess", "invite"));
        assertEquals(201, r.getResponse().getStatus(), r.getResponse().getContentAsString());
        JsonNode body = M.readTree(r.getResponse().getContentAsString());
        assertEquals("XML", body.path("plan").asText());
        assertEquals("JO", body.path("country").asText());
        assertEquals("ops@xmlonly.test", body.path("contactEmail").asText());
        assertFalse(body.path("invitation").path("emailSent").asBoolean(), "no email server in the test: the link is shown instead");
        inviteLink = body.path("invitation").path("link").asText();
        assertTrue(inviteLink.startsWith("https://portal.example.test/set-password?token="), inviteLink);
        String token = inviteLink.substring(inviteLink.indexOf("token=") + 6);

        // Before choosing a password the owner cannot sign in.
        assertNotEquals(200, mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"owner@xmlonly.test\",\"password\":\"" + PASS + "\"}")).andReturn().getResponse().getStatus());
        JsonNode who = M.readTree(mvc.perform(get("/auth/password-setup").param("token", token)).andReturn().getResponse().getContentAsString());
        assertEquals("owner@xmlonly.test", who.path("email").asText());
        assertEquals("Xml Only Cars", who.path("company").asText());
        assertEquals(400, setPassword(token, "short"), "the password rules apply");
        assertEquals(200, setPassword(token, PASS));
        assertEquals(404, setPassword(token, "Another-Pass-123"), "a link works once");
        xmlOwner = login("owner@xmlonly.test", PASS);
    }

    @Test @Order(3)
    void thePackageCapsWhatPeopleCanDoOnTheServer() throws Exception {
        JsonNode me = json(get("/api/account/me"), xmlOwner);
        assertEquals("XML", me.path("supplierPlan").asText());
        assertEquals("Xml Only Cars", me.path("supplierName").asText());
        List<String> plan = new ArrayList<>();
        me.path("planPermissions").forEach(p -> plan.add(p.asText()));
        assertTrue(plan.contains("VIEW_AGGREGATOR_SETUP"));
        assertFalse(plan.contains("VIEW_RESERVATIONS") || plan.contains("VIEW_FINANCIALS_ACCOUNTING"));
        // The owner holds every permission on paper, but the package removes the CRM ones: saving expenses is refused.
        MvcResult r = send(xmlOwner, "/api/state/patch", Map.of("ops", List.of(Map.of("op", "set", "key", "expenses",
            "value", List.of(Map.of("id", "e1", "description", "Fuel", "amount", 5))))));
        assertTrue(r.getResponse().getContentAsString().contains("expenses"), "reported as skipped: " + r.getResponse().getContentAsString());
        assertFalse(json(get("/api/state"), xmlOwner).path("expenses").toString().contains("Fuel"));
        // Fleet and channels are part of the XML package.
        assertEquals(200, send(xmlOwner, "/api/state/patch", Map.of("ops", List.of(
            Map.of("op", "set", "key", "fleet", "value", M.readTree(fleet())),
            Map.of("op", "set", "key", "aggregators", "value", M.readTree(channel("ch-xmo", "XMO1", "xmo-key")))))).getResponse().getStatus());
        assertEquals(200, broker("XMO1", "xmo-key"));
    }

    @Test @Order(4)
    void aCrmOnlySupplierHasNoBrokerConnections() throws Exception {
        assertEquals(201, send(boss, "/api/platform/suppliers", Map.of("code", "CRMO", "name", "Crm Only Rentals", "plan", "CRM",
            "ownerName", "Cara Owner", "ownerEmail", "owner@crmonly.test", "ownerAccess", "password", "ownerPassword", PASS)).getResponse().getStatus());
        crmOwner = login("owner@crmonly.test", PASS);
        MvcResult saved = send(crmOwner, "/api/state/patch", Map.of("ops", List.of(Map.of("op", "set", "key", "fleet", "value", M.readTree(fleet())),
            Map.of("op", "set", "key", "aggregators", "value", M.readTree(channel("ch-crm", "CRM1", "crm-key"))))));
        assertTrue(saved.getResponse().getContentAsString().contains("aggregators"), "broker channels are not in a CRM package");
        assertEquals(401, broker("CRM1", "crm-key"), "brokers are not answered for a CRM-only supplier");
        assertNotEquals(200, status(get("/api/channels/ch-crm/traffic/stats"), crmOwner));
        // Changing the package to Full system: the owner can add the channel and brokers are answered.
        assertEquals(200, mvc.perform(put("/api/platform/suppliers/crmo").header("Authorization", boss).contentType(MediaType.APPLICATION_JSON)
            .content("{\"plan\":\"FULL\"}")).andReturn().getResponse().getStatus());
        crmOwner = login("owner@crmonly.test", PASS);
        assertEquals("", send(crmOwner, "/api/state/patch", Map.of("ops", List.of(
            Map.of("op", "set", "key", "aggregators", "value", M.readTree(channel("ch-crm", "CRM1", "crm-key")))))).getResponse().getContentAsString());
        assertEquals(200, broker("CRM1", "crm-key"));
    }

    @Test @Order(5)
    void liveAccessCanBeSwitchedOffForASupplier() throws Exception {
        mvc.perform(put("/api/platform/suppliers/xmo").header("Authorization", boss).contentType(MediaType.APPLICATION_JSON).content("{\"liveAccess\":false}"));
        String body = mvc.perform(post("/ota/v1/XMO1/OTA_VehAvailRate").contentType(MediaType.APPLICATION_XML).header("X-Api-Key", "xmo-key").content(avail()))
            .andReturn().getResponse().getContentAsString();
        assertTrue(body.contains("Live access is not enabled"), body);
        mvc.perform(put("/api/platform/suppliers/xmo").header("Authorization", boss).contentType(MediaType.APPLICATION_JSON).content("{\"liveAccess\":true}"));
        assertEquals(200, broker("XMO1", "xmo-key"));
    }

    @Test @Order(6)
    void pausingNeedsAReasonAndUrDriveCannotBePaused() throws Exception {
        assertEquals(400, send(boss, "/api/platform/suppliers/xmo/status", Map.of("status", "PAUSED")).getResponse().getStatus());
        assertEquals(400, send(boss, "/api/platform/suppliers/urd/status", Map.of("status", "PAUSED", "reason", "test")).getResponse().getStatus());
        assertEquals(200, send(boss, "/api/platform/suppliers/xmo/status", Map.of("status", "PAUSED", "reason", "Unpaid invoice")).getResponse().getStatus());
        assertEquals(401, broker("XMO1", "xmo-key"));
        assertEquals(200, send(boss, "/api/platform/suppliers/xmo/status", Map.of("status", "ACTIVE")).getResponse().getStatus());
        assertEquals(200, broker("XMO1", "xmo-key"));
    }

    @Test @Order(7)
    void supportAccessIsReadOnlyTimeLimitedAndLoggedOnBothSides() throws Exception {
        assertEquals(400, send(boss, "/api/platform/suppliers/xmo/support", Map.of("reason", "")).getResponse().getStatus(), "a reason is required");
        assertEquals(404, send(clerk, "/api/platform/suppliers/xmo/support", Map.of("reason", "curious about it")).getResponse().getStatus());
        JsonNode s = M.readTree(send(boss, "/api/platform/suppliers/xmo/support", Map.of("reason", "Broker reports missing cars", "minutes", 30))
            .getResponse().getContentAsString());
        String support = "Bearer " + s.path("token").asText();
        // Reads the supplier's data, not UR-Drive's.
        assertTrue(json(get("/api/state"), support).toString().contains("Supplier Car"));
        assertEquals("Xml Only Cars", json(get("/api/account/me"), support).path("supplierName").asText());
        // Nothing can be changed.
        assertEquals(403, send(support, "/api/state/patch", Map.of("ops", List.of(Map.of("op", "set", "key", "fleet", "value", List.of())))).getResponse().getStatus());
        assertEquals(403, status(post("/api/admin/users").contentType(MediaType.APPLICATION_JSON).content("{}"), support));
        assertTrue(json(get("/api/state"), xmlOwner).toString().contains("Supplier Car"), "the supplier's data is untouched");
        // Both logs show it.
        assertTrue(json(get("/api/activity?limit=200"), xmlOwner).toString().contains("Platform support opened your data read-only"));
        assertTrue(json(get("/api/platform/activity"), boss).toString().contains("Broker reports missing cars"));
        // A support sign-in made by someone who is not a super admin is refused even if it were forged with their name.
        assertEquals(400, send(boss, "/api/platform/suppliers/urd/support", Map.of("reason", "own company")).getResponse().getStatus());
    }

    @Test @Order(8)
    void theOverviewAndListShowEverySupplierWithItsFigures() throws Exception {
        JsonNode o = json(get("/api/platform/overview"), boss);
        assertEquals(3, o.path("suppliers").asInt());
        assertEquals(1, o.path("byPlan").path("XML").asInt());
        assertTrue(o.path("brokerCalls7d").asLong() >= 3);
        JsonNode list = json(get("/api/platform/suppliers"), boss);
        assertEquals("urd", list.get(0).path("id").asText(), "UR-Drive Jordan first");
        Map<String, JsonNode> byId = new HashMap<>();
        list.forEach(n -> byId.put(n.path("id").asText(), n));
        assertEquals(1, byId.get("xmo").path("channels").asInt());
        assertEquals("owner@xmlonly.test", byId.get("xmo").path("owner").asText());
        JsonNode detail = json(get("/api/platform/suppliers/xmo"), boss);
        assertEquals(1, detail.path("staff").size());
        assertTrue(detail.path("history").toString().contains("Unpaid invoice"));
    }

    @Test @Order(9)
    void anotherAdministratorCanBeInvitedAndSwitchedOff() throws Exception {
        MvcResult r = send(boss, "/api/platform/suppliers/xmo/users", Map.of("name", "Second Admin", "email", "second@xmlonly.test"));
        assertEquals(201, r.getResponse().getStatus());
        String uid = M.readTree(r.getResponse().getContentAsString()).path("id").asText();
        assertEquals("xmo", users.findByEmail("second@xmlonly.test").orElseThrow().getSupplierId());
        assertTrue(M.readTree(send(boss, "/api/platform/suppliers/xmo/users/" + uid + "/link", Map.of()).getResponse().getContentAsString())
            .path("link").asText().contains("token="));
        assertEquals(200, send(boss, "/api/platform/suppliers/xmo/users/" + uid + "/status", Map.of("active", false)).getResponse().getStatus());
        assertEquals(UserStatus.INACTIVE, users.findByEmail("second@xmlonly.test").orElseThrow().getStatus());
        // Ids from another supplier are not found under this one.
        String clerkId = users.findByEmail("clerk@urd.test").orElseThrow().getId();
        assertEquals(404, send(boss, "/api/platform/suppliers/xmo/users/" + clerkId + "/status", Map.of("active", false)).getResponse().getStatus());
    }

    @Test @Order(10)
    void staffOfASupplierGetOnlyWhatThePackageAndTheirCreatorAllow() throws Exception {
        // The XML-only owner gives a new person CRM screens too: only the OTA XML ones are kept.
        MvcResult r = send(xmlOwner, "/api/admin/users", Map.of("email", "pricing@xmlonly.test", "fullName", "Pia Pricing", "password", PASS,
            "permissions", List.of("VIEW_AGGREGATOR_SETUP", "ACTION_ADMIN_MANAGE_RATE_PLANS", "VIEW_RESERVATIONS", "VIEW_FINANCIALS_ACCOUNTING")));
        assertEquals(201, r.getResponse().getStatus(), r.getResponse().getContentAsString());
        assertEquals(java.util.Set.of(UserPermission.VIEW_AGGREGATOR_SETUP, UserPermission.ACTION_ADMIN_MANAGE_RATE_PLANS),
            java.util.Set.copyOf(users.findByEmail("pricing@xmlonly.test").orElseThrow().getPermissions()));
        // A staff manager who is not allowed to publish rates cannot give that right to someone else.
        assertEquals(201, send(xmlOwner, "/api/admin/users", Map.of("email", "staffadmin@xmlonly.test", "fullName", "Sam Staff", "password", PASS,
            "permissions", List.of("ACTION_ADMIN_MANAGE_USERS", "VIEW_ADMIN_PANEL", "VIEW_AGGREGATOR_SETUP"))).getResponse().getStatus());
        String staffAdmin = login("staffadmin@xmlonly.test", PASS);
        MvcResult escalate = send(staffAdmin, "/api/admin/users", Map.of("email", "friend@xmlonly.test", "fullName", "Fred Friend", "password", PASS,
            "permissions", List.of("VIEW_AGGREGATOR_SETUP", "ACTION_ADMIN_MANAGE_RATE_PLANS")));
        assertEquals(403, escalate.getResponse().getStatus());
        assertTrue(escalate.getResponse().getContentAsString().contains("do not have yourself"));
        assertTrue(users.findByEmail("friend@xmlonly.test").isEmpty());
        // Nor give it to themselves or to an existing colleague.
        String selfId = users.findByEmail("staffadmin@xmlonly.test").orElseThrow().getId();
        assertEquals(403, mvc.perform(put("/api/admin/users/" + selfId).header("Authorization", staffAdmin).contentType(MediaType.APPLICATION_JSON)
            .content("{\"permissions\":[\"ACTION_ADMIN_MANAGE_USERS\",\"VIEW_ADMIN_PANEL\",\"VIEW_AGGREGATOR_SETUP\",\"ACTION_ADMIN_MANAGE_RATE_PLANS\"]}"))
            .andReturn().getResponse().getStatus());
        // What they have themselves they can give, and taking rights away is always allowed.
        assertEquals(201, send(staffAdmin, "/api/admin/users", Map.of("email", "viewer@xmlonly.test", "fullName", "Vera Viewer", "password", PASS,
            "permissions", List.of("VIEW_AGGREGATOR_SETUP"))).getResponse().getStatus());
        String pricingId = users.findByEmail("pricing@xmlonly.test").orElseThrow().getId();
        assertEquals(200, mvc.perform(put("/api/admin/users/" + pricingId).header("Authorization", staffAdmin).contentType(MediaType.APPLICATION_JSON)
            .content("{\"permissions\":[\"VIEW_AGGREGATOR_SETUP\",\"ACTION_ADMIN_MANAGE_RATE_PLANS\"]}")).andReturn().getResponse().getStatus(),
            "keeping a right the colleague already has is fine");
    }

    @Test @Order(11)
    void eachSupplierHasItsOwnBrandedSignInPage() throws Exception {
        JsonNode company = json(get("/api/state"), xmlOwner).path("companyDetails");
        Map<String, Object> details = M.convertValue(company, Map.class);
        details.put("brandColor", "#0f766e");
        details.put("signInTagline", "Staff sign-in · Amman");
        details.put("logoUrl", "https://evil.example/logo.png");
        assertEquals(200, send(xmlOwner, "/api/state/patch", Map.of("ops", List.of(Map.of("op", "set", "key", "companyDetails", "value", details)))).getResponse().getStatus());
        JsonNode b = M.readTree(mvc.perform(get("/auth/branding").param("code", "xmo")).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
        assertEquals("Xml Only Cars", b.path("name").asText());
        assertEquals("#0f766e", b.path("brandColor").asText());
        assertEquals("Staff sign-in · Amman", b.path("signInTagline").asText());
        assertTrue(b.path("logoUrl").isNull(), "a logo from another site is never shown on the sign-in page");
        assertFalse(b.toString().contains("@"), "no email addresses or other private details");
        assertEquals(404, mvc.perform(get("/auth/branding").param("code", "NOPE")).andReturn().getResponse().getStatus());
        assertEquals(404, mvc.perform(get("/auth/branding").param("code", "URD")).andReturn().getResponse().getStatus(), "UR-Drive Jordan keeps its own page");
        send(boss, "/api/platform/suppliers/xmo/status", Map.of("status", "PAUSED", "reason", "branding test"));
        assertEquals(404, mvc.perform(get("/auth/branding").param("code", "XMO")).andReturn().getResponse().getStatus(), "a paused supplier has no sign-in page");
        send(boss, "/api/platform/suppliers/xmo/status", Map.of("status", "ACTIVE"));
        // The sign-in link itself opens the app.
        assertEquals(200, mvc.perform(get("/s/XMO")).andReturn().getResponse().getStatus());
    }

    @Test @Order(12)
    void supportSignInsThatAreExpiredOrNotForASuperAdminDoNotWork() throws Exception {
        // Signed correctly, but for a person who is not a platform super admin.
        String forClerk = "Bearer " + jwt.generateSupportToken("clerk@urd.test", "xmo", 30);
        assertEquals(401, status(get("/api/state"), forClerk));
        // A super admin's support sign-in after its time is up.
        String expired = "Bearer " + jwt.generateSupportToken("boss@urd.test", "xmo", -1);
        assertEquals(401, status(get("/api/state"), expired));
        // A made-up token.
        assertEquals(401, status(get("/api/state"), "Bearer not.a.token"));
    }

    @Test @Order(13)
    void everySupplierHasItsOwnUniqueSignInAddress() throws Exception {
        // Made from the name when none was chosen.
        assertEquals("xml-only-cars", json(get("/api/platform/suppliers/xmo"), boss).path("slug").asText());
        assertEquals("/s/xml-only-cars", json(get("/api/platform/suppliers/xmo"), boss).path("signInPath").asText());
        // Checked as typed: reserved words, taken addresses and bad characters are refused.
        assertFalse(json(get("/api/platform/slug-check?slug=admin"), boss).path("available").asBoolean());
        assertFalse(json(get("/api/platform/slug-check?slug=xml-only-cars"), boss).path("available").asBoolean(), "taken by another supplier");
        assertTrue(json(get("/api/platform/slug-check?slug=xml-only-cars&id=xmo"), boss).path("available").asBoolean(), "its own address");
        assertFalse(json(get("/api/platform/slug-check?slug=Bad_Address!"), boss).path("available").asBoolean());
        assertEquals("crm-only-rentals", json(get("/api/platform/suppliers/crmo"), boss).path("slug").asText());
        assertEquals("crm-only-rentals-2", json(get("/api/platform/slug-check").param("name", "Crm Only Rentals"), boss).path("slug").asText(),
            "a suggestion for a name already in use gets a number, so it is always free");
        assertEquals(404, status(get("/api/platform/slug-check?slug=x"), clerk));
        // A chosen address when creating; a duplicate is refused.
        assertEquals(201, send(boss, "/api/platform/suppliers", Map.of("code", "DDR", "name", "Desert Drive", "slug", "desert-drive", "plan", "FULL",
            "ownerName", "D Owner", "ownerEmail", "owner@ddr.test", "ownerAccess", "password", "ownerPassword", PASS)).getResponse().getStatus());
        assertEquals(400, send(boss, "/api/platform/suppliers", Map.of("code", "DD2", "name", "Desert Drive Two", "slug", "desert-drive", "plan", "FULL",
            "ownerName", "E Owner", "ownerEmail", "owner@dd2.test", "ownerAccess", "password", "ownerPassword", PASS)).getResponse().getStatus());
        // The sign-in page answers at the address and at the short code.
        assertEquals("Desert Drive", M.readTree(mvc.perform(get("/auth/branding").param("code", "desert-drive")).andReturn().getResponse().getContentAsString()).path("name").asText());
        assertEquals(200, mvc.perform(get("/auth/branding").param("code", "DDR")).andReturn().getResponse().getStatus());
        assertEquals(200, mvc.perform(get("/s/desert-drive")).andReturn().getResponse().getStatus());
        // Changing it: the new one works, the old one stops, the short code keeps working.
        assertEquals(200, mvc.perform(put("/api/platform/suppliers/ddr").header("Authorization", boss).contentType(MediaType.APPLICATION_JSON)
            .content("{\"slug\":\"desert-drive-amman\"}")).andReturn().getResponse().getStatus());
        assertEquals(200, mvc.perform(get("/auth/branding").param("code", "desert-drive-amman")).andReturn().getResponse().getStatus());
        assertEquals(404, mvc.perform(get("/auth/branding").param("code", "desert-drive")).andReturn().getResponse().getStatus());
        assertEquals(200, mvc.perform(get("/auth/branding").param("code", "ddr")).andReturn().getResponse().getStatus());
        assertEquals(400, mvc.perform(put("/api/platform/suppliers/ddr").header("Authorization", boss).contentType(MediaType.APPLICATION_JSON)
            .content("{\"slug\":\"xml-only-cars\"}")).andReturn().getResponse().getStatus(), "another supplier's address cannot be taken");
        assertTrue(json(get("/api/platform/activity"), boss).toString().contains("/s/desert-drive → /s/desert-drive-amman"));
        // The owner sees the address in their own workspace (for the branding link).
        assertEquals("desert-drive-amman", json(get("/api/account/me"), login("owner@ddr.test", PASS)).path("supplierCode").asText());
    }

    // ------------------------------------------------------------------ helpers

    void account(String email, UserPermission... perms) {
        User u = new User();
        u.setEmail(email); u.setUsername(email.substring(0, email.indexOf('@'))); u.setFullName(email);
        u.setPassword(encoder.encode(PASS)); u.setStatus(UserStatus.ACTIVE); u.setWebAppAccess(true);
        u.setPermissions(new ArrayList<>(List.of(perms)));
        users.save(u);
    }

    String login(String email, String password) throws Exception {
        String body = mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content(M.writeValueAsString(Map.of("email", email, "password", password)))).andReturn().getResponse().getContentAsString();
        String t = M.readTree(body).path("token").asText();
        assertFalse(t.isBlank(), body);
        return "Bearer " + t;
    }

    int setPassword(String token, String password) throws Exception {
        return mvc.perform(post("/auth/password-setup").contentType(MediaType.APPLICATION_JSON)
            .content(M.writeValueAsString(Map.of("token", token, "password", password)))).andReturn().getResponse().getStatus();
    }

    MvcResult send(String token, String path, Object body) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path).header("Authorization", token)
            .contentType(MediaType.APPLICATION_JSON).content(M.writeValueAsString(body))).andReturn();
    }

    JsonNode json(MockHttpServletRequestBuilder rq, String token) throws Exception {
        MvcResult r = mvc.perform(rq.header("Authorization", token)).andReturn();
        assertEquals(200, r.getResponse().getStatus(), r.getResponse().getContentAsString());
        return M.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    int status(MockHttpServletRequestBuilder rq, String token) throws Exception {
        return mvc.perform(rq.header("Authorization", token)).andReturn().getResponse().getStatus();
    }

    int broker(String code, String key) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/ota/v1/" + code + "/OTA_VehAvailRate")
            .contentType(MediaType.APPLICATION_XML).header("X-Api-Key", key).content(avail())).andReturn().getResponse().getStatus();
    }

    static String avail() {
        return """
            <OTA_VehAvailRateRQ xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="I">
              <VehAvailRQCore><VehRentalCore PickUpDateTime="%s-05-01T10:00:00" ReturnDateTime="%s-05-04T10:00:00">
                <PickUpLocation LocationCode="AMM"/><ReturnLocation LocationCode="AMM"/></VehRentalCore>
                <DriverType Age="35"/></VehAvailRQCore>
            </OTA_VehAvailRateRQ>""".formatted(Y, Y);
    }

    static String fleet() {
        return "[{\"id\":\"c1\",\"modelName\":\"Supplier Car\",\"category\":\"Standard\",\"sippCode\":\"CDAR\",\"transmission\":\"Automatic\",\"licensePlate\":\"S-1\"}]";
    }

    static String channel(String id, String code, String key) {
        return """
            [{"id":"%s","name":"Broker %s","channelCode":"%s","vendorCode":"%s","locationCode":"AMM","currency":"USD","status":"active",
              "feedKeyHash":"%s","connectionDetails":{"environment":"production"},
              "bookingRules":{"rateLimitPerMinute":5000,"locations":[{"code":"AMM","name":"Airport"}]},"extras":[],"currentRatePlans":[],
              "ratePlanHistory":[{"id":"p","submittedAt":"2026-01-01T00:00:00Z","version":1,"ratePlans":[
                {"id":"r","name":"All year","startDate":"%s-01-01","endDate":"%s-12-31","sippRates":[
                  {"id":"s","sippCode":"CDAR","tiers":[{"id":"t","fromDay":1,"toDay":null,"dailyPrice":30}]}]}]}]}]
            """.formatted(id, code, code, code, PartnerKeyVerifier.sha256Hex(key), Y, Y);
    }
}
