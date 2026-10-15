# Email System Quick Start Guide

## 🚀 Quick Setup (5 Minutes)

### Step 1: Configure Email Provider

Add to `application.properties`:

```properties
# Enable email system
mail.smtp.enabled=true

# Gmail SMTP (recommended for testing)
mail.smtp.host=smtp.gmail.com
mail.smtp.port=587
mail.smtp.username=your-email@gmail.com
mail.smtp.password=your-app-password
mail.smtp.from=noreply@nctrental.com
mail.smtp.from.name=NCT Rental

# Company details
company.name=NCT Rental
company.email=info@nctrental.com
company.phone=+962-XXX-XXXX
company.address=Amman, Jordan
company.website=https://nctrental.com
company.logo.url=https://nctrental.com/logo.png
```

### Step 2: Add Component to Your App

```typescript
import ProfessionalEmailNotificationSystem from './components/ProfessionalEmailNotificationSystem';

// In your admin dashboard
<ProfessionalEmailNotificationSystem
  reservations={reservations}
  companyDetails={companyDetails}
  onSendEmail={(to, subject, body, attachments) => {
    // Call your API
    fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, htmlBody: body })
    });
  }}
/>
```

### Step 3: Create Default Templates

Run this SQL to create default templates:

```sql
-- Agreement Signed Template
INSERT INTO notification_templates (id, name, type, subject, body_template, language, is_active, created_at, updated_at)
VALUES (
  'agreement_signed',
  'Agreement Signed Confirmation',
  'EMAIL',
  'Your Rental Agreement - {{bookingId}}',
  '<h1>Thank You, {{customerName}}!</h1><p>Your rental agreement has been successfully signed.</p><div style="background:#f8f9fa;padding:20px;border-radius:8px;margin:20px 0;"><h3>Booking Details</h3><p><strong>Booking ID:</strong> {{bookingId}}</p><p><strong>Vehicle:</strong> {{carModel}}</p><p><strong>Pickup:</strong> {{pickupDate}}</p><p><strong>Return:</strong> {{dropoffDate}}</p><p><strong>Amount:</strong> {{amount}}</p></div><p>Your agreement and receipt are attached.</p>',
  'en',
  true,
  NOW(),
  NOW()
);

-- Booking Confirmation Template
INSERT INTO notification_templates (id, name, type, subject, body_template, language, is_active, created_at, updated_at)
VALUES (
  'booking_confirmation',
  'Booking Confirmation',
  'EMAIL',
  'Booking Confirmed - {{bookingId}}',
  '<h1>Booking Confirmed!</h1><p>Dear {{customerName}},</p><p>Your reservation has been confirmed.</p><div style="background:#f8f9fa;padding:20px;border-radius:8px;"><h3>Details</h3><p><strong>Booking:</strong> {{bookingId}}</p><p><strong>Vehicle:</strong> {{carModel}}</p><p><strong>Pickup:</strong> {{pickupDate}}</p><p><strong>Return:</strong> {{dropoffDate}}</p></div>',
  'en',
  true,
  NOW(),
  NOW()
);

-- Pickup Reminder Template
INSERT INTO notification_templates (id, name, type, subject, body_template, language, is_active, created_at, updated_at)
VALUES (
  'pickup_reminder',
  '24-Hour Pickup Reminder',
  'EMAIL',
  'Reminder: Your Pickup Tomorrow - {{bookingId}}',
  '<h1>Your Pickup is Tomorrow!</h1><p>Hi {{customerName}},</p><p>Just a reminder that your vehicle pickup is scheduled for tomorrow.</p><div style="background:#fff3cd;padding:20px;border-radius:8px;border-left:4px solid #ffc107;"><h3>⏰ Pickup Details</h3><p><strong>Date:</strong> {{pickupDate}}</p><p><strong>Location:</strong> {{pickupLocation}}</p><p><strong>Vehicle:</strong> {{carModel}}</p></div>',
  'en',
  true,
  NOW(),
  NOW()
);

-- Thank You Template
INSERT INTO notification_templates (id, name, type, subject, body_template, language, is_active, created_at, updated_at)
VALUES (
  'thank_you',
  'Thank You & Invoice',
  'EMAIL',
  'Thank You for Your Business - {{bookingId}}',
  '<h1>Thank You!</h1><p>Dear {{customerName}},</p><p>Thank you for renting with {{companyName}}. We hope you had a wonderful experience!</p><div style="background:#d4edda;padding:20px;border-radius:8px;border-left:4px solid #28a745;"><h3>✓ Rental Completed</h3><p><strong>Booking:</strong> {{bookingId}}</p><p><strong>Vehicle:</strong> {{carModel}}</p></div>',
  'en',
  true,
  NOW(),
  NOW()
);
```

### Step 4: Test the System

```bash
# Test email configuration
curl -X POST http://localhost:8080/api/email/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"to":"your-email@example.com"}'

# Check queue status
curl http://localhost:8080/api/email/queue \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📧 Common Use Cases

### 1. Send Agreement Email After Signing

```java
@Autowired
private ProfessionalEmailService emailService;

public void onAgreementSigned(Reservation reservation, byte[] agreementPdf, byte[] receiptPdf) {
    emailService.sendAgreementSignedEmail(reservation, agreementPdf, receiptPdf);
}
```

### 2. Send Confirmation on Booking

```java
public void onBookingCreated(Reservation reservation) {
    emailService.sendBookingConfirmationEmail(reservation);
}
```

### 3. Schedule Daily Pickup Reminders

```java
@Scheduled(cron = "0 0 8 * * *") // 8 AM daily
public void sendPickupReminders() {
    LocalDateTime tomorrow = LocalDateTime.now().plusDays(1);
    List<Reservation> upcomingPickups = reservationRepository
        .findByPickupDateBetween(
            tomorrow.toLocalDate().atStartOfDay(),
            tomorrow.toLocalDate().atTime(23, 59, 59)
        );

    for (Reservation reservation : upcomingPickups) {
        emailService.sendPickupReminderEmail(reservation, 24);
    }
}
```

### 4. Send Thank You After Return

```java
public void onVehicleReturned(Reservation reservation, byte[] invoicePdf) {
    emailService.sendThankYouEmail(reservation, invoicePdf);
}
```

### 5. Send Bulk Promotional Campaign

```java
public void sendPromotionalCampaign() {
    List<String> customerEmails = getAllCustomerEmails();
    String subject = "Exclusive 20% Off Your Next Rental!";
    String htmlBody = loadTemplate("promotion_january");

    emailService.sendBulkEmails(customerEmails, subject, htmlBody, null, 50);
}
```

## 🎨 Customizing Email Templates

### Using the UI

1. Open Email System in your admin dashboard
2. Click "Templates" tab
3. Click "Edit" on any template
4. Modify subject and body
5. Use variables like `{{customerName}}`, `{{bookingId}}`
6. Preview in desktop/mobile mode
7. Save changes

### Programmatically

```java
NotificationTemplate template = new NotificationTemplate();
template.setName("custom_welcome");
template.setType(NotificationTemplate.NotificationType.EMAIL);
template.setSubject("Welcome to {{companyName}}, {{customerName}}!");
template.setBodyTemplate(
    "<h1>Welcome!</h1>" +
    "<p>Dear {{customerName}},</p>" +
    "<p>Thank you for joining {{companyName}}.</p>"
);
template.setLanguage("en");
template.setActive(true);

templateRepository.save(template);
```

## 📊 Monitoring & Analytics

### View Queue Status

```bash
curl http://localhost:8080/api/email/queue
```

### View Failed Jobs

```bash
curl http://localhost:8080/api/email/queue/failed
```

### View Analytics

```bash
curl "http://localhost:8080/api/email/analytics?startDate=2024-01-01T00:00:00&endDate=2024-01-31T23:59:59"
```

### View Email History

```bash
curl "http://localhost:8080/api/email/history?page=0&size=50&status=SENT"
```

## 🔧 Advanced Configuration

### Enable Multiple Providers with Failover

```properties
# Primary provider
email.provider=SMTP
email.fallback.enabled=true

# SendGrid (fallback #1)
email.sendgrid.api.key=your-sendgrid-key

# AWS SES (fallback #2)
email.aws.ses.region=us-east-1
email.aws.ses.access.key=your-access-key
email.aws.ses.secret.key=your-secret-key
```

### Configure Rate Limiting

```properties
# Don't exceed these limits
email.rate.limit.per.minute=60
email.rate.limit.per.hour=500
```

### Enable Email Tracking

```properties
email.tracking.enabled=true
email.tracking.base.url=https://nctrental.com/tracking
```

### Configure Retry Logic

```properties
email.retry.max.attempts=3
email.retry.initial.delay=1000
```

## 🐛 Troubleshooting

### Emails Not Sending

1. Check if email is enabled:
   ```properties
   mail.smtp.enabled=true
   ```

2. Verify SMTP credentials are correct

3. Check application logs:
   ```bash
   tail -f logs/application.log | grep EmailService
   ```

4. Test email endpoint:
   ```bash
   curl -X POST http://localhost:8080/api/email/test \
     -H "Content-Type: application/json" \
     -d '{"to":"your-email@example.com"}'
   ```

### Gmail App Password

If using Gmail:
1. Enable 2-Factor Authentication
2. Go to Google Account → Security → 2-Step Verification → App Passwords
3. Generate password for "Mail" / "Other"
4. Use the 16-character password in configuration

### Check Queue

```bash
# View queue status
curl http://localhost:8080/api/email/queue

# View failed jobs
curl http://localhost:8080/api/email/queue/failed

# Retry failed job
curl -X POST http://localhost:8080/api/email/queue/retry/{jobId}

# Clear failed jobs
curl -X DELETE http://localhost:8080/api/email/queue/failed
```

## 📚 Next Steps

1. **Read Full Documentation**: See `EMAIL_SYSTEM_DOCUMENTATION.md`
2. **Customize Templates**: Create templates for your use cases
3. **Set Up Triggers**: Configure automatic emails for events
4. **Monitor Performance**: Check analytics regularly
5. **Optimize Sending**: Use A/B testing and segmentation

## 🎯 Quick Reference

### Available Email Variables

```
{{customerName}}      - Customer name
{{bookingId}}         - Booking ID
{{carModel}}          - Vehicle model
{{pickupDate}}        - Pickup date
{{dropoffDate}}       - Return date
{{amount}}            - Total amount
{{pickupLocation}}    - Pickup location
{{companyName}}       - Company name
{{companyPhone}}      - Company phone
{{companyEmail}}      - Company email
{{companyWebsite}}    - Website URL
```

### API Endpoints

```
POST   /api/email/send                 - Send email
POST   /api/email/send-agreement       - Send agreement
POST   /api/email/send-confirmation    - Send confirmation
POST   /api/email/send-receipt         - Send receipt
POST   /api/email/send-bulk            - Send bulk
GET    /api/email/templates            - List templates
POST   /api/email/templates            - Create template
PUT    /api/email/templates/{id}       - Update template
DELETE /api/email/templates/{id}       - Delete template
GET    /api/email/queue                - Queue status
GET    /api/email/queue/failed         - Failed jobs
POST   /api/email/queue/retry/{id}     - Retry job
DELETE /api/email/queue/failed         - Clear failed
GET    /api/email/history              - Email history
GET    /api/email/analytics            - Analytics
POST   /api/email/test                 - Test config
```

## 💡 Pro Tips

1. **Test thoroughly** before sending to customers
2. **Use preview mode** to check mobile responsiveness
3. **Monitor open rates** to optimize subject lines
4. **Segment customers** for targeted campaigns
5. **Keep templates updated** with current branding
6. **Set up alerts** for high failure rates
7. **Clean email lists** regularly
8. **A/B test** subject lines and content
9. **Send at optimal times** based on analytics
10. **Track ROI** for promotional campaigns

## 🆘 Support

For questions or issues:
- Check logs: `/logs/application.log`
- Review documentation: `EMAIL_SYSTEM_DOCUMENTATION.md`
- Contact development team

---

**Happy Emailing! 📧**
