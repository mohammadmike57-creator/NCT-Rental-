package com.carrental.backend.service;

import com.carrental.backend.model.NotificationLog;
import com.carrental.backend.model.NotificationTemplate;
import com.carrental.backend.repository.NotificationLogRepository;
import com.carrental.backend.repository.NotificationTemplateRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class NotificationService {

    private static final Logger logger = LoggerFactory.getLogger(NotificationService.class);

    @Autowired
    private NotificationLogRepository notificationLogRepository;

    @Autowired
    private NotificationTemplateRepository notificationTemplateRepository;

    @Autowired(required = false)
    private EmailService emailService;

    @Autowired(required = false)
    private SmsService smsService;

    @Value("${app.notifications.enabled:true}")
    private boolean notificationsEnabled;

    /**
     * Send notification using template
     */
    @Async
    public void sendNotification(
            String templateName,
            String recipient,
            Map<String, String> variables,
            String userId
    ) {
        if (!notificationsEnabled) {
            logger.info("Notifications disabled, skipping");
            return;
        }

        try {
            NotificationTemplate template = notificationTemplateRepository
                    .findByNameAndLanguage(templateName, "en")
                    .orElseThrow(() -> new RuntimeException("Template not found: " + templateName));

            if (!template.isActive()) {
                logger.warn("Template {} is inactive, skipping notification", templateName);
                return;
            }

            String subject = replacePlaceholders(template.getSubject(), variables);
            String body = replacePlaceholders(template.getBodyTemplate(), variables);

            NotificationLog log = new NotificationLog();
            log.setUserId(userId);
            log.setRecipient(recipient);
            log.setType(template.getType());
            log.setTemplateName(templateName);
            log.setSubject(subject);
            log.setBody(body);
            log.setStatus(NotificationLog.NotificationStatus.PENDING);

            switch (template.getType()) {
                case EMAIL:
                    sendEmail(recipient, subject, body, log);
                    break;
                case SMS:
                    sendSms(recipient, body, log);
                    break;
                case WHATSAPP:
                    sendWhatsApp(recipient, body, log);
                    break;
                default:
                    logger.warn("Unsupported notification type: {}", template.getType());
            }

        } catch (Exception e) {
            logger.error("Failed to send notification", e);
        }
    }

    /**
     * Send an email built from an inline subject/body (no stored template).
     * Placeholders such as {{name}} in the body are replaced from {@code variables}.
     */
    @Async
    public void sendNotification(String recipient, String subject, String bodyTemplate, Map<String, String> variables) {
        if (!notificationsEnabled) {
            logger.info("Notifications disabled, skipping");
            return;
        }
        try {
            NotificationLog log = new NotificationLog();
            log.setRecipient(recipient);
            log.setType(NotificationTemplate.NotificationType.EMAIL);
            log.setSubject(replacePlaceholders(subject, variables));
            log.setBody(replacePlaceholders(bodyTemplate, variables));
            log.setStatus(NotificationLog.NotificationStatus.PENDING);
            sendEmail(recipient, log.getSubject(), log.getBody(), log);
        } catch (Exception e) {
            logger.error("Failed to send notification", e);
        }
    }

    /**
     * Send email notification
     */
    private void sendEmail(String recipient, String subject, String body, NotificationLog log) {
        try {
            if (emailService != null) {
                emailService.sendEmail(recipient, subject, body);
                log.setStatus(NotificationLog.NotificationStatus.SENT);
                log.setSentAt(LocalDateTime.now());
                log.setProvider("EmailService");
            } else {
                logger.warn("Email service not configured");
                log.setStatus(NotificationLog.NotificationStatus.FAILED);
                log.setErrorMessage("Email service not configured");
                log.setFailedAt(LocalDateTime.now());
            }
        } catch (Exception e) {
            log.setStatus(NotificationLog.NotificationStatus.FAILED);
            log.setErrorMessage(e.getMessage());
            log.setFailedAt(LocalDateTime.now());
            logger.error("Failed to send email", e);
        } finally {
            notificationLogRepository.save(log);
        }
    }

    /**
     * Send SMS notification
     */
    private void sendSms(String recipient, String body, NotificationLog log) {
        try {
            if (smsService != null) {
                String messageId = smsService.sendSms(recipient, body);
                log.setStatus(NotificationLog.NotificationStatus.SENT);
                log.setSentAt(LocalDateTime.now());
                log.setProvider("SmsService");
                log.setProviderMessageId(messageId);
            } else {
                logger.warn("SMS service not configured");
                log.setStatus(NotificationLog.NotificationStatus.FAILED);
                log.setErrorMessage("SMS service not configured");
                log.setFailedAt(LocalDateTime.now());
            }
        } catch (Exception e) {
            log.setStatus(NotificationLog.NotificationStatus.FAILED);
            log.setErrorMessage(e.getMessage());
            log.setFailedAt(LocalDateTime.now());
            logger.error("Failed to send SMS", e);
        } finally {
            notificationLogRepository.save(log);
        }
    }

    /**
     * Send WhatsApp notification
     */
    private void sendWhatsApp(String recipient, String body, NotificationLog log) {
        // WhatsApp Business API integration would go here
        logger.info("WhatsApp notification not yet implemented");
        log.setStatus(NotificationLog.NotificationStatus.FAILED);
        log.setErrorMessage("WhatsApp not implemented");
        log.setFailedAt(LocalDateTime.now());
        notificationLogRepository.save(log);
    }

    /**
     * Replace template placeholders with actual values
     */
    private String replacePlaceholders(String template, Map<String, String> variables) {
        if (template == null || variables == null) {
            return template;
        }

        String result = template;
        Pattern pattern = Pattern.compile("\\{\\{(\\w+)\\}\\}");
        Matcher matcher = pattern.matcher(template);

        while (matcher.find()) {
            String placeholder = matcher.group(0);
            String variableName = matcher.group(1);
            String value = variables.getOrDefault(variableName, "");
            result = result.replace(placeholder, value);
        }

        return result;
    }

    /**
     * Send booking confirmation
     */
    @Async
    public void sendBookingConfirmation(
            String customerEmail,
            String customerName,
            String bookingId,
            String pickupDate,
            String dropoffDate,
            String vehicleModel
    ) {
        Map<String, String> variables = Map.of(
                "customerName", customerName,
                "bookingId", bookingId,
                "pickupDate", pickupDate,
                "dropoffDate", dropoffDate,
                "vehicleModel", vehicleModel
        );

        sendNotification("booking_confirmation", customerEmail, variables, null);
    }

    /**
     * Send payment reminder
     */
    @Async
    public void sendPaymentReminder(
            String customerEmail,
            String customerName,
            String bookingId,
            String amount
    ) {
        Map<String, String> variables = Map.of(
                "customerName", customerName,
                "bookingId", bookingId,
                "amount", amount
        );

        sendNotification("payment_reminder", customerEmail, variables, null);
    }

    /**
     * Send pickup reminder (1 day before)
     */
    @Async
    public void sendPickupReminder(
            String customerEmail,
            String customerName,
            String bookingId,
            String pickupDate,
            String pickupLocation
    ) {
        Map<String, String> variables = Map.of(
                "customerName", customerName,
                "bookingId", bookingId,
                "pickupDate", pickupDate,
                "pickupLocation", pickupLocation
        );

        sendNotification("pickup_reminder", customerEmail, variables, null);
    }

    /**
     * Send return reminder
     */
    @Async
    public void sendReturnReminder(
            String customerEmail,
            String customerName,
            String bookingId,
            String dropoffDate,
            String dropoffLocation
    ) {
        Map<String, String> variables = Map.of(
                "customerName", customerName,
                "bookingId", bookingId,
                "dropoffDate", dropoffDate,
                "dropoffLocation", dropoffLocation
        );

        sendNotification("return_reminder", customerEmail, variables, null);
    }
}
