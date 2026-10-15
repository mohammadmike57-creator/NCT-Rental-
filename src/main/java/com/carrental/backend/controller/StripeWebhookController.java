package com.carrental.backend.controller;

import com.carrental.backend.service.StripeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/webhooks")
public class StripeWebhookController {

    private static final Logger logger = LoggerFactory.getLogger(StripeWebhookController.class);

    @Autowired
    private StripeService stripeService;

    /**
     * Stripe webhook endpoint
     * Register this URL in Stripe Dashboard: https://dashboard.stripe.com/webhooks
     * URL: https://your-domain.com/api/webhooks/stripe
     */
    @PostMapping("/stripe")
    public ResponseEntity<?> handleStripeWebhook(
            @RequestBody String payload,
            @RequestHeader("Stripe-Signature") String sigHeader
    ) {
        try {
            logger.info("Received Stripe webhook");
            stripeService.handleWebhookEvent(payload, sigHeader);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            logger.error("Error processing webhook", e);
            return ResponseEntity.status(400).body("Webhook error: " + e.getMessage());
        }
    }
}
