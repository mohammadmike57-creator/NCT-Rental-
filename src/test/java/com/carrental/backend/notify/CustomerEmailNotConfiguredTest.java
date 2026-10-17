package com.carrental.backend.notify;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties = {
    "jwt.secret=test-secret-key-that-is-long-enough-for-hmac-sha256",
    "spring.datasource.url=jdbc:h2:mem:email-off;DB_CLOSE_DELAY=-1",
    "mail.smtp.enabled=false"
})
class CustomerEmailNotConfiguredTest {
    @Autowired CustomerEmailService service;

    @Test
    void reportsNotConfiguredInsteadOfPretendingToSend() {
        assertFalse(service.isConfigured());
        CustomerEmailService.EmailException e = assertThrows(CustomerEmailService.EmailException.class, () ->
            service.send(new CustomerEmailRequest("a@b.co", "Subject", "H", "I", List.of(), null, null, null, null, null, null, null, null, null, null, null)));
        assertEquals(503, e.status());
    }
}
