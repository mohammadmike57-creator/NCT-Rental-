package com.carrental.backend.staff;

import com.carrental.backend.model.User;
import com.carrental.backend.model.UserPermission;
import com.carrental.backend.model.UserStatus;
import com.carrental.backend.repository.UserRepository;
import com.carrental.backend.security.JwtUtil;
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

import java.util.List;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
    "jwt.secret=test-secret-key-that-is-long-enough-for-hmac-sha256",
    "spring.datasource.url=jdbc:h2:mem:staff-it;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class StaffAccountApiIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;
    @Autowired JwtUtil jwt;
    final ObjectMapper json = new ObjectMapper();

    String adminToken;

    @BeforeEach
    void seed() {
        users.deleteAll();
        User admin = new User();
        admin.setEmail("admin@nct.test");
        admin.setFullName("Admin NCT");
        admin.setUsername("admin");
        admin.setPassword(encoder.encode("Admin-Pass-1"));
        admin.setStatus(UserStatus.ACTIVE);
        admin.setWebAppAccess(true);
        admin.setPermissions(List.of(UserPermission.ACTION_ADMIN_MANAGE_USERS, UserPermission.VIEW_ADMIN_PANEL));
        users.save(admin);
        adminToken = "Bearer " + jwt.generateToken("admin@nct.test");
    }

    String createAgent(String perms) throws Exception {
        String body = """
            {"email":"Agent@NCT.test","fullName":"Sara Agent","password":"Agent-Pass-1","position":"Reservations agent",
             "permissions":[%s]}""".formatted(perms);
        String res = mvc.perform(post("/api/admin/users").header("Authorization", adminToken).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isCreated())
            .andExpect(content().string(not(containsString("password\""))))
            .andReturn().getResponse().getContentAsString();
        return json.readTree(res).get("id").asText();
    }

    @Test
    void adminCreatesAccountThatCanLogIn() throws Exception {
        String id = createAgent("\"VIEW_RESERVATIONS\",\"ACTION_VOUCHER_MANAGE\",\"NOT_A_PERMISSION\"");
        User saved = users.findById(id).orElseThrow();
        assertEquals("agent@nct.test", saved.getEmail());
        assertEquals("agent", saved.getUsername());
        assertNotEquals("Agent-Pass-1", saved.getPassword());
        assertEquals(List.of(UserPermission.VIEW_RESERVATIONS, UserPermission.ACTION_VOUCHER_MANAGE), saved.getPermissions());

        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"agent@nct.test\",\"password\":\"Agent-Pass-1\"}"))
            .andExpect(status().isOk())
            .andExpect(content().string(containsString("\"token\"")))
            .andExpect(content().string(not(containsString("$2a$"))));
        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"AGENT\",\"password\":\"Agent-Pass-1\"}"))
            .andExpect(status().isOk());
        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"agent\",\"password\":\"wrong-pass-1\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void validatesInput() throws Exception {
        mvc.perform(post("/api/admin/users").header("Authorization", adminToken).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"x@y.z\",\"fullName\":\"X\",\"password\":\"short\"}"))
            .andExpect(status().isBadRequest()).andExpect(content().string(containsString("at least 8")));
        createAgent("");
        mvc.perform(post("/api/admin/users").header("Authorization", adminToken).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"agent@nct.test\",\"fullName\":\"Dup\",\"password\":\"Agent-Pass-2\"}"))
            .andExpect(status().isConflict());
    }

    @Test
    void nonAdminsAreRefused() throws Exception {
        createAgent("\"VIEW_RESERVATIONS\"");
        String agentToken = "Bearer " + jwt.generateToken("agent@nct.test");
        mvc.perform(get("/api/admin/users").header("Authorization", agentToken)).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/users")).andExpect(status().isUnauthorized());
    }

    @Test
    void permissionChangesShowUpInMeAndDisablingBlocksAccess() throws Exception {
        String id = createAgent("\"VIEW_RESERVATIONS\"");
        String agentToken = "Bearer " + jwt.generateToken("agent@nct.test");
        mvc.perform(put("/api/admin/users/" + id).header("Authorization", adminToken).contentType(MediaType.APPLICATION_JSON)
                .content("{\"permissions\":[\"VIEW_RESERVATIONS\",\"VIEW_REPORTS_YEARLY_SUMMARY\"]}"))
            .andExpect(status().isOk());
        JsonNode me = json.readTree(mvc.perform(get("/api/account/me").header("Authorization", agentToken))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertTrue(me.get("permissions").toString().contains("VIEW_REPORTS_YEARLY_SUMMARY"));

        mvc.perform(put("/api/admin/users/" + id).header("Authorization", adminToken).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"INACTIVE\"}")).andExpect(status().isOk());
        mvc.perform(get("/api/account/me").header("Authorization", agentToken)).andExpect(status().isUnauthorized());
        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"agent@nct.test\",\"password\":\"Agent-Pass-1\"}"))
            .andExpect(status().isForbidden());
    }

    @Test
    void resetPasswordAndAdminSafeguards() throws Exception {
        String id = createAgent("");
        mvc.perform(post("/api/admin/users/" + id + "/password").header("Authorization", adminToken).contentType(MediaType.APPLICATION_JSON)
                .content("{\"password\":\"New-Pass-99\"}")).andExpect(status().isOk());
        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"agent@nct.test\",\"password\":\"New-Pass-99\"}"))
            .andExpect(status().isOk());

        String adminId = users.findByEmail("admin@nct.test").orElseThrow().getId();
        mvc.perform(put("/api/admin/users/" + adminId).header("Authorization", adminToken).contentType(MediaType.APPLICATION_JSON)
                .content("{\"permissions\":[\"VIEW_ADMIN_PANEL\"]}"))
            .andExpect(status().isBadRequest());
        mvc.perform(delete("/api/admin/users/" + adminId).header("Authorization", adminToken)).andExpect(status().isBadRequest());
        mvc.perform(delete("/api/admin/users/" + id).header("Authorization", adminToken)).andExpect(status().isNoContent());
        assertFalse(users.findById(id).isPresent());
    }
}
