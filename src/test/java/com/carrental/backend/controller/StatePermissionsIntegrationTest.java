package com.carrental.backend.controller;

import com.carrental.backend.model.User;
import com.carrental.backend.model.UserPermission;
import com.carrental.backend.model.UserStatus;
import com.carrental.backend.repository.UserRepository;
import com.carrental.backend.security.JwtUtil;
import com.carrental.backend.service.StateService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The server applies only the sections a person may change; everyday work (bookings) is never blocked. */
@SpringBootTest(properties = {
    "jwt.secret=test-secret-key-that-is-long-enough-for-hmac-sha256",
    "spring.datasource.url=jdbc:h2:mem:state-perm-it;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class StatePermissionsIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JwtUtil jwt;
    @Autowired StateService state;
    final ObjectMapper json = new ObjectMapper();

    String token(String email, UserPermission... perms) {
        User u = users.findByEmail(email).orElseGet(User::new);
        u.setEmail(email); u.setFullName(email); u.setUsername(email.split("@")[0]); u.setPassword("x");
        u.setStatus(UserStatus.ACTIVE); u.setWebAppAccess(true); u.setPermissions(List.of(perms));
        users.save(u);
        return "Bearer " + jwt.generateToken(email);
    }

    @BeforeEach
    void seed() {
        users.deleteAll();
        state.mergeState("""
            {"franchisePayments":[{"id":"fp1","amount":100}],"fleet":[{"id":"v1","modelName":"Kia"}],
             "users":[{"id":"u1","email":"agent@nct.test","fullName":"Sara","permissions":["VIEW_RESERVATIONS"],"role":"STAFF"},
                      {"id":"u2","email":"other@nct.test","fullName":"Omar","permissions":["VIEW_RESERVATIONS"]}],
             "reservations":{"2026":{"November":[]}}}""");
    }

    JsonNode saved() throws Exception { return json.readTree(state.getFullState()); }

    String patch(String token, String ops) throws Exception {
        return mvc.perform(post("/api/state/patch").header("Authorization", token).contentType(MediaType.APPLICATION_JSON).content("{\"ops\":" + ops + "}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    @Test
    void staffWithoutPermissionCannotChangeFranchisePaymentsButTheirBookingIsSaved() throws Exception {
        String agent = token("agent@nct.test", UserPermission.VIEW_RESERVATIONS);
        String res = patch(agent, """
            [{"op":"upsertReservation","year":"2026","month":"November","reservation":{"id":"r1","bookingId":"B-1","amount":50}},
             {"op":"set","key":"franchisePayments","value":[]},
             {"op":"set","key":"fleet","value":[{"id":"v1","modelName":"Hacked"}]}]""");
        assertTrue(res.contains("franchisePayments") && res.contains("fleet"), res);
        JsonNode s = saved();
        assertEquals(1, s.path("franchisePayments").size(), "franchise payments untouched");
        assertEquals("Kia", s.path("fleet").get(0).path("modelName").asText(), "fleet untouched");
        assertEquals("B-1", s.path("reservations").path("2026").path("November").get(0).path("bookingId").asText(), "the booking is saved");
    }

    @Test
    void permissionHolderAndAdminCanChangeTheirSections() throws Exception {
        String fin = token("fin@nct.test", UserPermission.ACTION_FINANCIALS_MANAGE_FRANCHISE_PAYMENTS);
        assertEquals("", patch(fin, "[{\"op\":\"set\",\"key\":\"franchisePayments\",\"value\":[{\"id\":\"fp1\",\"amount\":100},{\"id\":\"fp2\",\"amount\":5}]}]"));
        assertEquals(2, saved().path("franchisePayments").size());
        String admin = token("admin@nct.test", UserPermission.ACTION_ADMIN_MANAGE_USERS);
        patch(admin, "[{\"op\":\"set\",\"key\":\"fleet\",\"value\":[{\"id\":\"v1\",\"modelName\":\"Kia Pegas\"}]}]");
        assertEquals("Kia Pegas", saved().path("fleet").get(0).path("modelName").asText());
    }

    @Test
    void staffMayEditOnlyTheirOwnProfileAndNeverTheirPermissions() throws Exception {
        String agent = token("agent@nct.test", UserPermission.VIEW_RESERVATIONS);
        patch(agent, """
            [{"op":"set","key":"users","value":[
              {"id":"u1","email":"agent@nct.test","fullName":"Sara K.","permissions":["ACTION_ADMIN_MANAGE_USERS"],"role":"ADMIN"},
              {"id":"u2","email":"other@nct.test","fullName":"Changed by Sara","permissions":[]},
              {"id":"u3","email":"new@nct.test","fullName":"Added by Sara"}]}]""");
        JsonNode u = saved().path("users");
        assertEquals(2, u.size(), "nobody added");
        assertEquals("Sara K.", u.get(0).path("fullName").asText(), "own name changed");
        assertEquals("VIEW_RESERVATIONS", u.get(0).path("permissions").get(0).asText(), "own permissions unchanged");
        assertEquals("STAFF", u.get(0).path("role").asText(), "own role unchanged");
        assertEquals("Omar", u.get(1).path("fullName").asText(), "others unchanged");
    }

    @Test
    void onANewSystemStaffCanAddTheirProfileAndNothingIsReportedAsRefused() throws Exception {
        state.applyPatch("{\"ops\":[{\"op\":\"set\",\"key\":\"users\",\"value\":null}]}");
        String first = token("first@nct.test", UserPermission.VIEW_RESERVATIONS);
        String r1 = patch(first, """
            [{"op":"set","key":"users","value":[{"id":"f1","email":"first@nct.test","fullName":"First"}]}]""");
        assertFalse(r1.contains("users"), "not reported as refused: " + r1);
        assertEquals("First", saved().path("users").get(0).path("fullName").asText());
        // A later save that carries an old copy of someone else's entry is not a refusal either.
        String r2 = patch(first, """
            [{"op":"set","key":"users","value":[{"id":"f1","email":"first@nct.test","fullName":"First"},{"id":"zz","email":"ghost@nct.test"}]}]""");
        assertFalse(r2.contains("users"), r2);
        assertEquals(1, saved().path("users").size(), "the other entry is not taken from a non-administrator");
    }

    @Test
    void whatTheAppAlreadyAllowedIsStillSaved() throws Exception {
        // Anyone who can open Accounting has always been able to add expenses there.
        String accountant = token("accountant@nct.test", UserPermission.VIEW_FINANCIALS_ACCOUNTING);
        String r1 = patch(accountant, """
            [{"op":"set","key":"expenses","value":[{"id":"e1","amount":40,"description":"Car wash"}]}]""");
        assertFalse(r1.contains("expenses"), r1);
        assertEquals("Car wash", saved().path("expenses").get(0).path("description").asText());
        // Importing bookings can add sources; "Admin panel" holders can import.
        String panel = token("panel@nct.test", UserPermission.VIEW_ADMIN_PANEL);
        String r2 = patch(panel, """
            [{"op":"set","key":"sources","value":[{"id":"s9","name":"Imported source","paymentType":"Prepaid"}]}]""");
        assertFalse(r2.contains("sources"), r2);
        assertEquals("Imported source", saved().path("sources").get(0).path("name").asText());
    }

    @Test
    void staffNotYetOnTheListCanAddOnlyTheirOwnProfile() throws Exception {
        String newcomer = token("newcomer@nct.test", UserPermission.VIEW_RESERVATIONS);
        patch(newcomer, """
            [{"op":"set","key":"users","value":[
              {"id":"u1","email":"agent@nct.test","fullName":"Sara"},
              {"id":"u2","email":"other@nct.test","fullName":"Omar"},
              {"id":"u9","email":"newcomer@nct.test","fullName":"Lina","permissions":["ACTION_ADMIN_MANAGE_USERS"],"role":"ADMIN","password":"x"},
              {"id":"u10","email":"stranger@nct.test","fullName":"Not allowed"}]}]""");
        JsonNode u = saved().path("users");
        assertEquals(3, u.size(), "only the person's own profile is added");
        JsonNode lina = u.get(2);
        assertEquals("newcomer@nct.test", lina.path("email").asText());
        assertEquals("Lina", lina.path("fullName").asText());
        assertTrue(lina.path("permissions").isMissingNode(), "permissions never come from the list");
        assertTrue(lina.path("role").isMissingNode(), "role never comes from the list");
        assertTrue(lina.path("password").isMissingNode());
    }

    @Test
    void theOlderWholeSaveFollowsTheSameRules() throws Exception {
        String agent = token("agent@nct.test", UserPermission.VIEW_RESERVATIONS);
        mvc.perform(post("/api/state").header("Authorization", agent).contentType(MediaType.APPLICATION_JSON)
                .content("{\"franchisePayments\":[],\"messages\":[{\"id\":\"m1\"}]}"))
            .andExpect(status().isOk());
        JsonNode s = saved();
        assertEquals(1, s.path("franchisePayments").size());
        assertEquals("m1", s.path("messages").get(0).path("id").asText());
    }

    @Test
    void passwordsNeverLeaveOrEnterTheSharedData() throws Exception {
        state.mergeState("{\"users\":[{\"id\":\"u1\",\"email\":\"agent@nct.test\",\"password\":\"old-plain\"}]}");
        String agent = token("agent@nct.test", UserPermission.VIEW_RESERVATIONS);
        String body = mvc.perform(get("/api/state").header("Authorization", agent)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertFalse(body.contains("old-plain"), "not sent to the app");
        String admin = token("admin@nct.test", UserPermission.ACTION_ADMIN_MANAGE_USERS);
        patch(admin, "[{\"op\":\"set\",\"key\":\"users\",\"value\":[{\"id\":\"u1\",\"email\":\"agent@nct.test\",\"password\":\"new-plain\"}]}]");
        assertFalse(state.getFullState().contains("new-plain"), "not stored");
    }

    @Test
    void deletingAWholeMonthNeedsThePermission() throws Exception {
        StringBuilder add = new StringBuilder("[");
        for (int i = 1; i <= 5; i++) add.append(i > 1 ? "," : "").append("{\"op\":\"upsertReservation\",\"year\":\"2026\",\"month\":\"November\",\"reservation\":{\"id\":\"d").append(i).append("\"}}");
        String admin = token("admin@nct.test", UserPermission.ACTION_ADMIN_MANAGE_USERS);
        patch(admin, add.append("]").toString());
        StringBuilder del = new StringBuilder("{\"allowBulkDelete\":true,\"ops\":[");
        for (int i = 1; i <= 5; i++) del.append(i > 1 ? "," : "").append("{\"op\":\"deleteReservation\",\"id\":\"d").append(i).append("\"}");
        String body = del.append("]}").toString();
        String agent = token("agent@nct.test", UserPermission.VIEW_RESERVATIONS);
        mvc.perform(post("/api/state/patch").header("Authorization", agent).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        assertEquals(5, saved().path("reservations").path("2026").path("November").size(), "refused without the permission");
        String boss = token("boss@nct.test", UserPermission.ACTION_ADMIN_DELETE_ALL_RESERVATIONS);
        mvc.perform(post("/api/state/patch").header("Authorization", boss).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        assertEquals(0, saved().path("reservations").path("2026").path("November").size(), "done with the permission");
    }
}
