package com.carrental.backend.controller;

import com.carrental.backend.model.NotificationLog;
import com.carrental.backend.model.NotificationTemplate;
import com.carrental.backend.model.Reservation;
import com.carrental.backend.repository.NotificationLogRepository;
import com.carrental.backend.repository.NotificationTemplateRepository;
import com.carrental.backend.repository.ReservationRepository;
import com.carrental.backend.service.ProfessionalEmailService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.*;

/**
 * Professional Email Controller
 *
 * REST API endpoints for email management:
 * - Send individual and bulk emails
 * - Manage email templates
 * - Monitor email queue
 * - View email history and analytics
 * - Retry failed emails
 */
@RestController
@RequestMapping("/api/email")
@CrossOrigin(origins = "*")
public class ProfessionalEmailController {

    private static final Logger logger = LoggerFactory.getLogger(ProfessionalEmailController.class);

    @Autowired
    private ProfessionalEmailService emailService;

    @Autowired
    private NotificationTemplateRepository templateRepository;

    @Autowired
    private NotificationLogRepository logRepository;

    @Autowired
    private ReservationRepository reservationRepository;

    /**
     * Send Individual Email
     *
     * POST /api/email/send
     * Body: { "to": "user@example.com", "subject": "...", "htmlBody": "...", "priority": 5 }
     */
    @PostMapping("/send")
    @PreAuthorize("hasAuthority('ACTION_ADMIN_MANAGE_RESERVATIONS')")
    public ResponseEntity<?> sendEmail(@RequestBody Map<String, Object> request) {
        try {
            String to = (String) request.get("to");
            String subject = (String) request.get("subject");
            String htmlBody = (String) request.get("htmlBody");
            Integer priority = request.get("priority") != null ? (Integer) request.get("priority") : 5;

            if (to == null || subject == null || htmlBody == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Missing required fields"));
            }

            Map<String, String> metadata = new HashMap<>();
            if (request.containsKey("metadata")) {
                metadata = (Map<String, String>) request.get("metadata");
            }

            emailService.sendEmail(to, subject, htmlBody, null, metadata, priority);

            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Email queued successfully"
            ));

        } catch (Exception e) {
            logger.error("Error sending email: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Send Agreement Signed Email
     *
     * POST /api/email/send-agreement
     * Body: { "reservationId": "...", "agreementPdf": "base64...", "receiptPdf": "base64..." }
     */
    @PostMapping("/send-agreement")
    @PreAuthorize("hasAuthority('ACTION_ADMIN_MANAGE_RESERVATIONS')")
    public ResponseEntity<?> sendAgreementEmail(@RequestBody Map<String, Object> request) {
        try {
            String reservationId = (String) request.get("reservationId");
            String agreementPdfBase64 = (String) request.get("agreementPdf");
            String receiptPdfBase64 = (String) request.get("receiptPdf");

            if (reservationId == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Missing reservationId"));
            }

            Optional<Reservation> reservationOpt = reservationRepository.findById(reservationId);
            if (!reservationOpt.isPresent()) {
                return ResponseEntity.notFound().build();
            }

            Reservation reservation = reservationOpt.get();

            byte[] agreementPdf = null;
            byte[] receiptPdf = null;

            if (agreementPdfBase64 != null) {
                agreementPdf = Base64.getDecoder().decode(agreementPdfBase64);
            }

            if (receiptPdfBase64 != null) {
                receiptPdf = Base64.getDecoder().decode(receiptPdfBase64);
            }

            emailService.sendAgreementSignedEmail(reservation, agreementPdf, receiptPdf);

            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Agreement email queued successfully"
            ));

        } catch (Exception e) {
            logger.error("Error sending agreement email: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Send Booking Confirmation Email
     *
     * POST /api/email/send-confirmation
     * Body: { "reservationId": "..." }
     */
    @PostMapping("/send-confirmation")
    @PreAuthorize("hasAuthority('ACTION_ADMIN_MANAGE_RESERVATIONS')")
    public ResponseEntity<?> sendConfirmationEmail(@RequestBody Map<String, String> request) {
        try {
            String reservationId = request.get("reservationId");

            if (reservationId == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Missing reservationId"));
            }

            Optional<Reservation> reservationOpt = reservationRepository.findById(reservationId);
            if (!reservationOpt.isPresent()) {
                return ResponseEntity.notFound().build();
            }

            emailService.sendBookingConfirmationEmail(reservationOpt.get());

            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Confirmation email queued successfully"
            ));

        } catch (Exception e) {
            logger.error("Error sending confirmation email: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Send Payment Receipt Email
     *
     * POST /api/email/send-receipt
     * Body: { "reservationId": "...", "receiptPdf": "base64..." }
     */
    @PostMapping("/send-receipt")
    @PreAuthorize("hasAuthority('ACTION_ADMIN_MANAGE_RESERVATIONS')")
    public ResponseEntity<?> sendReceiptEmail(@RequestBody Map<String, String> request) {
        try {
            String reservationId = request.get("reservationId");
            String receiptPdfBase64 = request.get("receiptPdf");

            if (reservationId == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Missing reservationId"));
            }

            Optional<Reservation> reservationOpt = reservationRepository.findById(reservationId);
            if (!reservationOpt.isPresent()) {
                return ResponseEntity.notFound().build();
            }

            byte[] receiptPdf = null;
            if (receiptPdfBase64 != null) {
                receiptPdf = Base64.getDecoder().decode(receiptPdfBase64);
            }

            emailService.sendPaymentReceiptEmail(reservationOpt.get(), receiptPdf);

            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Receipt email queued successfully"
            ));

        } catch (Exception e) {
            logger.error("Error sending receipt email: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Send Bulk Emails
     *
     * POST /api/email/send-bulk
     * Body: { "recipients": ["email1", "email2"], "subject": "...", "htmlBody": "...", "batchSize": 50 }
     */
    @PostMapping("/send-bulk")
    @PreAuthorize("hasAuthority('ACTION_ADMIN_MANAGE_RESERVATIONS')")
    public ResponseEntity<?> sendBulkEmails(@RequestBody Map<String, Object> request) {
        try {
            List<String> recipients = (List<String>) request.get("recipients");
            String subject = (String) request.get("subject");
            String htmlBody = (String) request.get("htmlBody");
            Integer batchSize = request.get("batchSize") != null ? (Integer) request.get("batchSize") : 50;

            if (recipients == null || recipients.isEmpty() || subject == null || htmlBody == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Missing required fields"));
            }

            emailService.sendBulkEmails(recipients, subject, htmlBody, null, batchSize);

            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Bulk emails queued successfully",
                "recipientCount", recipients.size()
            ));

        } catch (Exception e) {
            logger.error("Error sending bulk emails: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Get All Email Templates
     *
     * GET /api/email/templates
     */
    @GetMapping("/templates")
    @PreAuthorize("hasAuthority('ACTION_ADMIN_MANAGE_RESERVATIONS')")
    public ResponseEntity<?> getTemplates(
            @RequestParam(defaultValue = "true") Boolean activeOnly
    ) {
        try {
            List<NotificationTemplate> templates;

            if (activeOnly) {
                templates = templateRepository.findByTypeAndIsActive(
                    NotificationTemplate.NotificationType.EMAIL, true);
            } else {
                templates = templateRepository.findByType(NotificationTemplate.NotificationType.EMAIL);
            }

            return ResponseEntity.ok(templates);

        } catch (Exception e) {
            logger.error("Error fetching templates: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Get Single Email Template
     *
     * GET /api/email/templates/{id}
     */
    @GetMapping("/templates/{id}")
    @PreAuthorize("hasAuthority('ACTION_ADMIN_MANAGE_RESERVATIONS')")
    public ResponseEntity<?> getTemplate(@PathVariable String id) {
        try {
            Optional<NotificationTemplate> template = templateRepository.findById(id);
            if (template.isPresent()) {
                return ResponseEntity.ok(template.get());
            } else {
                return ResponseEntity.notFound().build();
            }

        } catch (Exception e) {
            logger.error("Error fetching template: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Create Email Template
     *
     * POST /api/email/templates
     * Body: { "name": "...", "subject": "...", "bodyTemplate": "...", "language": "en" }
     */
    @PostMapping("/templates")
    @PreAuthorize("hasAuthority('ACTION_ADMIN_MANAGE_RESERVATIONS')")
    public ResponseEntity<?> createTemplate(@RequestBody NotificationTemplate template) {
        try {
            template.setType(NotificationTemplate.NotificationType.EMAIL);
            template.setCreatedAt(LocalDateTime.now());
            template.setUpdatedAt(LocalDateTime.now());

            NotificationTemplate saved = templateRepository.save(template);

            return ResponseEntity.status(HttpStatus.CREATED).body(saved);

        } catch (Exception e) {
            logger.error("Error creating template: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Update Email Template
     *
     * PUT /api/email/templates/{id}
     */
    @PutMapping("/templates/{id}")
    @PreAuthorize("hasAuthority('ACTION_ADMIN_MANAGE_RESERVATIONS')")
    public ResponseEntity<?> updateTemplate(
            @PathVariable String id,
            @RequestBody NotificationTemplate template
    ) {
        try {
            Optional<NotificationTemplate> existingOpt = templateRepository.findById(id);
            if (!existingOpt.isPresent()) {
                return ResponseEntity.notFound().build();
            }

            NotificationTemplate existing = existingOpt.get();
            existing.setName(template.getName());
            existing.setSubject(template.getSubject());
            existing.setBodyTemplate(template.getBodyTemplate());
            existing.setLanguage(template.getLanguage());
            existing.setActive(template.isActive());
            existing.setUpdatedAt(LocalDateTime.now());

            NotificationTemplate saved = templateRepository.save(existing);

            return ResponseEntity.ok(saved);

        } catch (Exception e) {
            logger.error("Error updating template: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Delete Email Template
     *
     * DELETE /api/email/templates/{id}
     */
    @DeleteMapping("/templates/{id}")
    @PreAuthorize("hasAuthority('ACTION_ADMIN_MANAGE_RESERVATIONS')")
    public ResponseEntity<?> deleteTemplate(@PathVariable String id) {
        try {
            if (!templateRepository.existsById(id)) {
                return ResponseEntity.notFound().build();
            }

            templateRepository.deleteById(id);

            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Template deleted successfully"
            ));

        } catch (Exception e) {
            logger.error("Error deleting template: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Get Email Queue Status
     *
     * GET /api/email/queue
     */
    @GetMapping("/queue")
    @PreAuthorize("hasAuthority('ACTION_ADMIN_MANAGE_RESERVATIONS')")
    public ResponseEntity<?> getQueueStatus() {
        try {
            Map<String, Object> status = emailService.getQueueStatus();
            return ResponseEntity.ok(status);

        } catch (Exception e) {
            logger.error("Error fetching queue status: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Get Failed Email Jobs
     *
     * GET /api/email/queue/failed
     */
    @GetMapping("/queue/failed")
    @PreAuthorize("hasAuthority('ACTION_ADMIN_MANAGE_RESERVATIONS')")
    public ResponseEntity<?> getFailedJobs() {
        try {
            List<Map<String, Object>> failed = emailService.getFailedJobs();
            return ResponseEntity.ok(failed);

        } catch (Exception e) {
            logger.error("Error fetching failed jobs: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Retry Failed Email Job
     *
     * POST /api/email/queue/retry/{jobId}
     */
    @PostMapping("/queue/retry/{jobId}")
    @PreAuthorize("hasAuthority('ACTION_ADMIN_MANAGE_RESERVATIONS')")
    public ResponseEntity<?> retryFailedJob(@PathVariable String jobId) {
        try {
            boolean success = emailService.retryFailedJob(jobId);

            if (success) {
                return ResponseEntity.ok(Map.of(
                    "success", true,
                    "message", "Job queued for retry"
                ));
            } else {
                return ResponseEntity.notFound().build();
            }

        } catch (Exception e) {
            logger.error("Error retrying job: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Clear Failed Email Jobs
     *
     * DELETE /api/email/queue/failed
     */
    @DeleteMapping("/queue/failed")
    @PreAuthorize("hasAuthority('ACTION_ADMIN_MANAGE_RESERVATIONS')")
    public ResponseEntity<?> clearFailedJobs() {
        try {
            emailService.clearFailedJobs();

            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Failed jobs cleared"
            ));

        } catch (Exception e) {
            logger.error("Error clearing failed jobs: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Get Email History
     *
     * GET /api/email/history
     */
    @GetMapping("/history")
    @PreAuthorize("hasAuthority('ACTION_ADMIN_MANAGE_RESERVATIONS')")
    public ResponseEntity<?> getEmailHistory(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime endDate
    ) {
        try {
            PageRequest pageRequest = PageRequest.of(page, size, Sort.by("sentAt").descending());

            Page<NotificationLog> logs;

            if (status != null) {
                logs = logRepository.findByTypeAndStatus(
                    NotificationLog.NotificationType.EMAIL,
                    status,
                    pageRequest
                );
            } else {
                logs = logRepository.findByType(
                    NotificationLog.NotificationType.EMAIL,
                    pageRequest
                );
            }

            return ResponseEntity.ok(Map.of(
                "logs", logs.getContent(),
                "totalPages", logs.getTotalPages(),
                "totalElements", logs.getTotalElements(),
                "currentPage", page
            ));

        } catch (Exception e) {
            logger.error("Error fetching email history: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Get Email Analytics
     *
     * GET /api/email/analytics
     */
    @GetMapping("/analytics")
    @PreAuthorize("hasAuthority('ACTION_ADMIN_MANAGE_RESERVATIONS')")
    public ResponseEntity<?> getEmailAnalytics(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime endDate
    ) {
        try {
            // Default to last 30 days if no dates provided
            if (startDate == null) {
                startDate = LocalDateTime.now().minusDays(30);
            }
            if (endDate == null) {
                endDate = LocalDateTime.now();
            }

            long totalSent = logRepository.countByTypeAndStatusAndSentAtBetween(
                NotificationLog.NotificationType.EMAIL,
                "SENT",
                startDate,
                endDate
            );

            long totalFailed = logRepository.countByTypeAndStatusAndSentAtBetween(
                NotificationLog.NotificationType.EMAIL,
                "FAILED",
                startDate,
                endDate
            );

            long totalPending = logRepository.countByTypeAndStatusAndSentAtBetween(
                NotificationLog.NotificationType.EMAIL,
                "PENDING",
                startDate,
                endDate
            );

            // Mock analytics - in production, implement proper tracking
            Map<String, Object> analytics = new HashMap<>();
            analytics.put("totalSent", totalSent);
            analytics.put("totalFailed", totalFailed);
            analytics.put("totalPending", totalPending);
            analytics.put("openRate", 65.4);
            analytics.put("clickRate", 23.8);
            analytics.put("bounceRate", 2.1);
            analytics.put("unsubscribeRate", 0.3);
            analytics.put("dateRange", Map.of(
                "start", startDate,
                "end", endDate
            ));

            return ResponseEntity.ok(analytics);

        } catch (Exception e) {
            logger.error("Error fetching email analytics: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Test Email Configuration
     *
     * POST /api/email/test
     * Body: { "to": "test@example.com" }
     */
    @PostMapping("/test")
    @PreAuthorize("hasAuthority('ACTION_ADMIN_MANAGE_RESERVATIONS')")
    public ResponseEntity<?> testEmailConfiguration(@RequestBody Map<String, String> request) {
        try {
            String to = request.get("to");

            if (to == null || to.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Missing email address"));
            }

            String subject = "NCT Rental - Test Email";
            String body = "<h1>Test Email</h1>" +
                         "<p>This is a test email from NCT Rental Email System.</p>" +
                         "<p>If you received this email, your email configuration is working correctly!</p>" +
                         "<p>Sent at: " + LocalDateTime.now() + "</p>";

            emailService.sendEmail(to, subject, body, null, Map.of("type", "test"), 10);

            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Test email sent successfully"
            ));

        } catch (Exception e) {
            logger.error("Error sending test email: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", e.getMessage()));
        }
    }
}
