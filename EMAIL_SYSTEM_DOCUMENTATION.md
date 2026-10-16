# Professional Email & Notification System Documentation

## Overview

The Professional Email & Notification System is an enterprise-grade email automation platform designed for the NCT Rental car rental management system. It provides comprehensive email management with advanced features including template management, automated triggers, queue management, campaign tracking, and detailed analytics.

## System Architecture

### Frontend Component
**Location:** `/components/ProfessionalEmailNotificationSystem.tsx`

A React/TypeScript component providing a complete UI for email management with:
- Email template visual editor and management
- Automated trigger configuration
- Real-time email queue monitoring
- Campaign management and analytics
- Email history and detailed tracking
- Responsive design with mobile support

### Backend Service
**Location:** `/src/main/java/com/carrental/backend/service/ProfessionalEmailService.java`

A Spring Boot service providing:
- Multi-provider email support (SMTP, SendGrid, AWS SES, Mailgun)
- Automatic failover between providers
- Queue management with priority support
- Retry logic with exponential backoff
- Rate limiting to prevent throttling
- HTML email templates with variable substitution
- Attachment support (PDF agreements, receipts)
- Tracking pixels for open rates
- Comprehensive logging and monitoring

### REST API Controller
**Location:** `/src/main/java/com/carrental/backend/controller/ProfessionalEmailController.java`

RESTful API endpoints for all email operations.

## Features

### 1. Email Template Management

#### Pre-built Templates
The system includes professional HTML templates for:
- **Agreement Signed Confirmation** - Sent when customer signs rental agreement
- **Booking Confirmation** - Sent when reservation is confirmed
- **Payment Receipt** - Sent after payment is received
- **24-Hour Pickup Reminder** - Sent 24 hours before pickup
- **2-Hour Pickup Reminder** - Sent 2 hours before pickup
- **Return Reminder** - Sent before vehicle return date
- **Thank You Email** - Sent after vehicle is returned
- **Invoice/Receipt** - Final invoice after rental completion
- **Cancellation Confirmation** - Sent when booking is cancelled

#### Template Features
- Visual HTML editor with drag-drop support
- Variable substitution system (e.g., `{{customerName}}`, `{{bookingId}}`)
- Mobile-responsive email design
- Professional branded layout with company logo
- Multi-language support (English, Arabic)
- Template versioning and history
- Preview mode (desktop/mobile view)
- Save custom templates

#### Common Template Variables
```
{{customerName}}      - Customer full name
{{bookingId}}         - Booking/Invoice ID
{{carModel}}          - Vehicle model
{{pickupDate}}        - Pickup date/time
{{dropoffDate}}       - Return date/time
{{amount}}            - Total amount
{{pickupLocation}}    - Pickup location
{{companyName}}       - Company name
{{companyPhone}}      - Company phone
{{companyEmail}}      - Company email
{{companyWebsite}}    - Company website URL
```

### 2. Automated Trigger System

Configure automatic email sending based on reservation events:

#### Trigger Events
- `agreement_signed` - When rental agreement is signed
- `booking_confirmed` - When reservation is confirmed
- `payment_received` - When payment is processed
- `before_pickup` - Configurable hours before pickup (e.g., 24h, 2h)
- `after_return` - When vehicle is returned
- `cancellation` - When booking is cancelled
- `custom` - Custom event triggers

#### Trigger Configuration
- Associate templates with events
- Set priority levels (1-10)
- Configure delay/schedule (e.g., send 24 hours before)
- Add conditional logic (if VIP customer, if first-time, etc.)
- Enable/disable triggers individually
- Multiple triggers per event

#### Example Workflow: Agreement Signed
```
1. Customer signs agreement in system
2. System triggers "agreement_signed" event
3. Email service generates PDF agreement and receipt
4. Professional HTML email is rendered with customer details
5. Email is queued with high priority (10)
6. PDF documents are attached
7. Email is sent via primary provider (SMTP)
8. Email log is created with tracking ID
9. Customer receives email within seconds
10. System tracks email open and link clicks
```

### 3. Email Queue Management

#### Queue Features
- Priority-based queue (higher priority sends first)
- Real-time status monitoring
- Automatic retry with exponential backoff
- Rate limiting to prevent throttling
- Batch processing for bulk sends
- Failed job management
- Manual retry capability
- Queue statistics and metrics

#### Email Job States
- **Pending** - Waiting in queue to be sent
- **Sending** - Currently being sent
- **Sent** - Successfully delivered
- **Failed** - Delivery failed (with reason)

#### Queue Operations
- View all queued emails
- Filter by status, date, recipient
- Retry failed emails individually or in bulk
- Clear failed jobs
- Pause/resume queue processing
- Export queue data

### 4. Campaign Management

Create and manage bulk email campaigns:

#### Campaign Features
- Create campaigns from templates
- Customer segmentation
- Scheduled sending
- Batch processing
- Real-time progress tracking
- Open rate tracking
- Click rate tracking
- A/B testing support (subject lines, content)
- Unsubscribe management

#### Customer Segmentation
Filter recipients by:
- VIP status
- First-time customers
- Minimum booking count
- Booking source
- Date range
- Location
- Custom criteria

#### Campaign Analytics
- Recipients count
- Sent count
- Open count and rate
- Click count and rate
- Bounce rate
- Unsubscribe rate
- Revenue attribution
- ROI calculation

### 5. Email Providers

#### Primary Provider: SMTP
Default email sending via SMTP:
- Gmail SMTP
- Office 365 SMTP
- Custom SMTP servers
- TLS/SSL support
- Authentication

#### Supported Providers (with failover)
1. **SMTP** - Standard SMTP protocol
2. **SendGrid** - High-deliverability email service
3. **AWS SES** - Amazon Simple Email Service
4. **Mailgun** - Email API service

#### Provider Failover
If primary provider fails, system automatically tries:
1. Primary provider (configured)
2. First fallback provider
3. Second fallback provider
4. Final fallback provider

All attempts are logged for monitoring.

### 6. Tracking & Analytics

#### Email Tracking
- **Open Tracking** - Invisible pixel tracks email opens
- **Click Tracking** - Links are tracked for click-through rates
- **Device Tracking** - Desktop vs mobile open detection
- **Location Tracking** - Geographic data (optional)
- **Time Tracking** - When email was opened/clicked

#### Analytics Dashboard
Real-time metrics:
- Total emails sent (today, this week, this month)
- Delivery rate
- Open rate (industry average: 65%)
- Click-through rate (industry average: 24%)
- Bounce rate
- Unsubscribe rate
- Revenue per email
- Best performing templates
- Peak sending times
- Customer engagement trends

#### Performance Trends
- Daily/weekly/monthly charts
- Template performance comparison
- Campaign ROI analysis
- Customer engagement scoring
- Predictive analytics

### 7. Professional Email Design

All emails use a professional, responsive HTML layout:

#### Design Features
- **Branded Header** - Company logo and gradient background
- **Mobile-Responsive** - Adapts to all screen sizes
- **Clear Typography** - Easy-to-read fonts and spacing
- **Call-to-Action Buttons** - Prominent CTAs with hover effects
- **Professional Footer** - Company details, social links, legal info
- **Consistent Branding** - Colors, fonts match company identity
- **Accessibility** - WCAG compliant for screen readers

#### Email Structure
```html
<!DOCTYPE html>
<html>
  <head>
    <!-- Meta tags, styles -->
  </head>
  <body>
    <div class="container">
      <!-- Header with logo -->
      <div class="header">
        <img src="company-logo.png" alt="Company Name">
      </div>

      <!-- Content -->
      <div class="content">
        <!-- Template content here -->
      </div>

      <!-- Footer -->
      <div class="footer">
        <!-- Company details, social links, legal -->
      </div>
    </div>

    <!-- Tracking pixel (optional) -->
    <img src="tracking-pixel.gif" style="display:none;">
  </body>
</html>
```

## API Endpoints

### Email Sending

#### Send Individual Email
```http
POST /api/email/send
Content-Type: application/json

{
  "to": "customer@example.com",
  "subject": "Your Booking Confirmation",
  "htmlBody": "<h1>Thank you!</h1>",
  "priority": 5,
  "metadata": {
    "bookingId": "NCT-2024-001",
    "eventType": "booking_confirmation"
  }
}
```

#### Send Agreement Signed Email
```http
POST /api/email/send-agreement
Content-Type: application/json

{
  "reservationId": "res123",
  "agreementPdf": "base64-encoded-pdf...",
  "receiptPdf": "base64-encoded-pdf..."
}
```

#### Send Booking Confirmation
```http
POST /api/email/send-confirmation
Content-Type: application/json

{
  "reservationId": "res123"
}
```

#### Send Payment Receipt
```http
POST /api/email/send-receipt
Content-Type: application/json

{
  "reservationId": "res123",
  "receiptPdf": "base64-encoded-pdf..."
}
```

#### Send Bulk Emails
```http
POST /api/email/send-bulk
Content-Type: application/json

{
  "recipients": ["email1@example.com", "email2@example.com"],
  "subject": "Special Offer",
  "htmlBody": "<h1>20% Off!</h1>",
  "batchSize": 50
}
```

### Template Management

#### Get All Templates
```http
GET /api/email/templates?activeOnly=true
```

#### Get Single Template
```http
GET /api/email/templates/{templateId}
```

#### Create Template
```http
POST /api/email/templates
Content-Type: application/json

{
  "name": "custom_template",
  "subject": "Subject with {{variables}}",
  "bodyTemplate": "<h1>Hello {{customerName}}</h1>",
  "language": "en",
  "isActive": true
}
```

#### Update Template
```http
PUT /api/email/templates/{templateId}
Content-Type: application/json

{
  "name": "updated_template",
  "subject": "Updated Subject",
  "bodyTemplate": "<h1>Updated Content</h1>",
  "language": "en",
  "isActive": true
}
```

#### Delete Template
```http
DELETE /api/email/templates/{templateId}
```

### Queue Management

#### Get Queue Status
```http
GET /api/email/queue

Response:
{
  "queueSize": 15,
  "failedJobs": 2,
  "emailsSentThisMinute": 8,
  "emailsSentThisHour": 120,
  "rateLimitPerMinute": 60,
  "rateLimitPerHour": 500
}
```

#### Get Failed Jobs
```http
GET /api/email/queue/failed

Response:
[
  {
    "id": "job123",
    "to": "customer@example.com",
    "subject": "Your Booking",
    "retryCount": 2,
    "failureReason": "SMTP connection timeout",
    "lastAttempt": "2024-01-20T10:30:00"
  }
]
```

#### Retry Failed Job
```http
POST /api/email/queue/retry/{jobId}
```

#### Clear Failed Jobs
```http
DELETE /api/email/queue/failed
```

### History & Analytics

#### Get Email History
```http
GET /api/email/history?page=0&size=50&status=SENT

Response:
{
  "logs": [...],
  "totalPages": 10,
  "totalElements": 487,
  "currentPage": 0
}
```

#### Get Email Analytics
```http
GET /api/email/analytics?startDate=2024-01-01T00:00:00&endDate=2024-01-31T23:59:59

Response:
{
  "totalSent": 1250,
  "totalFailed": 15,
  "totalPending": 8,
  "openRate": 65.4,
  "clickRate": 23.8,
  "bounceRate": 2.1,
  "unsubscribeRate": 0.3,
  "dateRange": {
    "start": "2024-01-01T00:00:00",
    "end": "2024-01-31T23:59:59"
  }
}
```

### Testing

#### Test Email Configuration
```http
POST /api/email/test
Content-Type: application/json

{
  "to": "test@example.com"
}
```

## Configuration

### Application Properties

Add to `application.properties` or `application.yml`:

```properties
# Email Provider
email.provider=SMTP
email.fallback.enabled=true

# SMTP Configuration
mail.smtp.host=smtp.gmail.com
mail.smtp.port=587
mail.smtp.username=your-email@gmail.com
mail.smtp.password=your-app-password
mail.smtp.from=noreply@nctrental.com
mail.smtp.from.name=NCT Rental
mail.smtp.enabled=true

# SendGrid (optional)
email.sendgrid.api.key=your-sendgrid-api-key

# AWS SES (optional)
email.aws.ses.region=us-east-1
email.aws.ses.access.key=your-access-key
email.aws.ses.secret.key=your-secret-key

# Mailgun (optional)
email.mailgun.api.key=your-mailgun-api-key
email.mailgun.domain=mg.yourdomain.com

# Rate Limiting
email.rate.limit.per.minute=60
email.rate.limit.per.hour=500

# Retry Configuration
email.retry.max.attempts=3
email.retry.initial.delay=1000

# Tracking
email.tracking.enabled=true
email.tracking.base.url=https://nctrental.com/tracking

# Company Details
company.name=NCT Rental
company.logo.url=https://nctrental.com/logo.png
company.address=Amman, Jordan
company.phone=+962-XXX-XXXX
company.email=info@nctrental.com
company.website=https://nctrental.com
```

### Gmail SMTP Setup

1. Enable 2-Factor Authentication on your Google account
2. Generate an App Password:
   - Go to Google Account Settings
   - Security → 2-Step Verification → App Passwords
   - Select "Mail" and "Other (Custom name)"
   - Copy the 16-character password
3. Use the App Password in your configuration

### Database Tables

The system uses the following database tables:

#### notification_templates
Stores email templates:
```sql
CREATE TABLE notification_templates (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL,
    subject VARCHAR(500),
    body_template TEXT NOT NULL,
    language VARCHAR(5) DEFAULT 'en',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

#### notification_logs
Stores email sending history:
```sql
CREATE TABLE notification_logs (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(500),
    status VARCHAR(50) NOT NULL,
    error_message TEXT,
    metadata TEXT,
    sent_at TIMESTAMP,
    opened_at TIMESTAMP,
    clicked_at TIMESTAMP
);
```

## Usage Examples

### Example 1: Send Agreement Email

When a customer signs a rental agreement:

```java
// In your reservation service
@Autowired
private ProfessionalEmailService emailService;

@Autowired
private RentalAgreementService agreementService;

public void processAgreementSigning(Reservation reservation) {
    // Generate PDFs
    byte[] agreementPdf = agreementService.generateAgreementPdf(reservation);
    byte[] receiptPdf = agreementService.generateReceiptPdf(reservation);

    // Send email with attachments
    emailService.sendAgreementSignedEmail(reservation, agreementPdf, receiptPdf);

    // Email is queued with high priority and will be sent within seconds
}
```

### Example 2: Schedule Pickup Reminder

Schedule a reminder 24 hours before pickup:

```java
@Scheduled(cron = "0 0 8 * * *") // Run daily at 8 AM
public void sendPickupReminders() {
    LocalDateTime tomorrow = LocalDateTime.now().plusDays(1);

    // Find reservations with pickup tomorrow
    List<Reservation> upcomingReservations = reservationRepository
        .findByPickupDateBetween(
            tomorrow.toLocalDate().atStartOfDay(),
            tomorrow.toLocalDate().atTime(23, 59, 59)
        );

    // Send reminder to each customer
    for (Reservation reservation : upcomingReservations) {
        emailService.sendPickupReminderEmail(reservation, 24);
    }
}
```

### Example 3: Send Bulk Campaign

Send a promotional campaign to VIP customers:

```java
// Get VIP customers
List<Reservation> vipReservations = reservationRepository
    .findByMinimumBookingsGreaterThan(5);

List<String> vipEmails = vipReservations.stream()
    .map(Reservation::getCustomerEmail)
    .filter(email -> email != null && !email.isEmpty())
    .distinct()
    .collect(Collectors.toList());

// Send bulk campaign
String subject = "Exclusive 20% Off for Our Valued Customers";
String htmlBody = loadTemplate("vip_promotion");

emailService.sendBulkEmails(vipEmails, subject, htmlBody, null, 50);
```

### Example 4: Custom Template

Create and use a custom template:

```java
// Create template
EmailVariables variables = new EmailVariables()
    .put("customerName", "John Doe")
    .put("bookingId", "NCT-2024-001")
    .put("specialOffer", "20% OFF");

emailService.sendEmailFromTemplate(
    "custom_promotion",
    "john@example.com",
    variables,
    null, // no attachments
    Map.of("campaign", "january_special"),
    7 // priority
);
```

## Best Practices

### 1. Email Deliverability
- Use a verified sender domain
- Include unsubscribe links
- Don't send too frequently
- Maintain good email list hygiene
- Monitor bounce rates
- Authenticate emails (SPF, DKIM, DMARC)

### 2. Template Design
- Keep templates mobile-responsive
- Use clear, concise subject lines
- Include clear call-to-action buttons
- Test templates before deploying
- Personalize with customer data
- Include company branding

### 3. Queue Management
- Set appropriate priority levels
- Monitor failed jobs regularly
- Clear old logs periodically
- Use batch sending for large campaigns
- Configure rate limits appropriately

### 4. Analytics
- Track open and click rates
- Monitor deliverability
- A/B test subject lines
- Segment customers effectively
- Analyze best sending times
- Calculate ROI

## Troubleshooting

### Emails Not Sending

1. **Check email configuration**
   ```bash
   # Test email endpoint
   curl -X POST http://localhost:8080/api/email/test \
     -H "Content-Type: application/json" \
     -d '{"to":"your-email@example.com"}'
   ```

2. **Check queue status**
   ```bash
   curl http://localhost:8080/api/email/queue
   ```

3. **View failed jobs**
   ```bash
   curl http://localhost:8080/api/email/queue/failed
   ```

4. **Check application logs**
   ```bash
   tail -f logs/application.log | grep "EmailService"
   ```

### High Bounce Rate

- Validate email addresses before sending
- Remove invalid emails from list
- Check SPF/DKIM records
- Verify sender reputation

### Low Open Rate

- Improve subject lines
- Personalize content
- Send at optimal times
- Segment audience better
- Check spam score

## Security Considerations

1. **Email Authentication**
   - Implement SPF records
   - Configure DKIM signing
   - Set up DMARC policy

2. **Data Protection**
   - Encrypt sensitive data in emails
   - Use HTTPS for all links
   - Implement unsubscribe mechanism
   - Comply with GDPR/privacy laws

3. **API Security**
   - Require authentication for all endpoints
   - Use role-based access control
   - Rate limit API requests
   - Validate all input data

4. **Spam Prevention**
   - Implement rate limiting
   - Use CAPTCHA for public forms
   - Monitor sending patterns
   - Maintain blacklist/whitelist

## Support & Maintenance

### Regular Tasks
- Monitor email queue daily
- Review failed jobs weekly
- Clean up old logs monthly
- Update templates as needed
- Review analytics regularly
- Test backup providers quarterly

### Monitoring Alerts
Set up alerts for:
- High failure rate (>5%)
- Queue size exceeds threshold
- Provider downtime
- Rate limit exceeded
- Bounce rate spike

### Logs Location
- Application logs: `/logs/application.log`
- Email logs: Database `notification_logs` table
- Error logs: `/logs/error.log`

## Future Enhancements

Planned features for future releases:
- SMS integration
- WhatsApp Business integration
- Push notifications
- Advanced A/B testing
- Machine learning for send time optimization
- Dynamic content blocks
- Advanced segmentation
- Email authentication (SPF/DKIM/DMARC)
- Bounce handling automation
- List cleaning automation
- Advanced reporting dashboard
- Multi-language templates
- Template marketplace

## Conclusion

The Professional Email & Notification System provides a complete, enterprise-grade solution for email automation in the NCT Rental platform. With its powerful features, intuitive interface, and robust architecture, it enables effective customer communication while maintaining high deliverability and engagement rates.

For questions or support, please contact the development team.

---

**Version:** 1.0.0
**Last Updated:** January 2024
**Maintained By:** NCT Rental Development Team
