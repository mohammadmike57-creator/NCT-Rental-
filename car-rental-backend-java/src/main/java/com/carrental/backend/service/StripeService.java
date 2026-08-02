package com.carrental.backend.service;

import com.stripe.Stripe;
import com.stripe.exception.StripeException;
import com.stripe.model.checkout.Session;
import com.stripe.param.checkout.SessionCreateParams;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class StripeService {

    private static final Logger logger = LoggerFactory.getLogger(StripeService.class);

    @Value("${stripe.secret.key}")
    private String stripeSecretKey;

    @PostConstruct
    public void init() {
        Stripe.apiKey = stripeSecretKey;
        logger.info("StripeService initialized");
    }

    public String createPaymentLink(long amountCents, String description) {
        try {
            logger.info("Creating checkout session for amount {} cents", amountCents);
            SessionCreateParams params = SessionCreateParams.builder()
                    .setMode(SessionCreateParams.Mode.PAYMENT)
                    .setSuccessUrl("https://nct-rental.vercel.app")
                    .setCancelUrl("https://www.nctrental.com/cancel")
                    .addLineItem(
                            SessionCreateParams.LineItem.builder()
                                    .setPriceData(
                                            SessionCreateParams.LineItem.PriceData.builder()
                                                    .setCurrency("usd")
                                                    .setUnitAmount(amountCents)
                                                    .setProductData(
                                                            SessionCreateParams.LineItem.PriceData.ProductData.builder()
                                                                    .setName(description != null ? description : "Franchise Fee")
                                                                    .build()
                                                    )
                                                    .build()
                                    )
                                    .setQuantity(1L)
                                    .build()
                    )
                    .build();

            Session session = Session.create(params);
            logger.info("Checkout session created: {}", session.getUrl());
            return session.getUrl();
        } catch (StripeException e) {
            logger.error("Stripe API error: {}", e.getMessage(), e);
            throw new RuntimeException("Stripe error: " + e.getMessage());
        } catch (Exception e) {
            logger.error("Unexpected error creating checkout session", e);
            throw new RuntimeException("Failed to create payment link: " + e.getMessage());
        }
    }
}
