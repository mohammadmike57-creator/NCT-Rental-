package com.carrental.backend.notify;

import com.carrental.backend.model.User;
import com.carrental.backend.model.UserPermission;
import com.carrental.backend.model.UserStatus;
import com.carrental.backend.repository.UserRepository;
import com.carrental.backend.security.JwtUtil;
import com.icegreen.greenmail.util.GreenMail;
import com.icegreen.greenmail.util.ServerSetup;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Email settings saved in the app (no MAIL_* environment variables) are used to send. */
@SpringBootTest(properties = {
    "jwt.secret=test-secret-key-that-is-long-enough-for-hmac-sha256",
    "spring.datasource.url=jdbc:h2:mem:mail-settings;DB_CLOSE_DELAY=-1",
    "mail.smtp.enabled=false"
})
@AutoConfigureMockMvc
class MailSettingsApiIntegrationTest {

    static GreenMail smtp;

    @BeforeAll
    static void startSmtp() {
        smtp = new GreenMail(new ServerSetup(3926, "127.0.0.1", ServerSetup.PROTOCOL_SMTP));
        smtp.setUser("office@nct.test", "office@nct.test", "app-pass-1234");
        smtp.start();
    }

    @AfterAll
    static void stopSmtp() { smtp.stop(); }

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;
    @Autowired JwtUtil jwt;
    @Autowired MailSettingsRepository settingsRepo;

    String admin;
    String agent;

    @BeforeEach
    void seed() throws Exception {
        smtp.purgeEmailFromAllMailboxes();
        settingsRepo.deleteAll();
        users.deleteAll();
        users.save(user("boss@nct.test", List.of(UserPermission.ACTION_ADMIN_MANAGE_COMPANY_DETAILS)));
        users.save(user("agent@nct.test", List.of(UserPermission.VIEW_RESERVATIONS)));
        admin = "Bearer " + jwt.generateToken("boss@nct.test");
        agent = "Bearer " + jwt.generateToken("agent@nct.test");
    }

    private User user(String email, List<UserPermission> perms) {
        User u = new User();
        u.setEmail(email); u.setFullName(email); u.setUsername(email);
        u.setPassword(encoder.encode("Pass-12345")); u.setStatus(UserStatus.ACTIVE); u.setWebAppAccess(true);
        u.setPermissions(perms);
        return u;
    }

    @Test
    void adminSavesSettingsPasswordIsHiddenAndTestEmailIsDelivered() throws Exception {
        mvc.perform(get("/api/admin/mail-settings").header("Authorization", admin))
            .andExpect(status().isOk()).andExpect(jsonPath("$.configured").value(false)).andExpect(jsonPath("$.source").value("none"));

        String body = """
            {"enabled":true,"host":"127.0.0.1","port":3926,"security":"STARTTLS","username":"office@nct.test",
             "password":"app-pass-1234","fromAddress":"office@nct.test","fromName":"UR-Drive Jordan"}""";
        mvc.perform(put("/api/admin/mail-settings").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.configured").value(true))
            .andExpect(jsonPath("$.source").value("app"))
            .andExpect(jsonPath("$.passwordSet").value(true))
            .andExpect(jsonPath("$.password").doesNotExist())
            .andExpect(content().string(not(containsString("app-pass-1234"))));
        assertFalse(settingsRepo.findById(1L).orElseThrow().getPasswordEncrypted().contains("app-pass"), "stored encrypted");

        // Saving again without a password keeps the stored one.
        mvc.perform(put("/api/admin/mail-settings").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                .content(body.replace("\"password\":\"app-pass-1234\",", "")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.configured").value(true));

        mvc.perform(post("/api/admin/mail-settings/test").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                .content("{\"to\":\"owner@example.com\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.sent").value(true));
        assertTrue(smtp.waitForIncomingEmail(5000, 1));
        javax.mail.internet.MimeMessage first = smtp.getReceivedMessages()[0];
        assertEquals("owner@example.com", first.getAllRecipients()[0].toString());
        // Send-only by default: no Reply-To header and the customer is told replies are not received.
        assertNull(first.getHeader("Reply-To"));
        assertTrue(com.icegreen.greenmail.util.GreenMailUtil.getWholeMessage(first).contains("automated message"));

        // With a reply-to address set, replies are routed there and the notice is dropped.
        mvc.perform(put("/api/admin/mail-settings").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                .content(body.replace("\"fromName\"", "\"replyTo\":\"desk@nct.test\",\"fromName\"")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.replyTo").value("desk@nct.test"));
        smtp.purgeEmailFromAllMailboxes();
        mvc.perform(post("/api/admin/mail-settings/test").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                .content("{\"to\":\"owner@example.com\"}")).andExpect(status().isOk());
        assertTrue(smtp.waitForIncomingEmail(5000, 1));
        javax.mail.internet.MimeMessage second = smtp.getReceivedMessages()[0];
        assertEquals("desk@nct.test", second.getHeader("Reply-To")[0]);
        assertFalse(com.icegreen.greenmail.util.GreenMailUtil.getWholeMessage(second).contains("automated message"));
    }

    @Test
    void validationAndPermissions() throws Exception {
        mvc.perform(put("/api/admin/mail-settings").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                .content("{\"enabled\":true,\"host\":\"\",\"username\":\"x@y.z\"}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").exists());
        mvc.perform(get("/api/admin/mail-settings").header("Authorization", agent)).andExpect(status().isForbidden());
        mvc.perform(post("/api/admin/mail-settings/test").header("Authorization", agent).contentType(MediaType.APPLICATION_JSON)
                .content("{\"to\":\"a@b.co\"}")).andExpect(status().isForbidden());
    }
}
