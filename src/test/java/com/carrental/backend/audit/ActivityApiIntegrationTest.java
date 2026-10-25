package com.carrental.backend.audit;

import com.carrental.backend.model.User;
import com.carrental.backend.model.UserPermission;
import com.carrental.backend.model.UserStatus;
import com.carrental.backend.repository.UserRepository;
import com.carrental.backend.security.JwtUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
    "jwt.secret=test-secret-key-that-is-long-enough-for-hmac-sha256",
    "spring.datasource.url=jdbc:h2:mem:activity-it;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class ActivityApiIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired StaffActivityRepository repo;
    @Autowired PasswordEncoder encoder;
    @Autowired JwtUtil jwt;
    String manager;
    String agent;

    @BeforeEach
    void seed() {
        repo.deleteAll();
        users.deleteAll();
        users.save(user("manager@nct.test", "Rania Manager", List.of(UserPermission.VIEW_SYSTEM_ACTIVITY_LOG)));
        users.save(user("agent@nct.test", "Omar Agent", List.of(UserPermission.VIEW_RESERVATIONS)));
        manager = "Bearer " + jwt.generateToken("manager@nct.test");
        agent = "Bearer " + jwt.generateToken("agent@nct.test");
    }

    private User user(String email, String name, List<UserPermission> perms) {
        User u = new User();
        u.setEmail(email); u.setFullName(name); u.setUsername(email.split("@")[0]);
        u.setPassword(encoder.encode("Pass-12345")); u.setStatus(UserStatus.ACTIVE); u.setWebAppAccess(true);
        u.setPermissions(perms);
        return u;
    }

    @Test
    void batchRecordsEveryTouchAndHeartbeatKeepsLastSeen() throws Exception {
        users.save(user("admin@nct.test", "Lina Admin", List.of(UserPermission.VIEW_SYSTEM_ACTIVITY_LOG, UserPermission.ACTION_ADMIN_MANAGE_USERS)));
        String admin = "Bearer " + jwt.generateToken("admin@nct.test");

        mvc.perform(post("/api/activity/batch").header("Authorization", agent).contentType(MediaType.APPLICATION_JSON)
                .content("[{\"action\":\"UI_VIEW\",\"category\":\"screen\",\"summary\":\"Opened screen Reservations\"},"
                    + "{\"action\":\"UI_CLICK\",\"category\":\"screen\",\"summary\":\"Pressed New reservation\"}]"))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.recorded").value(2));
        mvc.perform(get("/api/activity").header("Authorization", manager).param("category", "screen"))
            .andExpect(jsonPath("$", hasSize(2)))
            .andExpect(jsonPath("$[*].userEmail", everyItem(is("agent@nct.test"))));

        // Recording activity counts as being seen; the agent shows online with a last-seen time.
        mvc.perform(get("/api/admin/users").header("Authorization", admin))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.email == 'agent@nct.test')].isOnline").value(true))
            .andExpect(jsonPath("$[?(@.email == 'agent@nct.test')].lastSeen").isNotEmpty())
            .andExpect(jsonPath("$[?(@.email == 'manager@nct.test')].isOnline").value(false));

        mvc.perform(post("/api/account/heartbeat").header("Authorization", manager).contentType(MediaType.APPLICATION_JSON).content("{\"deviceType\":\"mobile\"}"))
            .andExpect(status().isNoContent());
        mvc.perform(post("/api/account/signed-out").header("Authorization", agent)).andExpect(status().isNoContent());
        mvc.perform(get("/api/admin/users").header("Authorization", admin))
            .andExpect(jsonPath("$[?(@.email == 'manager@nct.test')].isOnline").value(true))
            .andExpect(jsonPath("$[?(@.email == 'manager@nct.test')].deviceType").value("mobile"))
            .andExpect(jsonPath("$[?(@.email == 'agent@nct.test')].isOnline").value(false))
            .andExpect(jsonPath("$[?(@.email == 'agent@nct.test')].lastSeen").isNotEmpty());

        mvc.perform(post("/api/account/heartbeat")).andExpect(status().isUnauthorized());
    }

    @Test
    void recordsActionsWithServerSideIdentityAndShowsThemPerUser() throws Exception {
        // Sign-in is recorded by the server.
        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"agent@nct.test\",\"password\":\"Pass-12345\"}"))
            .andExpect(status().isOk());
        // The client cannot choose who it was: userEmail in the body is ignored.
        mvc.perform(post("/api/activity").header("Authorization", agent).contentType(MediaType.APPLICATION_JSON)
                .content("{\"action\":\"CHECK_OUT\",\"category\":\"agreement\",\"summary\":\"Checked out Toyota Camry to Sara\",\"bookingId\":\"BK-1\",\"userEmail\":\"manager@nct.test\"}"))
            .andExpect(status().isAccepted());

        mvc.perform(get("/api/activity").header("Authorization", manager).param("user", "agent@nct.test"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(2)))
            .andExpect(jsonPath("$[0].action").value("CHECK_OUT"))
            .andExpect(jsonPath("$[0].userEmail").value("agent@nct.test"))
            .andExpect(jsonPath("$[0].userName").value("Omar Agent"))
            .andExpect(jsonPath("$[1].action").value("LOGIN"));

        mvc.perform(get("/api/activity").header("Authorization", manager).param("bookingId", "BK-1"))
            .andExpect(jsonPath("$", hasSize(1)));

        mvc.perform(get("/api/activity/users").header("Authorization", manager))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].userEmail").value("agent@nct.test"))
            .andExpect(jsonPath("$[0].events").value(2))
            .andExpect(jsonPath("$[0].byCategory.agreement").value(1));
    }

    @Test
    void failedLoginIsRecordedAndViewingNeedsPermission() throws Exception {
        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"agent@nct.test\",\"password\":\"wrong\"}"))
            .andExpect(status().isBadRequest());
        mvc.perform(get("/api/activity").header("Authorization", agent)).andExpect(status().isForbidden());
        mvc.perform(get("/api/activity/mine").header("Authorization", agent))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].action").value("LOGIN_FAILED"));
        mvc.perform(post("/api/activity").contentType(MediaType.APPLICATION_JSON).content("{\"action\":\"X\"}"))
            .andExpect(status().isUnauthorized());
    }
}
