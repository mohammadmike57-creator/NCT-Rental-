# NCT Rental — Partner XML API

Server-to-server XML API for distribution partners (brokers, OTAs, metasearch).
Rates are served from the **last published version** for your channel; stop sales are applied live.

## Authentication

Each channel has its own feed key, created by NCT staff in
**OTA XML → channel → Connection → Partner access**. Send it on every request:

```
Authorization: Bearer <feed-key>
```
or
```
X-Api-Key: <feed-key>
```

Unknown channels and wrong keys both return `401`. Paused channels return `403`.
Limit: 120 requests per minute per channel and client address (`429` when exceeded).

## Endpoints

Base URL: `https://<api-host>/ota/v1/{channelCode}` — e.g. `/ota/v1/BKG`.

| Method | Path                | Body / parameters                                   | Response              |
|--------|---------------------|-----------------------------------------------------|-----------------------|
| POST   | `/OTA_VehAvailRate` | `OTA_VehAvailRateRQ` (OTA 2003/05)                  | `OTA_VehAvailRateRS`  |
| GET    | `/OTA_VehAvailRate` | `pickUp`, `return` (ISO date-time), `equip` (codes) | `OTA_VehAvailRateRS`  |
| GET    | `/ratesheet`        | —                                                   | `RateSheet` (NCT 1.0) |
| GET    | `/ping`             | —                                                   | `OTA_PingRS`          |

### Availability & rates request

```xml
<OTA_VehAvailRateRQ xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="abc123">
  <VehAvailRQCore>
    <VehRentalCore PickUpDateTime="2026-11-03T10:00:00" ReturnDateTime="2026-11-06T10:00:00">
      <PickUpLocation LocationCode="AMM"/>
    </VehRentalCore>
  </VehAvailRQCore>
  <SpecialEquipPrefs>
    <SpecialEquipPref EquipType="13" Quantity="1"/>
  </SpecialEquipPrefs>
</OTA_VehAvailRateRQ>
```

- Rental days = every started 24 hours (minimum 1). The season is chosen by pick-up date.
- The daily rate comes from the length-of-rental tier that contains the rental days.
- `VehAvailCore/@Status` is `Available`, `OnRequest` (group not in fleet) or `Closed` (stop sale or no rate).
- Requested equipment is priced per day, capped at the per-rental maximum when one is set.
- `EchoToken` is returned unchanged.

### Errors

```xml
<OTA_VehAvailRateRS xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.000">
  <Errors>
    <Error Type="3" Code="400" ShortText="ReturnDateTime must be after PickUpDateTime"/>
  </Errors>
</OTA_VehAvailRateRS>
```

DTDs and external entities are rejected. Maximum request size is 64 KB.

## Rate pushes (NCT → partner)

When a channel has an endpoint URL, publishing a new rate version POSTs the `RateSheet`
document to that URL (`Content-Type: application/xml`), with headers `X-Message-Type: RateSheet`
and `X-Rate-Version: <n>`. Authentication is HTTP Basic (username + API key) when both are
configured, otherwise `Authorization: Bearer <API key>`. Any `2xx` response counts as delivered.
Only public HTTPS endpoints are accepted; redirects are not followed.

Every push and every partner request is recorded in the channel's delivery log.
