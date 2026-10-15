# NCT Rental - Professional CRM System Setup Guide

## 🚀 Overview

This is an **Enterprise-Grade Car Rental Management System** with professional features including:

- ✅ **Multi-Factor Authentication (MFA)** - TOTP, SMS, Email
- ✅ **Session Management** - Auto-logout, concurrent session limits
- ✅ **Comprehensive Audit Logging** - Track all user actions
- ✅ **Stripe Payment Integration** - Webhooks, refunds, automated processing
- ✅ **Multi-Channel Notifications** - Email, SMS, WhatsApp ready
- ✅ **Professional UI/UX** - Modern design system with animations
- ✅ **Customer Self-Service Portal** (Coming Soon)
- ✅ **Advanced Analytics Dashboard** (Coming Soon)
- ✅ **GPS Fleet Tracking** (Coming Soon)

---

## 📋 Prerequisites

- **Java 17+**
- **Node.js 18+**
- **PostgreSQL 14+** (or H2 for development)
- **Redis** (optional, for caching)
- **Stripe Account** (for payments)
- **Email Provider** (Gmail, SendGrid, etc.)
- **SMS Provider** (Twilio recommended)

---

## 🔧 Backend Setup (Java Spring Boot)

### 1. Database Configuration

Edit `src/main/resources/application.properties`:

```properties
# Database (PostgreSQL for Production)
spring.datasource.url=jdbc:postgresql://localhost:5432/nct_rental
spring.datasource.username=your_username
spring.datasource.password=your_password
spring.jpa.hibernate.ddl-auto=update

# Or use H2 for Development
# spring.datasource.url=jdbc:h2:mem:nct_rental
# spring.jpa.hibernate.ddl-auto=create-drop
```

### 2. Stripe Configuration

```properties
# Stripe Payment Gateway
stripe.secret.key=sk_test_YOUR_SECRET_KEY
stripe.webhook.secret=whsec_YOUR_WEBHOOK_SECRET
app.base-url=https://your-domain.com
```

**Setup Stripe Webhook:**
1. Go to https://dashboard.stripe.com/webhooks
2. Add endpoint: `https://your-domain.com/api/webhooks/stripe`
3. Select events: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
4. Copy webhook secret to `stripe.webhook.secret`

### 3. Email Configuration (SMTP)

```properties
# Email Service
mail.smtp.enabled=true
mail.smtp.host=smtp.gmail.com
mail.smtp.port=587
mail.smtp.username=your-email@gmail.com
mail.smtp.password=your-app-password
mail.smtp.from=noreply@nctrental.com
```

**Gmail Setup:**
1. Enable 2FA on your Google account
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Use the app password in configuration

### 4. SMS Configuration (Twilio)

```properties
# SMS Service
sms.enabled=true
sms.provider=twilio
sms.twilio.account-sid=YOUR_ACCOUNT_SID
sms.twilio.auth-token=YOUR_AUTH_TOKEN
sms.twilio.from-number=+1234567890
```

**Twilio Setup:**
1. Sign up at https://www.twilio.com
2. Get Account SID and Auth Token from console
3. Purchase a phone number

### 5. Session Management

```properties
# Session Configuration
app.session.max-concurrent=3
app.session.timeout-minutes=30
app.session.max-duration-hours=24
```

### 6. Security & JWT

```properties
# JWT Configuration
jwt.secret=your-very-long-secret-key-at-least-256-bits
jwt.expiration=86400000

# CORS Configuration
app.cors.allowed-origins=http://localhost:3000,https://your-domain.com
```

### 7. Notification Settings

```properties
# Notifications
app.notifications.enabled=true
```

---

## 🎨 Frontend Setup (React + Vite)

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create `.env.local`:

```env
VITE_API_URL=http://localhost:8080
VITE_STRIPE_PUBLIC_KEY=pk_test_YOUR_PUBLIC_KEY
VITE_APP_NAME=NCT Rental
```

### 3. Build for Production

```bash
npm run build
```

### 4. Development Server

```bash
npm run dev
```

---

## 🗄️ Database Schema

The system will auto-create these tables:

- `users` - User accounts with permissions
- `user_sessions` - Active user sessions
- `mfa_settings` - Multi-factor authentication settings
- `audit_logs` - Complete audit trail
- `reservations` - Car rental bookings
- `vehicles` - Fleet management
- `payments` - Payment transactions
- `notification_logs` - Sent notifications
- `notification_templates` - Email/SMS templates

---

## 🔐 Security Features

### Multi-Factor Authentication (MFA)

**Enable MFA for a user:**

```bash
POST /api/mfa/setup/init
{
  "type": "TOTP"
}
```

**Scan QR code** with Google Authenticator, Authy, or Microsoft Authenticator.

### Session Management

- Maximum **3 concurrent sessions** per user
- Auto-logout after **30 minutes** of inactivity
- Sessions expire after **24 hours**

### Audit Logging

All actions are logged:
- User logins/logouts
- Reservation changes
- Payment transactions
- Data exports
- Permission changes

---

## 💳 Payment Processing

### Create Checkout Session

```bash
POST /stripe/create-payment-link
{
  "amount": 100.00,
  "description": "Car Rental Payment"
}
```

### Webhook Events

Stripe automatically notifies your system of:
- ✅ Payment succeeded
- ❌ Payment failed
- 💰 Refund processed

---

## 📧 Notification System

### Email Templates

Located in database table `notification_templates`:

- `booking_confirmation` - Sent when booking is created
- `payment_reminder` - Sent for pending payments
- `pickup_reminder` - Sent 1 day before pickup
- `return_reminder` - Sent 1 day before return

### Template Variables

Use `{{variableName}}` in templates:
- `{{customerName}}`
- `{{bookingId}}`
- `{{pickupDate}}`
- `{{dropoffDate}}`
- `{{amount}}`
- `{{vehicleModel}}`

---

## 🎨 Professional Design System

### CSS Classes

**Buttons:**
- `.btn-professional-primary` - Primary action button
- `.btn-professional-secondary` - Secondary button
- `.btn-professional-success` - Success/confirm button
- `.btn-professional-danger` - Delete/cancel button

**Cards:**
- `.professional-card` - Standard card with hover effect
- `.glass-card` - Glass morphism card

**Inputs:**
- `.input-professional` - Standard input field
- `.input-professional-error` - Error state input

**Badges:**
- `.badge-success` - Green badge
- `.badge-warning` - Yellow badge
- `.badge-error` - Red badge
- `.badge-info` - Blue badge

**Tables:**
- `.table-professional` - Professional data table

---

## 📊 API Endpoints

### Authentication
- `POST /auth/login` - User login
- `POST /auth/register` - User registration
- `POST /auth/logout` - User logout
- `POST /auth/change-password` - Change password

### MFA
- `GET /api/mfa/status` - Get MFA status
- `POST /api/mfa/setup/init` - Initialize MFA setup
- `POST /api/mfa/enable` - Enable MFA
- `POST /api/mfa/disable` - Disable MFA
- `POST /api/mfa/verify` - Verify MFA code

### Sessions
- `GET /api/sessions/active` - Get active sessions
- `DELETE /api/sessions/{id}` - Terminate session
- `POST /api/sessions/terminate-all-others` - Terminate all other sessions

### Payments
- `POST /stripe/create-payment-link` - Create Stripe checkout
- `POST /api/webhooks/stripe` - Stripe webhook endpoint

### Reservations
- `GET /api/reservations` - Get all reservations
- `POST /api/reservations` - Create reservation
- `PUT /api/reservations/{id}` - Update reservation
- `DELETE /api/reservations/{id}` - Delete reservation

---

## 🚀 Deployment

### Production Checklist

- [ ] Set `spring.profiles.active=prod`
- [ ] Use PostgreSQL instead of H2
- [ ] Enable HTTPS/SSL
- [ ] Configure production Stripe keys
- [ ] Set secure JWT secret (256+ bits)
- [ ] Configure email service
- [ ] Configure SMS service
- [ ] Set up Stripe webhooks
- [ ] Enable Redis caching
- [ ] Configure CORS for production domain
- [ ] Set up automated backups
- [ ] Configure monitoring (optional)

### Docker Deployment

```bash
# Build backend
cd car-rental-backend-java
./mvnw clean package
docker build -t nct-rental-backend .

# Build frontend
cd ../
npm run build
docker build -t nct-rental-frontend .

# Run with docker-compose
docker-compose up -d
```

---

## 🔧 Troubleshooting

### Email not sending
- Check SMTP credentials
- Enable "Less secure app access" for Gmail
- Use app-specific password with 2FA

### SMS not sending
- Verify Twilio credentials
- Check phone number format (+country code)
- Ensure Twilio account is funded

### Stripe webhook failing
- Verify webhook secret matches Stripe dashboard
- Check webhook URL is publicly accessible
- Review Stripe webhook logs

### MFA QR code not working
- Ensure system time is synchronized
- Try manual entry of secret key
- Check TOTP app supports SHA1

---

## 📝 License

Proprietary - NCT Rental System
All rights reserved.

---

## 📞 Support

For issues or questions:
- Email: support@nctrental.com
- Documentation: https://docs.nctrental.com
- GitHub Issues: https://github.com/nct-rental/issues

---

## 🎯 Next Features

- [ ] Customer Self-Service Portal
- [ ] Advanced Analytics Dashboard
- [ ] GPS Fleet Tracking
- [ ] Maintenance Scheduling
- [ ] Multi-language Support (Arabic/English)
- [ ] Mobile App (React Native)
- [ ] API Documentation (Swagger)
- [ ] Automated Backup System
- [ ] Redis Caching Layer

---

**Built with ❤️ for Professional Car Rental Management**
