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

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Everyday rental work as the website saves it: bookings and agreements go to the server one by one
 * (POST /api/state/patch), so people working at the same time never overwrite each other, and a
 * screen that failed to load can never wipe data.
 */
@SpringBootTest(properties = {
    "jwt.secret=test-secret-key-that-is-long-enough-for-hmac-sha256",
    "spring.datasource.url=jdbc:h2:mem:reservation-save-it;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class ReservationSaveIntegrationTest {

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
            {"fleet":[{"id":"v1","modelName":"Kia Pegas"},{"id":"v2","modelName":"Toyota Corolla"}],
             "reservations":{"2026":{"November":[
               {"id":"r1","bookingId":"B-1","personName":"John Doe","amount":120,"status":"CONFIRMED"},
               {"id":"r2","bookingId":"B-2","personName":"Jane Roe","amount":80,"status":"CONFIRMED"}],"December":[]}}}""");
    }

    String patch(String token, String body) throws Exception {
        return mvc.perform(post("/api/state/patch").header("Authorization", token).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    static String upsert(String month, String reservation) {
        return "{\"op\":\"upsertReservation\",\"year\":\"2026\",\"month\":\"" + month + "\",\"reservation\":" + reservation + "}";
    }

    JsonNode month(String name) throws Exception {
        return json.readTree(state.getFullState()).path("reservations").path("2026").path(name);
    }

    JsonNode booking(String month, String id) throws Exception {
        for (JsonNode r : month(month)) if (id.equals(r.path("id").asText())) return r;
        return null;
    }

    @Test
    void twoPeopleSavingDifferentBookingsInTheSameMonthKeepBothChanges() throws Exception {
        String sara = token("sara@nct.test", UserPermission.VIEW_RESERVATIONS);
        String omar = token("omar@nct.test", UserPermission.VIEW_RESERVATIONS);
        patch(sara, "{\"ops\":[" + upsert("November", "{\"id\":\"r1\",\"bookingId\":\"B-1\",\"personName\":\"John Doe\",\"amount\":150,\"status\":\"CONFIRMED\"}") + "]}");
        patch(omar, "{\"ops\":[" + upsert("November", "{\"id\":\"r2\",\"bookingId\":\"B-2\",\"personName\":\"Jane Roe\",\"amount\":95,\"status\":\"CONFIRMED\"}") + "]}");
        assertEquals(2, month("November").size());
        assertEquals(150, booking("November", "r1").path("amount").asInt(), "Sara's change is kept");
        assertEquals(95, booking("November", "r2").path("amount").asInt(), "Omar's change is kept");
    }

    @Test
    void aCompletedAgreementIsStoredExactlyAndComesBackToTheWebsite() throws Exception {
        String agent = token("agent@nct.test", UserPermission.VIEW_RESERVATIONS);
        String agreement = """
            {"id":"r1","bookingId":"B-1","personName":"John Doe","amount":120,"status":"CONFIRMED",
             "voucherSubmitted":true,"pickupKmOut":12000,"pickupFuelLevel":"Full",
             "pickupChecklist":{"Spare Tire":true,"Headlights":true},
             "pickupDamageMarkers":[{"x":12.5,"y":40,"view":"left"}],
             "pickupRenterSignature":"data:image/png;base64,AAAA","pickupAgentName":"Sara",
             "dropOffCompleted":true,"dropOffKmIn":12450,"returnCharges":{"items":[{"id":"c1","kind":"fuel","amount":15}],"currency":"JOD"}}""";
        patch(agent, "{\"ops\":[" + upsert("November", agreement) + "]}");

        JsonNode stored = booking("November", "r1");
        assertEquals(json.readTree(agreement), stored, "every agreement field is stored as sent");
        assertEquals("B-2", booking("November", "r2").path("bookingId").asText(), "the other booking in the month is untouched");

        String body = mvc.perform(get("/api/state").header("Authorization", agent)).andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode back = null;
        for (JsonNode r : json.readTree(body).path("reservations").path("2026").path("November")) if ("r1".equals(r.path("id").asText())) back = r;
        assertNotNull(back, "the website gets the agreement back");
        assertEquals(12450, back.path("dropOffKmIn").asInt());
        assertEquals("data:image/png;base64,AAAA", back.path("pickupRenterSignature").asText());
    }

    @Test
    void aBookingMovedToAnotherMonthIsStoredOnce() throws Exception {
        String agent = token("agent@nct.test", UserPermission.VIEW_RESERVATIONS);
        patch(agent, "{\"ops\":[" + upsert("December", "{\"id\":\"r1\",\"bookingId\":\"B-1\",\"personName\":\"John Doe\",\"amount\":120,\"status\":\"CONFIRMED\"}") + "]}");
        assertNull(booking("November", "r1"), "no longer in November");
        assertNotNull(booking("December", "r1"), "now in December");
        int copies = 0;
        for (String m : List.of("November", "December")) for (JsonNode r : month(m)) if ("r1".equals(r.path("id").asText())) copies++;
        assertEquals(1, copies);
    }

    @Test
    void aScreenThatFailedToLoadCannotWipeData() throws Exception {
        String agent = token("agent@nct.test", UserPermission.VIEW_RESERVATIONS, UserPermission.ACTION_ADMIN_MANAGE_FLEET);
        List<String> ops = new ArrayList<>();
        for (int i = 3; i <= 6; i++) ops.add(upsert("November", "{\"id\":\"r" + i + "\",\"bookingId\":\"B-" + i + "\"}"));
        patch(agent, "{\"ops\":[" + String.join(",", ops) + "]}");
        assertEquals(6, month("November").size());

        StringBuilder deletes = new StringBuilder("{\"ops\":[");
        for (int i = 1; i <= 6; i++) deletes.append(i > 1 ? "," : "").append("{\"op\":\"deleteReservation\",\"id\":\"r").append(i).append("\"}");
        patch(agent, deletes.append("]}").toString());
        assertEquals(6, month("November").size(), "many deletions at once without the explicit flag are refused");

        patch(agent, "{\"ops\":[{\"op\":\"set\",\"key\":\"fleet\",\"value\":[]}]}");
        assertEquals(2, json.readTree(state.getFullState()).path("fleet").size(), "a list is never emptied by one save");

        patch(agent, "{\"ops\":[{\"op\":\"deleteReservation\",\"id\":\"r6\"}]}");
        assertEquals(5, month("November").size(), "a single deletion still works");
    }

    @Test
    void aBrokerBookingIsCancelledInsteadOfDeleted() throws Exception {
        String agent = token("agent@nct.test", UserPermission.VIEW_RESERVATIONS);
        patch(agent, "{\"ops\":[" + upsert("November", "{\"id\":\"rb\",\"bookingId\":\"BRK-9\",\"channelReservationNumber\":\"RSV-2026-000009\",\"status\":\"CONFIRMED\"}") + "]}");
        patch(agent, "{\"ops\":[{\"op\":\"deleteReservation\",\"id\":\"rb\"}]}");
        JsonNode kept = booking("November", "rb");
        assertNotNull(kept, "the broker booking stays on record");
        assertEquals("CANCELLED", kept.path("status").asText(), "and is cancelled, so the broker is told");
    }

    @Test
    void nothingIsSavedOrShownWithoutSigningIn() throws Exception {
        mvc.perform(post("/api/state/patch").contentType(MediaType.APPLICATION_JSON)
                .content("{\"ops\":[" + upsert("November", "{\"id\":\"rx\",\"bookingId\":\"X\"}") + "]}"))
            .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/state")).andExpect(status().isUnauthorized());
        assertNull(booking("November", "rx"));
    }
}
