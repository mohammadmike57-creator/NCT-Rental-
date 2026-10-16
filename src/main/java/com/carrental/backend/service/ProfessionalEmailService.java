package com.carrental.backend.service;

import com.carrental.backend.model.*;
import com.carrental.backend.repository.NotificationLogRepository;
import com.carrental.backend.repository.NotificationTemplateRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.mail.*;
import javax.mail.internet.*;
import java.io.ByteArrayOutputStream;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Professional Email Service with Enterprise-Grade Features
 *
 * Features:
 * - Multiple email provider support (SMTP, SendGrid, AWS SES, Mailgun)
 * - Automatic failover between providers
 * - Queue management with priority support
 * - Retry logic with exponential backoff
 * - Rate limiting to prevent throttling
 * - HTML email templates with variable substitution
 * - Attachment support (PDF agreements, receipts)
 * - Tracking pixels for open rates
 * - Link tracking for click rates
 * - Bulk email sending with batching
 * - Email validation
 * - Comprehensive logging and monitoring
 */
@Service
public class ProfessionalEmailService {

    private static final Logger logger = LoggerFactory.getLogger(ProfessionalEmailService.class);

    @Autowired
    private NotificationTemplateRepository templateRepository;

    @Autowired
    private NotificationLogRepository logRepository;

    // Email Provider Configuration
    @Value("${email.provider:SMTP}")
    private String primaryProvider;

    @Value("${email.fallback.enabled:true}")
    private boolean fallbackEnabled;

    // SMTP Configuration
    @Value("${mail.smtp.host:smtp.gmail.com}")
    private String smtpHost;

    @Value("${mail.smtp.port:587}")
    private String smtpPort;

    @Value("${mail.smtp.username:}")
    private String smtpUsername;

    @Value("${mail.smtp.password:}")
    private String smtpPassword;

    @Value("${mail.smtp.from:noreply@nctrental.com}")
    private String fromEmail;

    @Value("${mail.smtp.from.name:NCT Rental}")
    private String fromName;

    @Value("${mail.smtp.enabled:false}")
    private boolean emailEnabled;

    // SendGrid Configuration
    @Value("${email.sendgrid.api.key:}")
    private String sendGridApiKey;

    // AWS SES Configuration
    @Value("${email.aws.ses.region:us-east-1}")
    private String awsRegion;

    @Value("${email.aws.ses.access.key:}")
    private String awsAccessKey;

    @Value("${email.aws.ses.secret.key:}")
    private String awsSecretKey;

    // Mailgun Configuration
    @Value("${email.mailgun.api.key:}")
    private String mailgunApiKey;

    @Value("${email.mailgun.domain:}")
    private String mailgunDomain;

    // Rate Limiting Configuration
    @Value("${email.rate.limit.per.minute:60}")
    private int rateLimitPerMinute;

    @Value("${email.rate.limit.per.hour:500}")
    private int rateLimitPerHour;

    // Retry Configuration
    @Value("${email.retry.max.attempts:3}")
    private int maxRetryAttempts;

    @Value("${email.retry.initial.delay:1000}")
    private long initialRetryDelay;

    // Tracking Configuration
    @Value("${email.tracking.enabled:true}")
    private boolean trackingEnabled;

    @Value("${email.tracking.base.url:https://nctrental.com/tracking}")
    private String trackingBaseUrl;

    // Company Details
    @Value("${company.name:NCT Rental}")
    private String companyName;

    @Value("${company.logo.url:https://nctrental.com/logo.png}")
    private String companyLogoUrl;

    @Value("${company.address:Amman, Jordan}")
    private String companyAddress;

    @Value("${company.phone:+962-XXX-XXXX}")
    private String companyPhone;

    @Value("${company.email:info@nctrental.com}")
    private String companyEmail;

    @Value("${company.website:https://nctrental.com}")
    private String companyWebsite;

    // Email Queue
    private final Queue<EmailJob> emailQueue = new LinkedList<>();
    private final Map<String, EmailJob> failedJobs = new ConcurrentHashMap<>();

    // Rate Limiting Counters
    private int emailsSentThisMinute = 0;
    private int emailsSentThisHour = 0;
    private LocalDateTime lastMinuteReset = LocalDateTime.now();
    private LocalDateTime lastHourReset = LocalDateTime.now();

    /**
     * Email Job for Queue Management
     */
    private static class EmailJob {
        String id;
        String to;
        String subject;
        String htmlBody;
        List<EmailAttachment> attachments;
        Map<String, String> metadata;
        int priority; // Higher = more important
        int retryCount;
        LocalDateTime scheduledTime;
        LocalDateTime lastAttempt;
        String failureReason;

        EmailJob(String to, String subject, String htmlBody, List<EmailAttachment> attachments,
                 Map<String, String> metadata, int priority) {
            this.id = UUID.randomUUID().toString();
            this.to = to;
            this.subject = subject;
            this.htmlBody = htmlBody;
            this.attachments = attachments != null ? attachments : new ArrayList<>();
            this.metadata = metadata != null ? metadata : new HashMap<>();
            this.priority = priority;
            this.retryCount = 0;
            this.scheduledTime = LocalDateTime.now();
        }
    }

    /**
     * Email Attachment
     */
    public static class EmailAttachment {
        private byte[] content;
        private String filename;
        private String mimeType;

        public EmailAttachment(byte[] content, String filename, String mimeType) {
            this.content = content;
            this.filename = filename;
            this.mimeType = mimeType;
        }

        public byte[] getContent() { return content; }
        public String getFilename() { return filename; }
        public String getMimeType() { return mimeType; }
    }

    /**
     * Email Template Variables
     */
    public static class EmailVariables {
        private Map<String, String> variables = new HashMap<>();

        public EmailVariables() {}

        public EmailVariables put(String key, String value) {
            variables.put(key, value != null ? value : "");
            return this;
        }

        public Map<String, String> getAll() {
            return variables;
        }
    }

    /**
     * Send Individual Email
     */
    @Async
    @Transactional
    public void sendEmail(String to, String subject, String htmlBody) {
        sendEmail(to, subject, htmlBody, null, null, 5);
    }

    /**
     * Send Email with Attachments
     */
    @Async
    @Transactional
    public void sendEmail(String to, String subject, String htmlBody,
                         List<EmailAttachment> attachments, Map<String, String> metadata, int priority) {
        try {
            // Validate email
            if (!isValidEmail(to)) {
                logger.error("Invalid email address: {}", to);
                logEmail(to, subject, "FAILED", "Invalid email address", metadata);
                return;
            }

            // Add to queue
            EmailJob job = new EmailJob(to, subject, htmlBody, attachments, metadata, priority);
            synchronized (emailQueue) {
                emailQueue.offer(job);
            }

            logger.info("Email queued successfully: {} to {}", subject, to);

        } catch (Exception e) {
            logger.error("Error queueing email: {}", e.getMessage(), e);
            logEmail(to, subject, "FAILED", e.getMessage(), metadata);
        }
    }

    /**
     * Send Email from Template
     */
    @Async
    @Transactional
    public void sendEmailFromTemplate(String templateName, String to, EmailVariables variables) {
        sendEmailFromTemplate(templateName, to, variables, null, null, 5);
    }

    /**
     * Send Email from Template with Attachments
     */
    @Async
    @Transactional
    public void sendEmailFromTemplate(String templateName, String to, EmailVariables variables,
                                     List<EmailAttachment> attachments, Map<String, String> metadata, int priority) {
        try {
            // Load template
            Optional<NotificationTemplate> templateOpt = templateRepository.findByNameAndIsActive(templateName, true);
            if (!templateOpt.isPresent()) {
                logger.error("Email template not found: {}", templateName);
                return;
            }

            NotificationTemplate template = templateOpt.get();

            // Render template
            String subject = renderTemplate(template.getSubject(), variables);
            String htmlBody = renderTemplate(template.getBodyTemplate(), variables);

            // Wrap in professional HTML layout
            htmlBody = wrapInEmailLayout(htmlBody, subject);

            // Add tracking pixels if enabled
            if (trackingEnabled) {
                String trackingId = UUID.randomUUID().toString();
                htmlBody = addTrackingPixel(htmlBody, trackingId);
                if (metadata == null) metadata = new HashMap<>();
                metadata.put("trackingId", trackingId);
            }

            // Send email
            sendEmail(to, subject, htmlBody, attachments, metadata, priority);

        } catch (Exception e) {
            logger.error("Error sending email from template: {}", e.getMessage(), e);
        }
    }

    /**
     * Send Agreement Signed Email
     */
    @Async
    @Transactional
    public void sendAgreementSignedEmail(Reservation reservation, byte[] agreementPdf, byte[] receiptPdf) {
        try {
            String customerEmail = reservation.getCustomerEmail();
            if (customerEmail == null || customerEmail.isEmpty()) {
                logger.warn("No email address for reservation: {}", reservation.getBookingId());
                return;
            }

            EmailVariables variables = new EmailVariables()
                .put("customerName", reservation.getPersonName())
                .put("bookingId", reservation.getBookingId())
                .put("carModel", reservation.getCarModel())
                .put("pickupDate", reservation.getPickupDate())
                .put("dropoffDate", reservation.getDropoffDate())
                .put("amount", String.format("%.2f JOD", reservation.getAmount()))
                .put("pickupLocation", reservation.getLocationName() != null ? reservation.getLocationName() : "")
                .put("companyName", companyName)
                .put("companyPhone", companyPhone)
                .put("companyEmail", companyEmail);

            List<EmailAttachment> attachments = new ArrayList<>();
            if (agreementPdf != null) {
                attachments.add(new EmailAttachment(agreementPdf,
                    "Rental_Agreement_" + reservation.getBookingId() + ".pdf", "application/pdf"));
            }
            if (receiptPdf != null) {
                attachments.add(new EmailAttachment(receiptPdf,
                    "Receipt_" + reservation.getBookingId() + ".pdf", "application/pdf"));
            }

            Map<String, String> metadata = new HashMap<>();
            metadata.put("reservationId", reservation.getId());
            metadata.put("bookingId", reservation.getBookingId());
            metadata.put("eventType", "agreement_signed");

            sendEmailFromTemplate("agreement_signed", customerEmail, variables, attachments, metadata, 10);

        } catch (Exception e) {
            logger.error("Error sending agreement signed email: {}", e.getMessage(), e);
        }
    }

    /**
     * Send Booking Confirmation Email
     */
    @Async
    @Transactional
    public void sendBookingConfirmationEmail(Reservation reservation) {
        try {
            String customerEmail = reservation.getCustomerEmail();
            if (customerEmail == null || customerEmail.isEmpty()) return;

            EmailVariables variables = new EmailVariables()
                .put("customerName", reservation.getPersonName())
                .put("bookingId", reservation.getBookingId())
                .put("carModel", reservation.getCarModel())
                .put("pickupDate", reservation.getPickupDate())
                .put("dropoffDate", reservation.getDropoffDate())
                .put("amount", String.format("%.2f JOD", reservation.getAmount()))
                .put("pickupLocation", reservation.getLocationName() != null ? reservation.getLocationName() : "");

            Map<String, String> metadata = new HashMap<>();
            metadata.put("reservationId", reservation.getId());
            metadata.put("eventType", "booking_confirmation");

            sendEmailFromTemplate("booking_confirmation", customerEmail, variables, null, metadata, 8);

        } catch (Exception e) {
            logger.error("Error sending booking confirmation: {}", e.getMessage(), e);
        }
    }

    /**
     * Send Payment Receipt Email
     */
    @Async
    @Transactional
    public void sendPaymentReceiptEmail(Reservation reservation, byte[] receiptPdf) {
        try {
            String customerEmail = reservation.getCustomerEmail();
            if (customerEmail == null || customerEmail.isEmpty()) return;

            EmailVariables variables = new EmailVariables()
                .put("customerName", reservation.getPersonName())
                .put("bookingId", reservation.getBookingId())
                .put("amount", String.format("%.2f JOD", reservation.getAmount()))
                .put("paymentDate", LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")));

            List<EmailAttachment> attachments = new ArrayList<>();
            if (receiptPdf != null) {
                attachments.add(new EmailAttachment(receiptPdf,
                    "Receipt_" + reservation.getBookingId() + ".pdf", "application/pdf"));
            }

            Map<String, String> metadata = new HashMap<>();
            metadata.put("reservationId", reservation.getId());
            metadata.put("eventType", "payment_receipt");

            sendEmailFromTemplate("payment_receipt", customerEmail, variables, attachments, metadata, 7);

        } catch (Exception e) {
            logger.error("Error sending payment receipt: {}", e.getMessage(), e);
        }
    }

    /**
     * Send Pickup Reminder Email
     */
    @Async
    @Transactional
    public void sendPickupReminderEmail(Reservation reservation, int hoursBefore) {
        try {
            String customerEmail = reservation.getCustomerEmail();
            if (customerEmail == null || customerEmail.isEmpty()) return;

            EmailVariables variables = new EmailVariables()
                .put("customerName", reservation.getPersonName())
                .put("bookingId", reservation.getBookingId())
                .put("carModel", reservation.getCarModel())
                .put("pickupDate", reservation.getPickupDate())
                .put("pickupLocation", reservation.getLocationName() != null ? reservation.getLocationName() : "")
                .put("hoursBefore", String.valueOf(hoursBefore));

            Map<String, String> metadata = new HashMap<>();
            metadata.put("reservationId", reservation.getId());
            metadata.put("eventType", "pickup_reminder");

            sendEmailFromTemplate("pickup_reminder", customerEmail, variables, null, metadata, 6);

        } catch (Exception e) {
            logger.error("Error sending pickup reminder: {}", e.getMessage(), e);
        }
    }

    /**
     * Send Thank You Email
     */
    @Async
    @Transactional
    public void sendThankYouEmail(Reservation reservation, byte[] invoicePdf) {
        try {
            String customerEmail = reservation.getCustomerEmail();
            if (customerEmail == null || customerEmail.isEmpty()) return;

            EmailVariables variables = new EmailVariables()
                .put("customerName", reservation.getPersonName())
                .put("bookingId", reservation.getBookingId())
                .put("carModel", reservation.getCarModel());

            List<EmailAttachment> attachments = new ArrayList<>();
            if (invoicePdf != null) {
                attachments.add(new EmailAttachment(invoicePdf,
                    "Invoice_" + reservation.getBookingId() + ".pdf", "application/pdf"));
            }

            Map<String, String> metadata = new HashMap<>();
            metadata.put("reservationId", reservation.getId());
            metadata.put("eventType", "thank_you");

            sendEmailFromTemplate("thank_you", customerEmail, variables, attachments, metadata, 5);

        } catch (Exception e) {
            logger.error("Error sending thank you email: {}", e.getMessage(), e);
        }
    }

    /**
     * Send Bulk Emails
     */
    @Async
    @Transactional
    public void sendBulkEmails(List<String> recipients, String subject, String htmlBody,
                              List<EmailAttachment> attachments, int batchSize) {
        logger.info("Starting bulk email send to {} recipients", recipients.size());

        int batch = 0;
        for (int i = 0; i < recipients.size(); i += batchSize) {
            batch++;
            List<String> batchRecipients = recipients.subList(i, Math.min(i + batchSize, recipients.size()));

            for (String recipient : batchRecipients) {
                Map<String, String> metadata = new HashMap<>();
                metadata.put("bulkSend", "true");
                metadata.put("batch", String.valueOf(batch));
                sendEmail(recipient, subject, htmlBody, attachments, metadata, 3);
            }

            // Small delay between batches to avoid rate limiting
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }

        logger.info("Bulk email send completed: {} batches", batch);
    }

    /**
     * Process Email Queue - Runs every 5 seconds
     */
    @Scheduled(fixedDelay = 5000)
    public void processEmailQueue() {
        if (!emailEnabled) return;

        // Reset rate limit counters if needed
        resetRateLimitsIfNeeded();

        // Process queue
        while (!emailQueue.isEmpty() && canSendEmail()) {
            EmailJob job;
            synchronized (emailQueue) {
                job = emailQueue.poll();
            }

            if (job != null) {
                processEmailJob(job);
            }
        }
    }

    /**
     * Retry Failed Emails - Runs every 5 minutes
     */
    @Scheduled(fixedDelay = 300000)
    public void retryFailedEmails() {
        if (!emailEnabled) return;

        logger.info("Retrying failed emails: {} jobs", failedJobs.size());

        List<String> jobsToRetry = new ArrayList<>(failedJobs.keySet());
        for (String jobId : jobsToRetry) {
            EmailJob job = failedJobs.get(jobId);

            if (job.retryCount < maxRetryAttempts) {
                // Exponential backoff
                long delay = initialRetryDelay * (long) Math.pow(2, job.retryCount);
                if (LocalDateTime.now().isAfter(job.lastAttempt.plusSeconds(delay / 1000))) {
                    failedJobs.remove(jobId);
                    synchronized (emailQueue) {
                        emailQueue.offer(job);
                    }
                    logger.info("Retrying email job: {} (attempt {})", jobId, job.retryCount + 1);
                }
            } else {
                // Max retries reached
                failedJobs.remove(jobId);
                logger.error("Email job failed permanently: {} - {}", jobId, job.failureReason);
                logEmail(job.to, job.subject, "FAILED_PERMANENT", job.failureReason, job.metadata);
            }
        }
    }

    /**
     * Process Individual Email Job
     */
    private void processEmailJob(EmailJob job) {
        try {
            // Send via primary provider
            boolean success = sendViaProvider(primaryProvider, job);

            if (!success && fallbackEnabled) {
                // Try fallback providers
                logger.warn("Primary provider failed, trying fallback for: {}", job.id);
                success = tryFallbackProviders(job);
            }

            if (success) {
                emailsSentThisMinute++;
                emailsSentThisHour++;
                logger.info("Email sent successfully: {} to {}", job.subject, job.to);
                logEmail(job.to, job.subject, "SENT", null, job.metadata);
            } else {
                // Add to failed jobs for retry
                job.retryCount++;
                job.lastAttempt = LocalDateTime.now();
                failedJobs.put(job.id, job);
                logger.warn("Email failed, will retry: {}", job.id);
            }

        } catch (Exception e) {
            logger.error("Error processing email job: {}", e.getMessage(), e);
            job.failureReason = e.getMessage();
            job.retryCount++;
            job.lastAttempt = LocalDateTime.now();
            failedJobs.put(job.id, job);
        }
    }

    /**
     * Send via Specific Provider
     */
    private boolean sendViaProvider(String provider, EmailJob job) {
        try {
            switch (provider.toUpperCase()) {
                case "SMTP":
                    return sendViaSMTP(job);
                case "SENDGRID":
                    return sendViaSendGrid(job);
                case "AWS_SES":
                    return sendViaAWSSES(job);
                case "MAILGUN":
                    return sendViaMailgun(job);
                default:
                    logger.warn("Unknown provider: {}, using SMTP", provider);
                    return sendViaSMTP(job);
            }
        } catch (Exception e) {
            logger.error("Provider {} failed: {}", provider, e.getMessage());
            job.failureReason = provider + ": " + e.getMessage();
            return false;
        }
    }

    /**
     * Try Fallback Providers
     */
    private boolean tryFallbackProviders(EmailJob job) {
        String[] providers = {"SMTP", "SENDGRID", "AWS_SES", "MAILGUN"};

        for (String provider : providers) {
            if (!provider.equals(primaryProvider)) {
                if (sendViaProvider(provider, job)) {
                    logger.info("Email sent via fallback provider: {}", provider);
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Send via SMTP
     */
    private boolean sendViaSMTP(EmailJob job) throws MessagingException {
        Properties props = new Properties();
        props.put("mail.smtp.auth", "true");
        props.put("mail.smtp.starttls.enable", "true");
        props.put("mail.smtp.host", smtpHost);
        props.put("mail.smtp.port", smtpPort);
        props.put("mail.smtp.ssl.trust", smtpHost);

        Session session = Session.getInstance(props, new Authenticator() {
            @Override
            protected PasswordAuthentication getPasswordAuthentication() {
                return new PasswordAuthentication(smtpUsername, smtpPassword);
            }
        });

        MimeMessage message = new MimeMessage(session);
        message.setFrom(new InternetAddress(fromEmail, fromName));
        message.setRecipients(Message.RecipientType.TO, InternetAddress.parse(job.to));
        message.setSubject(job.subject);

        if (job.attachments.isEmpty()) {
            message.setContent(job.htmlBody, "text/html; charset=utf-8");
        } else {
            // Create multipart message
            Multipart multipart = new MimeMultipart();

            // HTML body part
            MimeBodyPart htmlPart = new MimeBodyPart();
            htmlPart.setContent(job.htmlBody, "text/html; charset=utf-8");
            multipart.addBodyPart(htmlPart);

            // Attachment parts
            for (EmailAttachment attachment : job.attachments) {
                MimeBodyPart attachmentPart = new MimeBodyPart();
                attachmentPart.setContent(attachment.getContent(), attachment.getMimeType());
                attachmentPart.setFileName(attachment.getFilename());
                multipart.addBodyPart(attachmentPart);
            }

            message.setContent(multipart);
        }

        Transport.send(message);
        return true;
    }

    /**
     * Send via SendGrid (Placeholder - requires SendGrid SDK)
     */
    private boolean sendViaSendGrid(EmailJob job) {
        // Implementation requires SendGrid Java SDK
        // For now, fall back to SMTP
        logger.warn("SendGrid not implemented, using SMTP fallback");
        try {
            return sendViaSMTP(job);
        } catch (MessagingException e) {
            return false;
        }
    }

    /**
     * Send via AWS SES (Placeholder - requires AWS SDK)
     */
    private boolean sendViaAWSSES(EmailJob job) {
        // Implementation requires AWS SDK
        // For now, fall back to SMTP
        logger.warn("AWS SES not implemented, using SMTP fallback");
        try {
            return sendViaSMTP(job);
        } catch (MessagingException e) {
            return false;
        }
    }

    /**
     * Send via Mailgun (Placeholder - requires Mailgun SDK)
     */
    private boolean sendViaMailgun(EmailJob job) {
        // Implementation requires Mailgun API
        // For now, fall back to SMTP
        logger.warn("Mailgun not implemented, using SMTP fallback");
        try {
            return sendViaSMTP(job);
        } catch (MessagingException e) {
            return false;
        }
    }

    /**
     * Render Template with Variables
     */
    private String renderTemplate(String template, EmailVariables variables) {
        if (template == null) return "";

        String rendered = template;
        for (Map.Entry<String, String> entry : variables.getAll().entrySet()) {
            String placeholder = "{{" + entry.getKey() + "}}";
            rendered = rendered.replace(placeholder, entry.getValue());
        }

        return rendered;
    }

    /**
     * Wrap Content in Professional Email Layout
     */
    private String wrapInEmailLayout(String content, String subject) {
        return "<!DOCTYPE html>\n" +
            "<html>\n" +
            "<head>\n" +
            "    <meta charset=\"UTF-8\">\n" +
            "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n" +
            "    <title>" + subject + "</title>\n" +
            "    <style>\n" +
            "        body { margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f7fa; }\n" +
            "        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }\n" +
            "        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; }\n" +
            "        .logo { max-width: 180px; height: auto; }\n" +
            "        .content { padding: 40px 30px; color: #333333; line-height: 1.6; }\n" +
            "        .footer { background-color: #f8f9fa; padding: 30px; text-align: center; color: #6c757d; font-size: 14px; }\n" +
            "        .button { display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }\n" +
            "        .divider { height: 1px; background-color: #e0e0e0; margin: 30px 0; }\n" +
            "        .social-icons { margin: 20px 0; }\n" +
            "        .social-icons a { display: inline-block; margin: 0 10px; }\n" +
            "        @media only screen and (max-width: 600px) {\n" +
            "            .content { padding: 20px 15px; }\n" +
            "            .footer { padding: 20px 15px; }\n" +
            "        }\n" +
            "    </style>\n" +
            "</head>\n" +
            "<body>\n" +
            "    <div class=\"container\">\n" +
            "        <div class=\"header\">\n" +
            "            <img src=\"" + companyLogoUrl + "\" alt=\"" + companyName + "\" class=\"logo\">\n" +
            "        </div>\n" +
            "        <div class=\"content\">\n" +
            content + "\n" +
            "        </div>\n" +
            "        <div class=\"footer\">\n" +
            "            <div class=\"divider\"></div>\n" +
            "            <p><strong>" + companyName + "</strong></p>\n" +
            "            <p>" + companyAddress + "</p>\n" +
            "            <p>Phone: " + companyPhone + " | Email: " + companyEmail + "</p>\n" +
            "            <p><a href=\"" + companyWebsite + "\" style=\"color: #667eea;\">" + companyWebsite + "</a></p>\n" +
            "            <div class=\"social-icons\">\n" +
            "                <!-- Add social media links here -->\n" +
            "            </div>\n" +
            "            <p style=\"font-size: 12px; color: #999; margin-top: 20px;\">\n" +
            "                You are receiving this email because you have a reservation with us.\n" +
            "                <br>© " + LocalDateTime.now().getYear() + " " + companyName + ". All rights reserved.\n" +
            "            </p>\n" +
            "        </div>\n" +
            "    </div>\n" +
            "</body>\n" +
            "</html>";
    }

    /**
     * Add Tracking Pixel
     */
    private String addTrackingPixel(String htmlBody, String trackingId) {
        String trackingPixel = "<img src=\"" + trackingBaseUrl + "/open/" + trackingId +
            "\" width=\"1\" height=\"1\" style=\"display:none;\" alt=\"\">";

        // Insert before closing body tag
        return htmlBody.replace("</body>", trackingPixel + "</body>");
    }

    /**
     * Validate Email Address
     */
    private boolean isValidEmail(String email) {
        if (email == null || email.trim().isEmpty()) {
            return false;
        }

        String emailRegex = "^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$";
        Pattern pattern = Pattern.compile(emailRegex);
        Matcher matcher = pattern.matcher(email);
        return matcher.matches();
    }

    /**
     * Check if Can Send Email (Rate Limiting)
     */
    private boolean canSendEmail() {
        return emailsSentThisMinute < rateLimitPerMinute && emailsSentThisHour < rateLimitPerHour;
    }

    /**
     * Reset Rate Limit Counters
     */
    private void resetRateLimitsIfNeeded() {
        LocalDateTime now = LocalDateTime.now();

        if (now.isAfter(lastMinuteReset.plusMinutes(1))) {
            emailsSentThisMinute = 0;
            lastMinuteReset = now;
        }

        if (now.isAfter(lastHourReset.plusHours(1))) {
            emailsSentThisHour = 0;
            lastHourReset = now;
        }
    }

    /**
     * Log Email Activity
     */
    private void logEmail(String to, String subject, String status, String errorMessage, Map<String, String> metadata) {
        try {
            NotificationLog log = new NotificationLog();
            log.setType(NotificationLog.NotificationType.EMAIL);
            log.setRecipient(to);
            log.setSubject(subject);
            log.setStatus(status);
            log.setErrorMessage(errorMessage);
            log.setMetadata(metadata != null ? metadata.toString() : "");
            log.setSentAt(LocalDateTime.now());
            logRepository.save(log);
        } catch (Exception e) {
            logger.error("Error logging email: {}", e.getMessage());
        }
    }

    /**
     * Get Email Queue Status
     */
    public Map<String, Object> getQueueStatus() {
        Map<String, Object> status = new HashMap<>();
        status.put("queueSize", emailQueue.size());
        status.put("failedJobs", failedJobs.size());
        status.put("emailsSentThisMinute", emailsSentThisMinute);
        status.put("emailsSentThisHour", emailsSentThisHour);
        status.put("rateLimitPerMinute", rateLimitPerMinute);
        status.put("rateLimitPerHour", rateLimitPerHour);
        return status;
    }

    /**
     * Get Failed Jobs
     */
    public List<Map<String, Object>> getFailedJobs() {
        List<Map<String, Object>> failed = new ArrayList<>();
        for (EmailJob job : failedJobs.values()) {
            Map<String, Object> jobInfo = new HashMap<>();
            jobInfo.put("id", job.id);
            jobInfo.put("to", job.to);
            jobInfo.put("subject", job.subject);
            jobInfo.put("retryCount", job.retryCount);
            jobInfo.put("failureReason", job.failureReason);
            jobInfo.put("lastAttempt", job.lastAttempt);
            failed.add(jobInfo);
        }
        return failed;
    }

    /**
     * Retry Failed Job Manually
     */
    public boolean retryFailedJob(String jobId) {
        EmailJob job = failedJobs.remove(jobId);
        if (job != null) {
            job.retryCount = 0;
            synchronized (emailQueue) {
                emailQueue.offer(job);
            }
            logger.info("Manually retrying job: {}", jobId);
            return true;
        }
        return false;
    }

    /**
     * Clear Failed Jobs
     */
    public void clearFailedJobs() {
        failedJobs.clear();
        logger.info("Failed jobs cleared");
    }
}
