package com.carrental.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Base64;
import java.util.UUID;

@Service
public class SmsService {

    private static final Logger logger = LoggerFactory.getLogger(SmsService.class);

    @Value("${sms.provider:twilio}")
    private String smsProvider;

    @Value("${sms.twilio.account-sid:}")
    private String twilioAccountSid;

    @Value("${sms.twilio.auth-token:}")
    private String twilioAuthToken;

    @Value("${sms.twilio.from-number:}")
    private String twilioFromNumber;

    @Value("${sms.enabled:false}")
    private boolean smsEnabled;

    private final HttpClient httpClient = HttpClient.newHttpClient();

    /**
     * Send SMS via Twilio
     */
    public String sendSms(String to, String message) {
        if (!smsEnabled) {
            logger.info("SMS sending disabled. Would have sent to {}: {}", to, message);
            return "DISABLED_" + UUID.randomUUID().toString();
        }

        if ("twilio".equalsIgnoreCase(smsProvider)) {
            return sendViaTwilio(to, message);
        } else {
            logger.warn("Unsupported SMS provider: {}", smsProvider);
            return null;
        }
    }

    /**
     * Send SMS using Twilio API
     */
    private String sendViaTwilio(String to, String message) {
        try {
            String url = String.format(
                    "https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json",
                    twilioAccountSid
            );

            String auth = twilioAccountSid + ":" + twilioAuthToken;
            String encodedAuth = Base64.getEncoder().encodeToString(auth.getBytes());

            String body = String.format(
                    "To=%s&From=%s&Body=%s",
                    urlEncode(to),
                    urlEncode(twilioFromNumber),
                    urlEncode(message)
            );

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Authorization", "Basic " + encodedAuth)
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();

            HttpResponse<String> response = httpClient.send(
                    request,
                    HttpResponse.BodyHandlers.ofString()
            );

            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                logger.info("SMS sent successfully to {}", to);
                // Parse response to get message SID
                return extractMessageSid(response.body());
            } else {
                logger.error("Failed to send SMS. Status: {}, Body: {}",
                        response.statusCode(), response.body());
                throw new RuntimeException("Failed to send SMS: " + response.body());
            }

        } catch (Exception e) {
            logger.error("Error sending SMS via Twilio", e);
            throw new RuntimeException("SMS sending failed: " + e.getMessage());
        }
    }

    private String urlEncode(String value) {
        return java.net.URLEncoder.encode(value, java.nio.charset.StandardCharsets.UTF_8);
    }

    private String extractMessageSid(String responseBody) {
        // Simple extraction - in production, use JSON parser
        try {
            int start = responseBody.indexOf("\"sid\":\"") + 7;
            int end = responseBody.indexOf("\"", start);
            return responseBody.substring(start, end);
        } catch (Exception e) {
            return UUID.randomUUID().toString();
        }
    }
}
