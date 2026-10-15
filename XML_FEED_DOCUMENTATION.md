# NCT Rental - Professional XML Feed & Reservation System
## Complete Integration Guide for Channel Distribution

> **Enterprise-Grade Channel Management for Booking.com, Expedia, Skyscanner, DiscoverCars, Rentalcars.com, and more**

---

## Table of Contents
1. [System Overview](#system-overview)
2. [XML Feed Endpoints](#xml-feed-endpoints)
3. [Reservation Reception](#reservation-reception)
4. [OTA XML Standards](#ota-xml-standards)
5. [Channel Integration Examples](#channel-integration-examples)
6. [Rate Management](#rate-management)
7. [Stop-Sale Management](#stop-sale-management)
8. [Security & Authentication](#security--authentication)
9. [Testing & Validation](#testing--validation)

---

## System Overview

The NCT Rental XML Feed System provides **professional, industry-standard integration** with major distribution channels using **OTA (OpenTravel Alliance) XML standards**.

### Key Features ✨

✅ **Outbound Feeds** (Push to channels):
- Rate & Availability Feed (ARI)
- Vehicle Catalog Distribution
- Terms & Conditions Feed
- Real-Time Inventory Updates
- Stop-Sale Notifications

✅ **Inbound Webhooks** (Receive from channels):
- New Reservation Reception
- Reservation Modifications
- Reservation Cancellations
- Automatic Confirmation Responses

✅ **Professional Features**:
- OTA-compliant XML format
- Duration-based pricing (1-3, 4-7, 8-14, 15-21, 22-30, 31+ days)
- SIPP code standardization
- Multi-currency support
- Commission tracking
- Automatic inventory sync
- Digital audit trail

---

## XML Feed Endpoints

### 1. Rate & Availability Feed (ARI)

**Purpose**: Distribute rates and availability to channels

**Endpoint**: `GET /api/feeds/rates`

**Query Parameters**:
- `channelId` (required): Channel identifier
- `startDate` (required): Start date (YYYY-MM-DD)
- `endDate` (required): End date (YYYY-MM-DD)

**Headers**:
- `X-Api-Key`: Channel API key for authentication

**Response Format**: `OTA_VehAvailRateRS`

**Example Request**:
```bash
curl -X GET "https://api.nctrental.com/api/feeds/rates?channelId=BOOKING_COM&startDate=2025-06-01&endDate=2025-06-30" \
  -H "X-Api-Key: your-channel-api-key" \
  -H "Accept: application/xml"
```

**Example Response**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<OTA_VehAvailRateRS xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0" TimeStamp="2025-10-14T10:30:00">
  <Success/>
  <VehRentalCore PickUpDateTime="2025-06-01T10:00:00" ReturnDateTime="2025-06-30T10:00:00">
    <PickUpLocation LocationCode="NCTMAIN" Name="NCT Rental CRM"/>
    <ReturnLocation LocationCode="NCTMAIN" Name="NCT Rental CRM"/>
  </VehRentalCore>
  <VehAvailRateList>
    <VehAvailRate>
      <VehAvailCore Status="Available">
        <Vehicle AirConditionInd="true" TransmissionType="Automatic" Code="ECAR">
          <VehClass Size="E"/>
          <VehMakeModel Name="Economy Vehicle"/>
        </Vehicle>
        <RentalRate>
          <VehicleCharges>
            <VehicleCharge Purpose="1" Amount="45.00" CurrencyCode="USD"
                          UnitName="Daily" Quantity="1" MinDays="1" MaxDays="3"/>
            <VehicleCharge Purpose="1" Amount="40.00" CurrencyCode="USD"
                          UnitName="Daily" Quantity="1" MinDays="4" MaxDays="7"/>
            <VehicleCharge Purpose="1" Amount="35.00" CurrencyCode="USD"
                          UnitName="Daily" Quantity="1" MinDays="8" MaxDays="14"/>
          </VehicleCharges>
        </RentalRate>
      </VehAvailCore>
      <Fees>
        <Fee Purpose="AirportFee" Description="Airport Fee" Amount="25.00" CurrencyCode="USD"/>
        <Fee Purpose="YoungDriverFee" Description="Young Driver Fee" Amount="15.00" CurrencyCode="USD"/>
      </Fees>
      <Reference Type="RatePlanID" ID="rate-plan-123" ID_Context="Summer 2025"/>
    </VehAvailRate>
  </VehAvailRateList>
</OTA_VehAvailRateRS>
```

**Update Frequency**: Pull every 15 minutes or on-demand

---

### 2. Vehicle Catalog Feed

**Purpose**: Distribute complete vehicle inventory with specifications

**Endpoint**: `GET /api/feeds/vehicles`

**Query Parameters**:
- `channelId` (required): Channel identifier

**Response Format**: `OTA_VehDescriptiveInfoRS`

**Example Response**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<OTA_VehDescriptiveInfoRS xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0">
  <Success/>
  <VehDescriptiveInfos>
    <VehDescriptiveInfo>
      <VehInfo>
        <VehType VehicleCategory="E" Code="ECAR">
          <VehClass Size="E"/>
          <VehMakeModel Name="Toyota Corolla" Code="Corolla"/>
        </VehType>
        <VehAttributes>
          <PassengerQuantity>5</PassengerQuantity>
          <BaggageQuantity>2</BaggageQuantity>
          <AirConditionInd>true</AirConditionInd>
          <TransmissionType>Automatic</TransmissionType>
          <FuelType>Gasoline</FuelType>
        </VehAttributes>
        <VehFeatures>
          <VehFeature Type="Bluetooth"/>
          <VehFeature Type="USB Charging"/>
          <VehFeature Type="Backup Camera"/>
        </VehFeatures>
      </VehInfo>
      <Multimedia>
        <ImageItems>
          <ImageItem>
            <URL>https://nctrental.com/images/toyota-corolla.jpg</URL>
          </ImageItem>
        </ImageItems>
      </Multimedia>
    </VehDescriptiveInfo>
  </VehDescriptiveInfos>
</OTA_VehDescriptiveInfoRS>
```

**Update Frequency**: Pull daily or when vehicle inventory changes

---

### 3. Terms & Conditions Feed

**Purpose**: Distribute rental policies, cancellation rules, insurance options

**Endpoint**: `GET /api/feeds/terms`

**Query Parameters**:
- `channelId` (required): Channel identifier

**Response Format**: `OTA_VehPolicyRS`

**Example Response**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<OTA_VehPolicyRS xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0">
  <Success/>
  <RentalConditions>
    <AgeRestrictions>
      <Age Minimum="21" Maximum="99"/>
    </AgeRestrictions>
    <CancellationPolicy>
      <CancelPenalty PenaltyDescription="Free cancellation up to 48 hours before pickup. 50% charge within 48 hours. 100% charge for no-show."/>
    </CancellationPolicy>
    <PaymentRules>
      <PaymentRule PaymentType="CreditCard" RequiredForReservation="true"/>
    </PaymentRules>
    <FuelPolicy>
      <Fuel Type="FullToFull">Vehicle provided with full tank. Return with full tank or refueling charges apply.</Fuel>
    </FuelPolicy>
    <MileagePolicy>
      <Mileage UnlimitedMileage="true"/>
    </MileagePolicy>
    <Coverages>
      <Coverage Code="CDW" Description="Collision Damage Waiver" DailyCost="25.00" CurrencyCode="USD"/>
      <Coverage Code="TP" Description="Theft Protection" DailyCost="15.00" CurrencyCode="USD"/>
      <Coverage Code="PAI" Description="Personal Accident Insurance" DailyCost="10.00" CurrencyCode="USD"/>
    </Coverages>
  </RentalConditions>
</OTA_VehPolicyRS>
```

**Update Frequency**: Pull when terms change

---

### 4. Real-Time Inventory Feed

**Purpose**: Provide current availability for specific dates

**Endpoint**: `GET /api/feeds/inventory`

**Query Parameters**:
- `channelId` (required): Channel identifier
- `date` (required): Specific date (YYYY-MM-DD)

**Response Format**: `OTA_HotelAvailNotifRQ`

**Example Response**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelAvailNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0">
  <AvailStatusMessages>
    <AvailStatusMessage>
      <StatusApplicationControl Start="2025-06-01" End="2025-06-01" InvTypeCode="ECAR"/>
      <AvailCount Count="5"/>
    </AvailStatusMessage>
    <AvailStatusMessage>
      <StatusApplicationControl Start="2025-06-01" End="2025-06-01" InvTypeCode="CDAR"/>
      <AvailCount Count="3"/>
    </AvailStatusMessage>
  </AvailStatusMessages>
</OTA_HotelAvailNotifRQ>
```

**Update Frequency**: Real-time or every 5 minutes

---

### 5. Stop-Sale Notification

**Purpose**: Immediately notify channels when vehicle category is sold out

**Endpoint**: `POST /api/feeds/stop-sale`

**Request Body**:
```json
{
  "channelId": "BOOKING_COM",
  "vehicleCategory": "ECAR",
  "startDate": "2025-06-15",
  "endDate": "2025-06-20",
  "reason": "Sold out - high demand"
}
```

**Response Format**: `OTA_VehAvailRateNotifRQ`

**Example Response**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<OTA_VehAvailRateNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0">
  <AvailStatusMessages>
    <AvailStatusMessage>
      <StatusApplicationControl Start="2025-06-15" End="2025-06-20" InvTypeCode="ECAR"/>
      <RestrictionStatus Status="Close" Restriction="Arrival" Reason="Sold out - high demand"/>
    </AvailStatusMessage>
  </AvailStatusMessages>
</OTA_VehAvailRateNotifRQ>
```

**Trigger**: Manual or automatic when inventory reaches zero

---

## Reservation Reception

### 1. New Reservation Webhook

**Purpose**: Receive new bookings from external channels

**Endpoint**: `POST /api/webhook/reservation`

**Content-Type**: `application/xml` or `text/xml`

**Headers**:
- `X-Channel-Code`: Channel identifier (e.g., "BOOKING_COM")
- `X-Channel-Signature`: HMAC signature for validation (optional)

**Request Format**: `OTA_VehResRQ`

**Example Request**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<OTA_VehResRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0">
  <POS>
    <Source AgentSine="BOOKING" PseudoCityCode="Booking.com"/>
  </POS>
  <VehResRQCore PickUpDateTime="2025-07-01T10:00:00" ReturnDateTime="2025-07-05T10:00:00">
    <PickUpLocation LocationCode="NCTMAIN"/>
    <ReturnLocation LocationCode="NCTMAIN"/>
    <VehPref Code="ECAR">
      <VehClass Size="E"/>
      <VehMakeModel Name="Economy Vehicle"/>
    </VehPref>
    <Driver Age="30"/>
    <RateQualifier RateCode="SUMMER2025" RatePlanID="rate-plan-123"/>
    <TotalCharge EstimatedTotalAmount="200.00" CurrencyCode="USD"/>
  </VehResRQCore>
  <VehResRQInfo>
    <Customer>
      <Primary>
        <PersonName>
          <NamePrefix>Mr.</NamePrefix>
          <GivenName>John</GivenName>
          <Surname>Smith</Surname>
        </PersonName>
        <Telephone PhoneNumber="555-0123" CountryAccessCode="1"/>
        <Email>john.smith@email.com</Email>
        <Address>
          <AddressLine>123 Main Street</AddressLine>
          <CityName>Los Angeles</CityName>
          <PostalCode>90001</PostalCode>
          <CountryName>USA</CountryName>
        </Address>
        <Document DocID="DL123456" DocType="1" DocIssueCountry="US" ExpireDate="2027-12-31"/>
      </Primary>
    </Customer>
    <Reference ID="BOOK-2025-ABC123"/>
  </VehResRQInfo>
</OTA_VehResRQ>
```

**Response Format**: `OTA_VehResRS`

**Success Response**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<OTA_VehResRS xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0">
  <Success/>
  <VehResRSCore>
    <VehReservation>
      <UniqueID Type="14" ID="RSV-2025-00123"/>
    </VehReservation>
  </VehResRSCore>
</OTA_VehResRS>
```

**Error Response**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<OTA_VehResRS xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0">
  <Errors>
    <Error Type="3" Code="322">No availability for requested vehicle category</Error>
  </Errors>
</OTA_VehResRS>
```

---

### 2. Modification Webhook

**Purpose**: Process reservation changes from channels

**Endpoint**: `POST /api/webhook/modification`

**Request Format**: `OTA_VehModifyRQ`

**Example Request**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<OTA_VehModifyRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0">
  <VehModifyRQCore>
    <UniqueID Type="14" ID="BOOK-2025-ABC123"/>
    <!-- New pickup/return dates -->
    <PickUpDateTime>2025-07-02T10:00:00</PickUpDateTime>
    <ReturnDateTime>2025-07-06T10:00:00</ReturnDateTime>
  </VehModifyRQCore>
</OTA_VehModifyRQ>
```

**Processing Flow**:
1. Parse modification XML
2. Find original reservation by confirmation number
3. Check availability for new dates/vehicle
4. Release old inventory, reserve new inventory
5. Create new reservation record (type: MODIFICATION)
6. Update original reservation status to MODIFIED
7. Send confirmation response
8. Notify customer via email

---

### 3. Cancellation Webhook

**Purpose**: Process reservation cancellations from channels

**Endpoint**: `POST /api/webhook/cancellation`

**Request Format**: `OTA_CancelRQ`

**Example Request**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<OTA_CancelRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0">
  <UniqueID Type="14" ID="BOOK-2025-ABC123"/>
  <Reason>Customer request</Reason>
  <CancelRules>
    <CancelPenalty>
      <AmountPercent Percent="50.00"/>
      <Deadline AbsoluteDeadline="2025-06-29T10:00:00"/>
    </CancelPenalty>
  </CancelRules>
</OTA_CancelRQ>
```

**Response Format**: `OTA_CancelRS`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<OTA_CancelRS xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0">
  <Success/>
  <UniqueID Type="14" ID="RSV-2025-00123"/>
  <CancelConfirmNumber>CNCL-RSV-2025-00123</CancelConfirmNumber>
</OTA_CancelRS>
```

**Cancellation Fee Calculation**:
- **48+ hours before pickup**: Free cancellation (0% fee)
- **24-48 hours before pickup**: 50% cancellation fee
- **Less than 24 hours or no-show**: 100% fee (no refund)

---

## Rate Management

### Duration-Based Pricing Structure

NCT Rental uses **professional tiered pricing** based on rental duration:

| Rental Days | Tier         | Daily Rate Example |
|-------------|--------------|-------------------|
| 1-3 days    | Short-term   | $45.00            |
| 4-7 days    | Weekly       | $40.00            |
| 8-14 days   | Mid-term     | $35.00            |
| 15-21 days  | Extended     | $32.00            |
| 22-30 days  | Monthly      | $30.00            |
| 31+ days    | Long-term    | $28.00            |

### Rate Plan Management

**Create Rate Plan** (via UI or API):
```java
ChannelRatePlan ratePlan = new ChannelRatePlan();
ratePlan.setRatePlanName("Summer 2025");
ratePlan.setVehicleCategory("ECAR"); // SIPP code
ratePlan.setStartDate(LocalDate.of(2025, 6, 1));
ratePlan.setEndDate(LocalDate.of(2025, 8, 31));
ratePlan.setDailyRate1To3Days(new BigDecimal("45.00"));
ratePlan.setDailyRate4To7Days(new BigDecimal("40.00"));
ratePlan.setDailyRate8To14Days(new BigDecimal("35.00"));
ratePlan.setDailyRate15To21Days(new BigDecimal("32.00"));
ratePlan.setDailyRate22To30Days(new BigDecimal("30.00"));
ratePlan.setDailyRate31PlusDays(new BigDecimal("28.00"));
ratePlan.setAirportFee(new BigDecimal("25.00"));
ratePlan.setYoungDriverFee(new BigDecimal("15.00"));
ratePlan.setPublished(true);
```

### SIPP Code Reference

Standard Interline Passenger Procedure (SIPP) codes:

| Code | Category      | Type/Transmission | Drive | Fuel/AC |
|------|---------------|-------------------|-------|---------|
| ECAR | Economy       | Automatic         | 2WD   | AC      |
| CDAR | Compact       | Automatic         | 2WD   | AC      |
| IDAR | Intermediate  | Automatic         | 2WD   | AC      |
| SDAR | Standard      | Automatic         | 2WD   | AC      |
| FDAR | Fullsize      | Automatic         | 2WD   | AC      |
| PDAR | Premium       | Automatic         | 2WD   | AC      |
| LDAR | Luxury        | Automatic         | 2WD   | AC      |
| FVAR | SUV/Van       | Automatic         | 4WD   | AC      |

---

## Stop-Sale Management

### Manual Stop-Sale

Set stop-sale via rate plan:
```java
ratePlan.setStopSale(true);
ratePlan.setStopSaleReason("Sold out - high demand");
```

### Automatic Stop-Sale

Triggered when inventory reaches zero:
```java
if (inventory.getTotalAvailable() - inventory.getTotalBooked() <= 0) {
    inventory.setStopSale(true);
    inventory.setStopSaleReason("No availability");

    // Send notification to all channels
    xmlFeedService.generateStopSaleNotification(
        channelId, vehicleCategory, startDate, endDate, "Sold out"
    );
}
```

### Lifting Stop-Sale

```java
ratePlan.setStopSale(false);
ratePlan.setStopSaleReason(null);
```

---

## Security & Authentication

### API Key Authentication

Each channel receives a unique API key:

**Request Header**:
```
X-Api-Key: sk_live_abc123xyz789...
```

**Validation** (implement in production):
```java
private boolean validateApiKey(String apiKey, String channelId) {
    DistributionChannel channel = channelRepository.findByChannelCode(channelId);
    return channel != null && channel.getApiKey().equals(apiKey);
}
```

### Webhook Signature Validation

For incoming webhooks, validate HMAC signature:

**Booking.com Example**:
```java
String signature = request.getHeader("X-Channel-Signature");
String payload = requestBody;
String secret = channel.getWebhookSecret();

String computed = HmacUtils.hmacSha256Hex(secret, payload);
return computed.equals(signature);
```

---

## Testing & Validation

### Test Endpoints

**Health Check**:
```bash
curl https://api.nctrental.com/api/webhook/health
```

**Feed Test**:
```bash
curl https://api.nctrental.com/api/feeds/test?channelId=TEST&feedType=rates
```

**Webhook Test**:
```bash
curl -X POST https://api.nctrental.com/api/webhook/test \
  -H "X-Channel-Code: TEST" \
  -d "Test payload"
```

### Sample Integration Test

```bash
#!/bin/bash

# 1. Test rate feed
echo "Testing rate feed..."
curl -X GET "http://localhost:8080/api/feeds/rates?channelId=TEST&startDate=2025-07-01&endDate=2025-07-31" \
  -H "X-Api-Key: test-key" \
  -H "Accept: application/xml"

# 2. Test new reservation
echo "\nTesting new reservation..."
curl -X POST "http://localhost:8080/api/webhook/reservation" \
  -H "Content-Type: application/xml" \
  -H "X-Channel-Code: TEST" \
  -d @test-reservation.xml

# 3. Test stop-sale
echo "\nTesting stop-sale..."
curl -X POST "http://localhost:8080/api/feeds/stop-sale" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: test-key" \
  -d '{
    "channelId": "TEST",
    "vehicleCategory": "ECAR",
    "startDate": "2025-07-15",
    "endDate": "2025-07-20",
    "reason": "Test stop-sale"
  }'
```

---

## Channel Integration Examples

### Booking.com Integration

1. **Setup**:
   - Register at Booking.com Connectivity
   - Obtain API credentials
   - Configure webhook endpoint: `https://api.nctrental.com/api/webhook/reservation`
   - Set pull feed URL: `https://api.nctrental.com/api/feeds/rates`

2. **Rate Push**:
   - Booking.com pulls rates every 15 minutes
   - Use OTA_VehAvailRateRS format

3. **Reservation Flow**:
   - Booking.com sends OTA_VehResRQ to webhook
   - System confirms with OTA_VehResRS
   - Email sent to customer automatically

### Expedia Integration

1. **Setup**:
   - Register at Expedia Partner Central
   - Configure API endpoints
   - Set commission rate

2. **Inventory Sync**:
   - Expedia pulls inventory every 5 minutes
   - Real-time stop-sale updates

### Skyscanner / Kayak (Metasearch)

1. **Setup**:
   - Register as car rental provider
   - Provide rate feed URL
   - Set redirect URL for bookings

2. **Integration Type**: Click-out model
   - Skyscanner displays rates
   - Customer clicks through to NCT Rental website
   - Commission on completed bookings

---

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│           External Distribution Channels            │
│  (Booking.com, Expedia, Skyscanner, DiscoverCars)  │
└─────────────┬───────────────────────┬───────────────┘
              │                       │
              │ Pull Feeds            │ Push Reservations
              │ (every 15 min)        │ (real-time webhook)
              ▼                       ▼
┌─────────────────────────┐ ┌─────────────────────────┐
│   XmlFeedController     │ │ ReservationWebhook      │
│  /api/feeds/*           │ │ /api/webhook/*          │
└────────┬────────────────┘ └────────┬────────────────┘
         │                           │
         ▼                           ▼
┌─────────────────────────┐ ┌─────────────────────────┐
│   XmlFeedService        │ │ ChannelReservation      │
│   - Generate OTA XML    │ │ Service                 │
│   - Rate calculation    │ │ - Parse XML             │
│   - Inventory sync      │ │ - Process booking       │
└────────┬────────────────┘ └────────┬────────────────┘
         │                           │
         ▼                           ▼
┌──────────────────────────────────────────────────────┐
│              Database Layer                          │
│  - ChannelRatePlan                                   │
│  - ChannelInventory                                  │
│  - ChannelReservation                                │
│  - DistributionChannel                               │
└──────────────────────────────────────────────────────┘
```

---

## Production Deployment Checklist

### Required Environment Variables

```properties
# Channel API Keys
BOOKING_COM_API_KEY=sk_live_booking_...
EXPEDIA_API_KEY=sk_live_expedia_...
SKYSCANNER_API_KEY=sk_live_skyscanner_...

# Webhook Secrets
BOOKING_COM_WEBHOOK_SECRET=whsec_...
EXPEDIA_WEBHOOK_SECRET=whsec_...

# Feed URLs
APP_BASE_URL=https://api.nctrental.com
```

### Security Checklist

- [ ] Implement API key validation for all feed endpoints
- [ ] Implement webhook signature validation (HMAC-SHA256)
- [ ] Enable HTTPS/TLS for all endpoints
- [ ] Set up rate limiting (100 requests/minute per channel)
- [ ] Enable CORS for authorized domains only
- [ ] Implement XML schema validation
- [ ] Set up monitoring and alerts for failed webhooks
- [ ] Enable audit logging for all reservation changes

### Channel Onboarding Steps

1. Create `DistributionChannel` record in database
2. Generate unique API key for channel
3. Configure commission rate and type
4. Set up rate plans for channel
5. Initialize inventory for all vehicle categories
6. Test feed endpoints with channel
7. Test webhook endpoints with sample reservations
8. Go live and monitor first 48 hours

---

## Support & Resources

- **OTA Specification**: http://www.opentravel.org/
- **NCT Rental API**: https://api.nctrental.com/docs
- **Support Email**: support@nctrental.com
- **Developer Portal**: https://developers.nctrental.com

---

**Version**: 2.0.0
**Last Updated**: October 2025
**Maintained By**: NCT Rental Development Team
