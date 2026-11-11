package com.carrental.backend.monitoring;

import com.carrental.backend.audit.StaffActivity;
import com.carrental.backend.audit.StaffActivityRepository;
import com.carrental.backend.model.User;
import com.carrental.backend.model.UserPermission;
import com.carrental.backend.model.UserStatus;
import com.carrental.backend.repository.UserRepository;
import com.carrental.backend.security.JwtUtil;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

@SpringBootTest(properties = {
    "jwt.secret=test-secret-key-that-is-long-enough-for-hmac-sha256",
    "spring.datasource.url=jdbc:h2:mem:monitoring-it;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@Import(MonitoringIntegrationTest.Broken.class)
class MonitoringIntegrationTest {

    /** Endpoints that fail on purpose. */
    @TestConfiguration
    @RestController
    static class Broken {
        @GetMapping("/api/test-broken") String broken() { throw new IllegalStateException("database row missing"); }
        @GetMapping("/api/test-denied") String denied() { throw new AccessDeniedException("no"); }
        @PostMapping("/api/test-json") String json(@RequestBody Map<String, Object> body) { return "ok"; }
    }

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JwtUtil jwt;
    @Autowired StaffActivityRepository activity;

    String token(String email) {
        User u = users.findByEmail(email).orElseGet(User::new);
        u.setEmail(email); u.setFullName(email); u.setUsername(email.split("@")[0]); u.setPassword("x");
        u.setStatus(UserStatus.ACTIVE); u.setWebAppAccess(true); u.setPermissions(List.of(UserPermission.VIEW_RESERVATIONS));
        users.save(u);
        return "Bearer " + jwt.generateToken(email);
    }

    List<StaffActivity> system() {
        return activity.findAll().stream().filter(a -> "system".equals(a.getCategory())).toList();
    }

    @Test
    void healthSaysOkWhileTheDatabaseAnswers() throws Exception {
        var res = mvc.perform(get("/health")).andReturn().getResponse();
        assertEquals(200, res.getStatus());
        assertEquals("OK", res.getContentAsString());
    }

    @Test
    void anUnexpectedErrorGivesAReferenceAndIsRecorded() throws Exception {
        var res = mvc.perform(get("/api/test-broken").header("Authorization", token("err@nct.test"))).andReturn().getResponse();
        assertEquals(500, res.getStatus());
        String body = res.getContentAsString();
        assertTrue(body.matches(".*Reference: ERR-[0-9A-Z]{6}.*"), body);
        assertFalse(body.contains("database row missing"), "no technical details to the person");
        assertFalse(body.contains("at com."), "no stack trace to the person");
        String ref = body.replaceAll(".*\"reference\":\"(ERR-[0-9A-Z]{6})\".*", "$1");
        StaffActivity a = system().stream().filter(s -> s.getSummary().startsWith(ref)).findFirst().orElseThrow();
        assertEquals("SERVER_ERROR", a.getAction());
        assertEquals("err@nct.test", a.getUserEmail());
        assertTrue(a.getSummary().contains("database row missing"), "the details are kept for the administrator");
    }

    @Test
    void expectedAnswersAreUnchanged() throws Exception {
        String t = token("err2@nct.test");
        assertEquals(403, mvc.perform(get("/api/test-denied").header("Authorization", t)).andReturn().getResponse().getStatus(), "no permission stays 403");
        assertEquals(400, mvc.perform(post("/api/test-json").header("Authorization", t).contentType(MediaType.APPLICATION_JSON).content("{not json"))
                .andReturn().getResponse().getStatus(), "bad input stays 400");
        assertEquals(401, mvc.perform(get("/api/test-broken")).andReturn().getResponse().getStatus(), "not signed in stays 401");
    }

    @Test
    void aScreenThatCrashesIsReportedWithAReference() throws Exception {
        var res = mvc.perform(post("/api/client-errors").header("Authorization", token("screen@nct.test")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"Cannot read properties of undefined\",\"stack\":\"at x\",\"screen\":\"Reservations\",\"url\":\"/\",\"userAgent\":\"test\"}"))
                .andReturn().getResponse();
        assertEquals(200, res.getStatus());
        String ref = res.getContentAsString().replaceAll(".*(ERR-[0-9A-Z]{6}).*", "$1");
        StaffActivity a = system().stream().filter(s -> s.getSummary().startsWith(ref)).findFirst().orElseThrow();
        assertEquals("SCREEN_ERROR", a.getAction());
        assertTrue(a.getSummary().contains("Reservations"));
    }

    @Test
    void crashReportsNeedASignInAndAreLimited() throws Exception {
        String body = "{\"message\":\"x\",\"screen\":\"Home\"}";
        assertEquals(401, mvc.perform(post("/api/client-errors").contentType(MediaType.APPLICATION_JSON).content(body)).andReturn().getResponse().getStatus());
        String t = token("noisy@nct.test");
        int last = 0;
        for (int i = 0; i <= ClientErrorController.LIMIT_PER_HOUR; i++) {
            last = mvc.perform(post("/api/client-errors").header("Authorization", t).contentType(MediaType.APPLICATION_JSON).content(body)).andReturn().getResponse().getStatus();
        }
        assertEquals(429, last, "the 21st report in an hour is refused");
    }

    @Test
    void aBrowserCannotWriteSystemErrorsItself() throws Exception {
        mvc.perform(post("/api/activity").header("Authorization", token("fake@nct.test")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"action\":\"SERVER_ERROR\",\"category\":\"system\",\"summary\":\"ERR-FAKE01 · planted\"}")).andReturn();
        assertTrue(system().stream().noneMatch(s -> s.getSummary().contains("planted")));
        assertTrue(activity.findAll().stream().anyMatch(s -> s.getSummary().contains("planted") && "other".equals(s.getCategory())));
    }
}
