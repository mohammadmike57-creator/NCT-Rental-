package com.carrental.backend.controller;

import com.carrental.backend.model.Payment;
import com.carrental.backend.repository.PaymentRepository;
import com.carrental.backend.service.StripeService;
import com.stripe.model.checkout.Session;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
    "jwt.secret=test-secret-key-that-is-long-enough-for-hmac-sha256",
    "stripe.secret.key=sk_test_dummy",
    "stripe.price.id=price_dummy",
    "spring.datasource.url=jdbc:h2:mem:payment-pages;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class PaymentPageControllerTest {

    @Autowired MockMvc mvc;
    @Autowired PaymentRepository payments;
    @MockBean StripeService stripe;

    private Payment pending(String sessionId) {
        Payment p = new Payment();
        p.setStripeCheckoutSessionId(sessionId);
        p.setAmount(new BigDecimal("250.00"));
        p.setCurrency("usd");
        p.setDescription("Franchise fee <November>");
        p.setPaymentType(Payment.PaymentType.OTHER);
        p.setStatus(Payment.PaymentStatus.PENDING);
        return payments.save(p);
    }

    private static Session session(String id, String status) {
        Session s = new Session();
        s.setId(id);
        s.setPaymentStatus(status);
        s.setAmountTotal(25000L);
        s.setCurrency("usd");
        s.setPaymentIntent("pi_123");
        return s;
    }

    @Test
    void paidSessionShowsTheReceiptAndMarksThePaymentPaid() throws Exception {
        String id = "cs_test_paidSession0001";
        Payment p = pending(id);
        when(stripe.retrieveSession(id)).thenReturn(session(id, "paid"));
        mvc.perform(get("/payment/success").param("session_id", id))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("text/html"))
            .andExpect(content().string(containsString("Payment received")))
            .andExpect(content().string(containsString("250.00 USD")))
            .andExpect(content().string(not(containsString("Franchise fee"))))
            .andExpect(content().string(containsString(PaymentPageController.shortRef(String.valueOf(p.getId())))))
            .andExpect(content().string(not(containsString("Whitelabel"))));
        Payment after = payments.findById(p.getId()).orElseThrow();
        assertEquals(Payment.PaymentStatus.SUCCEEDED, after.getStatus());
        assertEquals("pi_123", after.getStripePaymentId());
    }

    @Test
    void unpaidSessionIsNotMarkedPaid() throws Exception {
        String id = "cs_test_unpaidSession01";
        Payment p = pending(id);
        when(stripe.retrieveSession(id)).thenReturn(session(id, "unpaid"));
        mvc.perform(get("/payment/success").param("session_id", id))
            .andExpect(status().isOk())
            .andExpect(content().string(containsString("Payment being processed")));
        assertEquals(Payment.PaymentStatus.PENDING, payments.findById(p.getId()).orElseThrow().getStatus());
    }

    @Test
    void withoutASessionOrWhenStripeFailsAPageIsStillShown() throws Exception {
        mvc.perform(get("/payment/success")).andExpect(status().isOk()).andExpect(content().string(containsString("Thank you")));
        when(stripe.retrieveSession("cs_test_brokenSession01")).thenThrow(new RuntimeException("network"));
        mvc.perform(get("/payment/success").param("session_id", "cs_test_brokenSession01"))
            .andExpect(status().isOk()).andExpect(content().string(containsString("could not show the payment details")));
    }

    @Test
    void cancelPage() throws Exception {
        mvc.perform(get("/payment/cancel")).andExpect(status().isOk()).andExpect(content().string(containsString("Payment cancelled")));
    }
}
