package com.carrental.backend.notify;

import com.carrental.backend.model.User;
import com.carrental.backend.model.UserPermission;
import com.carrental.backend.model.UserStatus;
import com.carrental.backend.repository.UserRepository;
import com.carrental.backend.security.JwtUtil;
import com.icegreen.greenmail.util.GreenMail;
import com.icegreen.greenmail.util.GreenMailUtil;
import com.icegreen.greenmail.util.ServerSetup;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import javax.mail.internet.MimeMessage;
import javax.mail.internet.MimeMultipart;
import java.util.Base64;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
    "jwt.secret=test-secret-key-that-is-long-enough-for-hmac-sha256",
    "spring.datasource.url=jdbc:h2:mem:email-it;DB_CLOSE_DELAY=-1",
    "mail.smtp.enabled=true",
    "mail.smtp.host=127.0.0.1",
    "mail.smtp.port=3925",
    "mail.smtp.username=mailer",
    "mail.smtp.password=secret",
    "mail.smtp.from=noreply@nct.test"
})
@AutoConfigureMockMvc
class CustomerEmailApiIntegrationTest {

    static GreenMail smtp;

    @BeforeAll
    static void startSmtp() {
        smtp = new GreenMail(new ServerSetup(3925, "127.0.0.1", ServerSetup.PROTOCOL_SMTP));
        smtp.setUser("noreply@nct.test", "mailer", "secret");
        smtp.start();
    }

    @AfterAll
    static void stopSmtp() { smtp.stop(); }

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;
    @Autowired JwtUtil jwt;
    String token;

    @BeforeEach
    void seed() throws Exception {
        smtp.purgeEmailFromAllMailboxes();
        users.deleteAll();
        User u = new User();
        u.setEmail("agent@nct.test"); u.setFullName("Agent"); u.setUsername("agent");
        u.setPassword(encoder.encode("Agent-Pass-1")); u.setStatus(UserStatus.ACTIVE); u.setWebAppAccess(true);
        u.setPermissions(List.of(UserPermission.VIEW_RESERVATIONS));
        users.save(u);
        token = "Bearer " + jwt.generateToken("agent@nct.test");
    }

    @Test
    void sendsBrandedEmailWithPdfAttachment() throws Exception {
        String pdf = Base64.getEncoder().encodeToString("%PDF-1.4 fake".getBytes());
        String body = """
            {"to":"guest@example.com","subject":"Your rental agreement BK-1","heading":"Thank you, <Sara>",
             "intro":"Your agreement is attached.","rows":[["Booking","BK-1"],["Vehicle","Toyota Camry"]],
             "companyName":"UR-Drive Jordan","companyPhone":"+962","attachments":[{"fileName":"Rental-Agreement-BK-1.pdf","contentType":"application/pdf","base64":"%s"}]}
            """.formatted(pdf);
        mvc.perform(post("/api/notifications/customer-email").header("Authorization", token).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk());
        assertTrue(smtp.waitForIncomingEmail(5000, 1));
        MimeMessage m = smtp.getReceivedMessages()[0];
        assertEquals("Your rental agreement BK-1", m.getSubject());
        assertEquals("guest@example.com", m.getAllRecipients()[0].toString());
        String raw = GreenMailUtil.getWholeMessage(m);
        assertTrue(raw.contains("Rental-Agreement-BK-1.pdf"));
        assertTrue(raw.contains("&lt;Sara&gt;"), "user text is escaped in the HTML part");
        assertFalse(raw.contains("<Sara>") && raw.contains("<h1 style=\"margin:0 0 12px;font-size:20px;color:#0f172a\"><Sara>"));
        assertEquals(2, ((MimeMultipart) m.getContent()).getCount());
    }

    @Test
    void rendersStatusBadgeHighlightAndAttachmentList() throws Exception {
        String pdf = Base64.getEncoder().encodeToString("%PDF-1.4 fake".getBytes());
        String body = """
            {"to":"guest@example.com","subject":"Vehicle return BK-2","heading":"Thank you — your vehicle has been returned",
             "intro":"Attached are the final agreement and claim CLM-1.","rows":[["1. Vehicle damage","Scratch — JOD 85.000"]],
             "companyName":"UR-Drive Jordan","badge":"PAYMENT DUE","tone":"warning","highlightLabel":"Claim CLM-1 · amount due","highlightValue":"JOD 120.000",
             "attachments":[{"fileName":"Rental-Agreement-BK-2.pdf","contentType":"application/pdf","base64":"%s"},{"fileName":"Claim-CLM-1.pdf","contentType":"application/pdf","base64":"%s"}]}
            """.formatted(pdf, pdf);
        mvc.perform(post("/api/notifications/customer-email").header("Authorization", token).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk());
        assertTrue(smtp.waitForIncomingEmail(5000, 1));
        MimeMessage m = smtp.getReceivedMessages()[0];
        MimeMultipart mixed = (MimeMultipart) m.getContent();
        assertEquals(3, mixed.getCount(), "body + two PDFs");
        String html = (String) ((MimeMultipart) mixed.getBodyPart(0).getContent()).getBodyPart(1).getContent();
        assertTrue(html.contains("PAYMENT DUE"));
        assertTrue(html.contains("JOD 120.000"));
        assertTrue(html.contains("Claim-CLM-1.pdf"), "attachments are listed in the email body");
        String dump = System.getProperty("email.dump");
        if (dump != null) java.nio.file.Files.writeString(java.nio.file.Path.of(dump), html);
    }

    @Test
    void rejectsBadInputAndRequiresLogin() throws Exception {
        mvc.perform(post("/api/notifications/customer-email").header("Authorization", token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"to\":\"not-an-email\",\"subject\":\"x\"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/notifications/customer-email").header("Authorization", token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"to\":\"a@b.co\",\"subject\":\"x\",\"attachments\":[{\"fileName\":\"x.exe\",\"contentType\":\"application/x-msdownload\",\"base64\":\"AAAA\"}]}"))
            .andExpect(status().isBadRequest());
        mvc.perform(post("/api/notifications/customer-email").contentType(MediaType.APPLICATION_JSON)
                .content("{\"to\":\"a@b.co\",\"subject\":\"x\"}")).andExpect(status().isUnauthorized());
    }
}
