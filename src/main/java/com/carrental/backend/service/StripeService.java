package com.carrental.backend.service;

import com.carrental.backend.model.Payment;
import com.carrental.backend.repository.PaymentRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.stripe.Stripe;
import com.stripe.exception.StripeException;
import com.stripe.model.*;
import com.stripe.model.checkout.Session;
import com.stripe.net.Webhook;
import com.stripe.param.checkout.SessionCreateParams;
import com.stripe.param.PaymentIntentCreateParams;
import com.stripe.param.RefundCreateParams;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Service
public class StripeService {

    private static final Logger logger = LoggerFactory.getLogger(StripeService.class);

    @Autowired
    private PaymentRepository paymentRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Value("${stripe.secret.key}")
    private String stripeSecretKey;

    @Value("${stripe.webhook.secret:}")
    private String webhookSecret;

    @Value("${app.base-url:https://www.nctrental.com}")
    private String baseUrl;

    @PostConstruct
    public void init() {
        Stripe.apiKey = stripeSecretKey;
        logger.info("StripeService initialized");
    }

    /**
     * Create payment checkout session with metadata
     */
    public Map<String, Object> createCheckoutSession(
            BigDecimal amount,
            String currency,
            String description,
            String customerEmail,
            String reservationId,
            Payment.PaymentType paymentType
    ) {
        try {
            long amountCents = amount.multiply(BigDecimal.valueOf(100)).longValue();
            logger.info("Creating checkout session for amount {} {}", amount, currency);

            Map<String, String> metadata = new HashMap<>();
            if (reservationId != null) {
                metadata.put("reservation_id", reservationId);
            }
            metadata.put("payment_type", paymentType.toString());

            SessionCreateParams.Builder paramsBuilder = SessionCreateParams.builder()
                    .setMode(SessionCreateParams.Mode.PAYMENT)
                    .setSuccessUrl(baseUrl + "/payment/success?session_id={CHECKOUT_SESSION_ID}")
                    .setCancelUrl(baseUrl + "/payment/cancel")
                    .putAllMetadata(metadata)
                    .addLineItem(
                            SessionCreateParams.LineItem.builder()
                                    .setPriceData(
                                            SessionCreateParams.LineItem.PriceData.builder()
                                                    .setCurrency(currency.toLowerCase())
                                                    .setUnitAmount(amountCents)
                                                    .setProductData(
                                                            SessionCreateParams.LineItem.PriceData.ProductData.builder()
                                                                    .setName(description != null ? description : "Car Rental Payment")
                                                                    .build()
                                                    )
                                                    .build()
                                    )
                                    .setQuantity(1L)
                                    .build()
                    );

            if (customerEmail != null && !customerEmail.isEmpty()) {
                paramsBuilder.setCustomerEmail(customerEmail);
            }

            SessionCreateParams params = paramsBuilder.build();
            Session session = Session.create(params);

            // Create payment record
            Payment payment = new Payment();
            payment.setStripeCheckoutSessionId(session.getId());
            payment.setAmount(amount);
            payment.setCurrency(currency);
            payment.setDescription(description);
            payment.setCustomerEmail(customerEmail);
            payment.setReservationId(reservationId);
            payment.setPaymentType(paymentType);
            payment.setStatus(Payment.PaymentStatus.PENDING);
            payment.setMetadata(objectMapper.writeValueAsString(metadata));
            paymentRepository.save(payment);

            logger.info("Checkout session created: {}", session.getUrl());

            Map<String, Object> response = new HashMap<>();
            response.put("sessionId", session.getId());
            response.put("url", session.getUrl());
            response.put("paymentId", payment.getId());
            return response;

        } catch (Exception e) {
            logger.error("Failed to create checkout session", e);
            throw new RuntimeException("Failed to create payment session: " + e.getMessage());
        }
    }

    /**
     * Legacy method for backward compatibility
     */
    public String createPaymentLink(long amountCents, String description) {
        BigDecimal amount = BigDecimal.valueOf(amountCents).divide(BigDecimal.valueOf(100));
        Map<String, Object> result = createCheckoutSession(
                amount,
                "usd",
                description,
                null,
                null,
                Payment.PaymentType.OTHER
        );
        return (String) result.get("url");
    }

    /**
     * Create payment intent for direct card charging
     */
    public PaymentIntent createPaymentIntent(
            BigDecimal amount,
            String currency,
            String description,
            Map<String, String> metadata
    ) throws StripeException {
        long amountCents = amount.multiply(BigDecimal.valueOf(100)).longValue();

        PaymentIntentCreateParams params = PaymentIntentCreateParams.builder()
                .setAmount(amountCents)
                .setCurrency(currency.toLowerCase())
                .setDescription(description)
                .putAllMetadata(metadata != null ? metadata : new HashMap<>())
                .build();

        return PaymentIntent.create(params);
    }

    /**
     * Process webhook event
     */
    public void handleWebhookEvent(String payload, String sigHeader) throws Exception {
        if (webhookSecret == null || webhookSecret.isEmpty()) {
            logger.warn("Webhook secret not configured, skipping signature verification");
            Event event = objectMapper.readValue(payload, Event.class);
            processEvent(event);
            return;
        }

        Event event = Webhook.constructEvent(payload, sigHeader, webhookSecret);
        processEvent(event);
    }

    /**
     * Process Stripe webhook events
     */
    private void processEvent(Event event) {
        logger.info("Processing webhook event: {}", event.getType());

        switch (event.getType()) {
            case "checkout.session.completed":
                handleCheckoutSessionCompleted(event);
                break;
            case "payment_intent.succeeded":
                handlePaymentSucceeded(event);
                break;
            case "payment_intent.payment_failed":
                handlePaymentFailed(event);
                break;
            case "charge.refunded":
                handleChargeRefunded(event);
                break;
            default:
                logger.info("Unhandled event type: {}", event.getType());
        }
    }

    private void handleCheckoutSessionCompleted(Event event) {
        try {
            Session session = (Session) event.getDataObjectDeserializer()
                    .getObject()
                    .orElseThrow(() -> new RuntimeException("Failed to deserialize session"));

            paymentRepository.findByStripeCheckoutSessionId(session.getId()).ifPresent(payment -> {
                payment.setStatus(Payment.PaymentStatus.SUCCEEDED);
                payment.setStripePaymentId(session.getPaymentIntent());
                payment.setPaidAt(LocalDateTime.now());
                paymentRepository.save(payment);
                logger.info("Payment succeeded for session: {}", session.getId());
            });
        } catch (Exception e) {
            logger.error("Error handling checkout.session.completed", e);
        }
    }

    private void handlePaymentSucceeded(Event event) {
        try {
            PaymentIntent paymentIntent = (PaymentIntent) event.getDataObjectDeserializer()
                    .getObject()
                    .orElseThrow(() -> new RuntimeException("Failed to deserialize payment intent"));

            paymentRepository.findByStripePaymentId(paymentIntent.getId()).ifPresent(payment -> {
                payment.setStatus(Payment.PaymentStatus.SUCCEEDED);
                payment.setPaidAt(LocalDateTime.now());
                paymentRepository.save(payment);
                logger.info("Payment succeeded: {}", paymentIntent.getId());
            });
        } catch (Exception e) {
            logger.error("Error handling payment_intent.succeeded", e);
        }
    }

    private void handlePaymentFailed(Event event) {
        try {
            PaymentIntent paymentIntent = (PaymentIntent) event.getDataObjectDeserializer()
                    .getObject()
                    .orElseThrow(() -> new RuntimeException("Failed to deserialize payment intent"));

            paymentRepository.findByStripePaymentId(paymentIntent.getId()).ifPresent(payment -> {
                payment.setStatus(Payment.PaymentStatus.FAILED);
                payment.setFailedAt(LocalDateTime.now());
                payment.setFailureReason(paymentIntent.getLastPaymentError() != null ?
                        paymentIntent.getLastPaymentError().getMessage() : "Unknown error");
                paymentRepository.save(payment);
                logger.info("Payment failed: {}", paymentIntent.getId());
            });
        } catch (Exception e) {
            logger.error("Error handling payment_intent.payment_failed", e);
        }
    }

    private void handleChargeRefunded(Event event) {
        try {
            Charge charge = (Charge) event.getDataObjectDeserializer()
                    .getObject()
                    .orElseThrow(() -> new RuntimeException("Failed to deserialize charge"));

            paymentRepository.findByStripePaymentId(charge.getPaymentIntent()).ifPresent(payment -> {
                long refundedAmount = charge.getAmountRefunded();
                long totalAmount = charge.getAmount();

                if (refundedAmount == totalAmount) {
                    payment.setStatus(Payment.PaymentStatus.REFUNDED);
                } else {
                    payment.setStatus(Payment.PaymentStatus.PARTIALLY_REFUNDED);
                }

                payment.setRefundAmount(BigDecimal.valueOf(refundedAmount).divide(BigDecimal.valueOf(100)));
                payment.setRefundedAt(LocalDateTime.now());
                paymentRepository.save(payment);
                logger.info("Payment refunded: {}", charge.getId());
            });
        } catch (Exception e) {
            logger.error("Error handling charge.refunded", e);
        }
    }

    /**
     * Create refund
     */
    public Refund createRefund(String paymentIntentId, BigDecimal amount, String reason) throws StripeException {
        Long amountCents = amount != null ? amount.multiply(BigDecimal.valueOf(100)).longValue() : null;

        RefundCreateParams.Builder builder = RefundCreateParams.builder()
                .setPaymentIntent(paymentIntentId);

        if (amountCents != null) {
            builder.setAmount(amountCents);
        }

        if (reason != null) {
            builder.setReason(RefundCreateParams.Reason.valueOf(reason.toUpperCase()));
        }

        return Refund.create(builder.build());
    }

    /**
     * Retrieve payment session
     */
    public Session retrieveSession(String sessionId) throws StripeException {
        return Session.retrieve(sessionId);
    }

    /**
     * Retrieve payment intent
     */
    public PaymentIntent retrievePaymentIntent(String paymentIntentId) throws StripeException {
        return PaymentIntent.retrieve(paymentIntentId);
    }
}
