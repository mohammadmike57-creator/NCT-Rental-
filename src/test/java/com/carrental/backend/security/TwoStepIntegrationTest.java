package com.carrental.backend.security;

import com.carrental.backend.model.MfaSettings;
import com.carrental.backend.model.User;
import com.carrental.backend.model.UserPermission;
import com.carrental.backend.model.UserStatus;
import com.carrental.backend.repository.MfaSettingsRepository;
import com.carrental.backend.repository.UserRepository;
import com.carrental.backend.staff.StaffAccountService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Two-step sign-in: off unless a person turns it on; with it on, the password alone never gives a login token. */
@SpringBootTest(properties = {
    "jwt.secret=test-secret-key-that-is-long-enough-for-hmac-sha256",
    "spring.datasource.url=jdbc:h2:mem:two-step-it;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class TwoStepIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired MfaSettingsRepository settings;
    @Autowired PasswordEncoder encoder;
    @Autowired JwtUtil jwt;
    @Autowired TwoStepService twoStep;
    @Autowired StaffAccountService staff;
    final ObjectMapper json = new ObjectMapper();

    static final String PASSWORD = "Pass-12345";

    @BeforeEach
    void seed() {
        settings.deleteAll();
        users.deleteAll();
        List.of("staff@nct.test", "admin@nct.test", "admin2@nct.test").forEach(twoStep::rightCode);   // forget wrong codes of other tests
        users.save(user("staff@nct.test", List.of(UserPermission.VIEW_RESERVATIONS)));
        users.save(user("admin@nct.test", List.of(UserPermission.ACTION_ADMIN_MANAGE_USERS)));
        users.save(user("admin2@nct.test", List.of(UserPermission.ACTION_ADMIN_MANAGE_USERS)));
    }

    private User user(String email, List<UserPermission> perms) {
        User u = new User();
        u.setEmail(email); u.setFullName(email); u.setUsername(email.split("@")[0]);
        u.setPassword(encoder.encode(PASSWORD)); u.setStatus(UserStatus.ACTIVE); u.setWebAppAccess(true);
        u.setPermissions(perms);
        return u;
    }

    private String bearer(String email) { return "Bearer " + jwt.generateToken(email); }

    private static long step() { return Instant.now().getEpochSecond() / 30; }

    private JsonNode body(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString());
    }

    private ResultActions login(String email) throws Exception {
        return mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}"));
    }

    private ResultActions code(String challenge, String code) throws Exception {
        return mvc.perform(post("/auth/login/code").contentType(MediaType.APPLICATION_JSON)
            .content("{\"challenge\":\"" + challenge + "\",\"code\":\"" + code + "\"}"));
    }

    private ResultActions post2(String url, String who, String content) throws Exception {
        return mvc.perform(post(url).header("Authorization", bearer(who)).contentType(MediaType.APPLICATION_JSON).content(content));
    }

    /** Turns it on for a person; returns the app secret and the backup codes. */
    private Object[] turnOn(String email) throws Exception {
        String secret = body(post2("/api/two-step/setup", email, "{}").andExpect(status().isOk())).get("secret").asText();
        post2("/api/two-step/confirm", email, "{\"code\":\"000000x\"}").andExpect(status().isBadRequest());
        JsonNode on = body(post2("/api/two-step/confirm", email, "{\"code\":\"" + TwoStepService.codeAt(secret, step()) + "\"}")
            .andExpect(status().isOk()));
        List<String> codes = new java.util.ArrayList<>();
        on.get("backupCodes").forEach(c -> codes.add(c.asText()));
        return new Object[]{secret, codes};
    }

    @Test
    void offForEveryoneUntilTheyTurnItOn() throws Exception {
        login("staff@nct.test").andExpect(status().isOk()).andExpect(jsonPath("$.token").isNotEmpty());
        mvc.perform(get("/api/two-step/status").header("Authorization", bearer("staff@nct.test")))
            .andExpect(jsonPath("$.on").value(false));
        // Starting the set-up but never confirming it changes nothing.
        post2("/api/two-step/setup", "staff@nct.test", "{}").andExpect(status().isOk())
            .andExpect(jsonPath("$.qrSvg").value(org.hamcrest.Matchers.startsWith("<svg")))
            .andExpect(jsonPath("$.otpauthUri").value(org.hamcrest.Matchers.startsWith("otpauth://totp/NCT%20Rental")));
        login("staff@nct.test").andExpect(jsonPath("$.token").isNotEmpty());
    }

    @Test
    void withItOnThePasswordAloneGivesNoLoginToken() throws Exception {
        Object[] on = turnOn("staff@nct.test");
        String secret = (String) on[0];
        @SuppressWarnings("unchecked") List<String> backup = (List<String>) on[1];
        assertEquals(10, backup.size());

        // Stored encrypted; the backup codes only as hashes.
        MfaSettings stored = settings.findByUser(users.findByEmail("staff@nct.test").orElseThrow()).orElseThrow();
        assertTrue(stored.getSecretKey().startsWith("v1:"));
        assertFalse(stored.getSecretKey().contains(secret));
        assertFalse(stored.getBackupCodes().contains(backup.get(0).replace("-", "")));

        JsonNode first = body(login("staff@nct.test").andExpect(status().isOk()));
        assertTrue(first.get("twoStepRequired").asBoolean());
        assertNull(first.get("token"), "no token before the code");
        String challenge = first.get("challenge").asText();

        code(challenge, "123456").andExpect(status().isBadRequest());
        // The code used to turn it on cannot be used again; the next one works.
        code(challenge, TwoStepService.codeAt(secret, step())).andExpect(status().isBadRequest());
        String next = TwoStepService.codeAt(secret, step() + 1);
        code(challenge, next).andExpect(status().isOk()).andExpect(jsonPath("$.token").isNotEmpty());
        // The challenge is used up, and the same code cannot sign in again.
        code(challenge, next).andExpect(status().isUnauthorized());
        String again = body(login("staff@nct.test")).get("challenge").asText();
        code(again, next).andExpect(status().isBadRequest());

        // A backup code works once (with or without the dash, any letter case).
        code(again, backup.get(0).toLowerCase()).andExpect(status().isOk());
        String third = body(login("staff@nct.test")).get("challenge").asText();
        code(third, backup.get(0)).andExpect(status().isBadRequest());
        code(third, backup.get(1).replace("-", "")).andExpect(status().isOk());
        mvc.perform(get("/api/two-step/status").header("Authorization", bearer("staff@nct.test")))
            .andExpect(jsonPath("$.on").value(true)).andExpect(jsonPath("$.backupCodesLeft").value(8));
    }

    @Test
    void guessingIsStopped() throws Exception {
        String secret = (String) turnOn("staff@nct.test")[0];
        String c = body(login("staff@nct.test")).get("challenge").asText();
        for (int i = 0; i < 5; i++) code(c, "000000").andExpect(status().isBadRequest());
        code(c, TwoStepService.codeAt(secret, step() + 1)).andExpect(status().isUnauthorized());   // 5 tries per sign-in
        for (int i = 0; i < 5; i++) {
            code(body(login("staff@nct.test")).get("challenge").asText(), "000000");
        }
        // 10 wrong codes for the account: refused for 15 minutes, even with the right code.
        code(body(login("staff@nct.test")).get("challenge").asText(), TwoStepService.codeAt(secret, step() + 1))
            .andExpect(status().isTooManyRequests());
        code("made-up", "123456").andExpect(status().isUnauthorized());
    }

    @Test
    void turningOffNeedsPasswordAndCodeOrAnAdministrator() throws Exception {
        String secret = (String) turnOn("staff@nct.test")[0];
        post2("/api/two-step/off", "staff@nct.test", "{\"password\":\"wrong\",\"code\":\"" + TwoStepService.codeAt(secret, step() + 1) + "\"}")
            .andExpect(status().isBadRequest());
        post2("/api/two-step/off", "staff@nct.test", "{\"password\":\"" + PASSWORD + "\",\"code\":\"000000\"}")
            .andExpect(status().isBadRequest());
        post2("/api/two-step/off", "staff@nct.test", "{\"password\":\"" + PASSWORD + "\",\"code\":\"" + TwoStepService.codeAt(secret, step() + 1) + "\"}")
            .andExpect(status().isOk());
        login("staff@nct.test").andExpect(jsonPath("$.token").isNotEmpty());

        turnOn("admin@nct.test");
        post2("/api/two-step/reset", "staff@nct.test", "{\"email\":\"admin@nct.test\"}").andExpect(status().isForbidden());
        post2("/api/two-step/reset", "admin2@nct.test", "{\"email\":\"ADMIN@nct.test\"}").andExpect(status().isOk());
        login("admin@nct.test").andExpect(jsonPath("$.token").isNotEmpty());
    }

    @Test
    void oldUnencryptedEntriesNeverLockAnyoneOut() throws Exception {
        MfaSettings old = new MfaSettings();
        old.setUser(users.findByEmail("staff@nct.test").orElseThrow());
        old.setMfaEnabled(true);
        old.setSecretKey("JBSWY3DPEHPK3PXP");
        settings.save(old);
        login("staff@nct.test").andExpect(jsonPath("$.token").isNotEmpty());
    }

    @Test
    void deletingAnAccountWithTwoStepOnWorks() throws Exception {
        turnOn("staff@nct.test");
        staff.delete(users.findByEmail("staff@nct.test").orElseThrow().getId(), "admin@nct.test");
        assertTrue(users.findByEmail("staff@nct.test").isEmpty());
        assertEquals(0, settings.count());
    }
}
