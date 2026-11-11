package com.carrental.backend.ota;

import com.carrental.backend.ota.ChannelModels.Reservation;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Outbound connectors: UR-Drive calling the broker's own system.
 * <ul>
 *   <li>RATE_FILE: the broker's rate sheet (XML or CSV) sent by HTTPS when rates are published and daily.
 *       The broker's price rules are applied: markup, group markup, amount per day and rounding.</li>
 *   <li>ARI_PUSH: free cars per group per day as JSON, sent when it changes (at most every
 *       minIntervalSeconds) and once a day in full; field names can be mapped to the broker's own.</li>
 *   <li>RES_NOTIFY: each booking created, changed or cancelled, as the OTA answer for that booking
 *       (OTA_VehResRS / OTA_VehModifyRS / OTA_VehCancelRS) or as JSON.</li>
 * </ul>
 * Every message is queued, retried (1, 5, 15, 60, 180, 360 minutes, then every 6 hours) for 24 hours,
 * and written to the delivery log. Test (sandbox) bookings are never sent. Only public HTTPS addresses.
 */
@Service
public class OutboundConnectorService {

    private static final Logger log = LoggerFactory.getLogger(OutboundConnectorService.class);
    static final ObjectMapper JSON = ApiV3Controller.JSON;
    static final ZoneId ZONE = ZoneId.of("Asia/Amman");
    static final int[] RETRY_MINUTES = {1, 5, 15, 60, 180, 360};
    static final Duration GIVE_UP = Duration.ofHours(24);
    static final Set<String> AUTH = Set.of("NONE", "BASIC", "BEARER", "HEADER", "OAUTH2");

    private final OutboundConnectorRepository connectors;
    private final ConnectorSendRepository sends;
    private final ChannelDeliveryLogRepository deliveryLog;
    private final ChannelStateReader channels;
    private final ObjectProvider<ChannelBookingService> core;
    private final SecretBox box;
    private final Map<Long, String[]> tokens = new ConcurrentHashMap<>();   // connector -> {token, expiresAtMillis}
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).followRedirects(HttpClient.Redirect.NEVER).build();

    /** One HTTP call to a broker; replaced in tests. The real one only reaches public HTTPS addresses. */
    interface Sender { Reply send(String url, String method, Map<String, String> headers, String body) throws Exception; }
    record Reply(int status, String body) {}

    Sender sender = (url, method, headers, body) -> {
        HttpRequest.Builder rq = HttpRequest.newBuilder(OutboundUrlGuard.check(url)).timeout(Duration.ofSeconds(20))
            .method(method, HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
        headers.forEach(rq::header);
        HttpResponse<String> res = http.send(rq.build(), OutboundUrlGuard.boundedReply());
        return new Reply(res.statusCode(), res.body());
    };

    public OutboundConnectorService(OutboundConnectorRepository connectors, ConnectorSendRepository sends, ChannelDeliveryLogRepository deliveryLog,
                                    ChannelStateReader channels, ObjectProvider<ChannelBookingService> core, SecretBox box) {
        this.connectors = connectors;
        this.sends = sends;
        this.deliveryLog = deliveryLog;
        this.channels = channels;
        this.core = core;
        this.box = box;
    }

    // ------------------------------------------------------------------ setup

    public List<OutboundConnector> list(String channelId) { return connectors.findByChannelIdOrderByCreatedAtAsc(channelId); }

    public Optional<OutboundConnector> find(String channelId, String publicId) { return connectors.findByChannelIdAndPublicId(channelId, publicId); }

    public OutboundConnector save(String channelId, OutboundConnector existing, JsonNode b, String by) {
        OutboundConnector c = existing != null ? existing : new OutboundConnector();
        if (existing == null) {
            c.setChannelId(channelId);
            c.setPublicId("conn_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12));
            c.setCreatedBy(by);
            try { c.setType(OutboundConnector.Type.valueOf(b.path("type").asText("").toUpperCase(Locale.ROOT))); }
            catch (Exception e) { throw ChannelError.INVALID_REQUEST.ex("type must be RATE_FILE, ARI_PUSH or RES_NOTIFY"); }
        }
        if (b.has("name") || existing == null) {
            String name = b.path("name").asText("").trim();
            c.setName(name.isEmpty() ? c.getType().name().replace('_', ' ').toLowerCase(Locale.ROOT) : name.length() > 80 ? name.substring(0, 80) : name);
        }
        if (b.has("url") || existing == null) c.setUrl(checkUrl(b.path("url").asText(null)));
        if (b.has("method")) {
            String m = b.path("method").asText("POST").toUpperCase(Locale.ROOT);
            if (!m.equals("POST") && !m.equals("PUT")) throw ChannelError.INVALID_REQUEST.ex("method must be POST or PUT");
            c.setMethod(m);
        }
        String format = b.has("format") ? b.path("format").asText("").toUpperCase(Locale.ROOT) : existing == null ? defaultFormat(c.getType()) : c.getFormat();
        Set<String> allowed = switch (c.getType()) { case RATE_FILE -> Set.of("XML", "CSV"); case ARI_PUSH -> Set.of("JSON"); case RES_NOTIFY -> Set.of("XML", "JSON"); };
        if (!allowed.contains(format)) throw ChannelError.INVALID_REQUEST.ex("format for " + c.getType() + " must be one of " + allowed);
        c.setFormat(format);
        if (b.has("authType")) {
            String a = b.path("authType").asText("NONE").toUpperCase(Locale.ROOT);
            if (!AUTH.contains(a)) throw ChannelError.INVALID_REQUEST.ex("authType must be one of " + AUTH);
            c.setAuthType(a);
            if (c.getId() != null) tokens.remove(c.getId());
        }
        if (b.has("authUser")) c.setAuthUser(blank(b.path("authUser").asText(null), 200));
        if (b.has("tokenUrl")) c.setTokenUrl(b.path("tokenUrl").asText("").isBlank() ? null : checkUrl(b.path("tokenUrl").asText()));
        if (b.has("scope")) c.setScope(blank(b.path("scope").asText(null), 300));
        if (b.hasNonNull("secret") && !b.path("secret").asText("").isBlank()) { c.setSecretEnc(box.seal(b.path("secret").asText().trim())); if (c.getId() != null) tokens.remove(c.getId()); }
        if ("HEADER".equals(c.getAuthType()) && (c.getAuthUser() == null || !c.getAuthUser().matches("[A-Za-z0-9-]{1,60}"))) {
            throw ChannelError.INVALID_REQUEST.ex("HEADER authentication needs the header name in authUser, e.g. X-Api-Key");
        }
        if ("OAUTH2".equals(c.getAuthType()) && (c.getTokenUrl() == null || c.getAuthUser() == null)) {
            throw ChannelError.INVALID_REQUEST.ex("OAUTH2 needs tokenUrl and the client id in authUser");
        }
        if (!"NONE".equals(c.getAuthType()) && c.getSecretEnc() == null) throw ChannelError.INVALID_REQUEST.ex("secret is required for " + c.getAuthType());
        if (b.has("fieldMap")) {
            JsonNode fm = b.path("fieldMap");
            if (fm.isNull() || (fm.isObject() && fm.isEmpty())) c.setFieldMap(null);
            else {
                if (!fm.isObject()) throw ChannelError.INVALID_REQUEST.ex("fieldMap must be an object: our field -> broker field");
                fm.fields().forEachRemaining(e -> {
                    if (!e.getValue().isTextual() || !e.getValue().asText().matches("[A-Za-z0-9_.$-]{1,60}")) throw ChannelError.INVALID_REQUEST.ex("fieldMap value for " + e.getKey() + " is not a field name");
                });
                c.setFieldMap(fm.toString());
            }
        }
        if (b.has("dailyHour")) c.setDailyHour(Math.max(-1, Math.min(23, b.path("dailyHour").asInt(3))));
        if (b.has("days")) c.setDays(Math.max(1, Math.min(365, b.path("days").asInt(60))));
        if (b.has("minIntervalSeconds")) c.setMinIntervalSeconds(Math.max(60, Math.min(86_400, b.path("minIntervalSeconds").asInt(300))));
        if (b.has("onPublish")) c.setOnPublish(b.path("onPublish").asBoolean(true));
        if (b.has("enabled")) c.setEnabled(b.path("enabled").asBoolean(true));
        return connectors.save(c);
    }

    public void delete(OutboundConnector c) { if (c.getId() != null) tokens.remove(c.getId()); connectors.delete(c); }

    public ObjectNode view(OutboundConnector c) {
        ObjectNode n = JSON.createObjectNode();
        n.put("id", c.getPublicId()).put("name", c.getName()).put("type", c.getType().name()).put("url", c.getUrl()).put("method", c.getMethod())
         .put("format", c.getFormat()).put("authType", c.getAuthType()).put("authUser", c.getAuthUser()).put("tokenUrl", c.getTokenUrl()).put("scope", c.getScope())
         .put("hasSecret", c.getSecretEnc() != null).put("dailyHour", c.getDailyHour()).put("days", c.getDays()).put("minIntervalSeconds", c.getMinIntervalSeconds())
         .put("onPublish", c.isOnPublish()).put("enabled", c.isEnabled()).put("lastOk", c.isLastOk()).put("lastResult", c.getLastResult())
         .put("lastSentAt", c.getLastSentAt() == null ? null : c.getLastSentAt().toString()).put("createdBy", c.getCreatedBy()).put("createdAt", c.getCreatedAt().toString());
        try { n.set("fieldMap", c.getFieldMap() == null ? JSON.createObjectNode() : JSON.readTree(c.getFieldMap())); } catch (Exception e) { n.putObject("fieldMap"); }
        return n;
    }

    public List<ObjectNode> recentSends(OutboundConnector c, int limit) {
        List<ObjectNode> out = new ArrayList<>();
        for (ConnectorSend s : sends.findByConnectorIdOrderByIdDesc(c.getId(), PageRequest.of(0, Math.max(1, Math.min(limit, 100))))) {
            ObjectNode n = JSON.createObjectNode();
            n.put("id", s.getId()).put("kind", s.getKind()).put("reservationNumber", s.getReservationNumber()).put("status", s.getStatus().name())
             .put("attempts", s.getAttempts()).put("lastHttpStatus", s.getLastHttpStatus()).put("lastError", s.getLastError())
             .put("bytes", s.getBody().length()).put("createdAt", s.getCreatedAt().toString())
             .put("nextAttemptAt", s.getStatus() == ConnectorSend.Status.PENDING && s.getNextAttemptAt() != null ? s.getNextAttemptAt().toString() : null)
             .put("sentAt", s.getSentAt() == null ? null : s.getSentAt().toString());
            out.add(n);
        }
        return out;
    }

    // ------------------------------------------------------------------ what is sent

    /** The broker's rate sheet with its price rules applied (the parts a flat file can carry). */
    String rateFile(ChannelSnapshot ch, OutboundConnector c) {
        ChannelCommercial com = ChannelCommercial.of(ch.raw().path("bookingRules"));
        java.util.function.BiFunction<String, BigDecimal, BigDecimal> daily = (group, amount) -> {
            if (com.neutral()) return amount;
            ChannelCommercial.GroupTerms g = com.groups().get(group.toUpperCase(Locale.ROOT));
            BigDecimal pct = g != null && g.markupPercent() != null ? g.markupPercent() : com.markupPercent();
            return com.adjustDaily(amount, pct);
        };
        if ("XML".equals(c.getFormat())) return OtaXml.rateSheet(ch, daily);
        StringBuilder csv = new StringBuilder("season,from,to,vehicle_group,min_days,max_days,daily_amount,currency\r\n");
        for (JsonNode plan : ch.publishedRatePlans()) {
            for (JsonNode rate : plan.path("sippRates")) {
                String group = rate.path("sippCode").asText("").toUpperCase(Locale.ROOT);
                List<JsonNode> tiers = new ArrayList<>();
                rate.path("tiers").forEach(tiers::add);
                tiers.sort(Comparator.comparingInt(t -> t.path("fromDay").asInt(1)));
                for (JsonNode t : tiers) {
                    BigDecimal amount = daily.apply(group, BigDecimal.valueOf(t.path("dailyPrice").asDouble(0)).setScale(2, RoundingMode.HALF_UP));
                    csv.append(cell(plan.path("name").asText())).append(',').append(plan.path("startDate").asText()).append(',').append(plan.path("endDate").asText())
                       .append(',').append(group).append(',').append(t.path("fromDay").asInt(1)).append(',')
                       .append(t.path("toDay").isNumber() ? String.valueOf(t.path("toDay").asInt()) : "").append(',')
                       .append(amount.toPlainString()).append(',').append(ch.currency()).append("\r\n");
                }
            }
        }
        return csv.toString();
    }

    /** Free cars per group per day, with the broker's own field names when mapped. */
    String availability(ChannelSnapshot ch, OutboundConnector c) {
        ChannelBookingService b = core.getObject();
        ObjectNode inv = b.inventory(b.context(ch, false), c.getDays());
        ObjectNode out = JSON.createObjectNode();
        out.put("supplier", brand(ch));
        out.setAll(inv);
        return write(rename(out, mapOf(c)));
    }

    /** One booking event as the broker would have received it from us on a pull call. */
    String reservation(ChannelSnapshot ch, OutboundConnector c, String event, Reservation r) {
        if ("XML".equals(c.getFormat())) {
            String root = switch (event) { case "reservation.cancelled" -> "OTA_VehCancelRS"; case "reservation.modified" -> "OTA_VehModifyRS"; default -> "OTA_VehResRS"; };
            return OtaBookingXml.reservation(root, null, ch.isProduction(), r, brand(ch));
        }
        ObjectNode n = JSON.createObjectNode();
        n.put("event", event).put("supplier", brand(ch)).put("sentAt", Instant.now().toString());
        n.set("reservation", ApiV3Controller.JSON.valueToTree(r));
        return write(n);
    }

    // ------------------------------------------------------------------ triggers

    /** Booking events (live bookings only) for the channel's booking-notification connectors. */
    public void onEvent(ChannelBookingService.Ctx ctx, String event, Reservation r) {
        if (ctx.sandbox() || !event.startsWith("reservation.")) return;
        for (OutboundConnector c : connectors.findByChannelIdOrderByCreatedAtAsc(ctx.channel().id())) {
            if (!c.isEnabled() || c.getType() != OutboundConnector.Type.RES_NOTIFY) continue;
            try {
                enqueue(c, event, r.reservationId(), contentType(c), reservation(ctx.channel(), c, event, r));
            } catch (Exception e) {
                log.warn("Connector {}: could not queue {}: {}", c.getPublicId(), event, e.getMessage());
            }
        }
    }

    /** Scheduled work (called by ChannelJobs): rate files on publish and daily, availability on change and daily, then due sends. */
    public void tick() {
        LocalDate today = LocalDate.now(ZONE);
        int hour = java.time.LocalTime.now(ZONE).getHour();
        for (OutboundConnector c : connectors.findByEnabledTrue()) {
            try {
                Optional<ChannelSnapshot> found = channels.find(c.getChannelId());
                if (found.isEmpty() || "paused".equalsIgnoreCase(found.get().status())) continue;
                ChannelSnapshot ch = found.get();
                boolean dailyDue = c.getDailyHour() >= 0 && hour >= c.getDailyHour()
                    && (c.getLastDailyAt() == null || LocalDate.ofInstant(c.getLastDailyAt(), ZONE).isBefore(today));
                switch (c.getType()) {
                    case RATE_FILE -> {
                        boolean published = c.isOnPublish() && ch.publishedVersion() > c.getLastRateVersion() && ch.publishedVersion() > 0;
                        if (published || (dailyDue && ch.publishedVersion() > 0)) {
                            enqueue(c, published ? "rates.published" : "rates.daily", null, contentType(c), rateFile(ch, c));
                            c.setLastRateVersion(ch.publishedVersion());
                            if (dailyDue) c.setLastDailyAt(Instant.now());
                            connectors.save(c);
                        }
                    }
                    case ARI_PUSH -> {
                        String body = availability(ch, c);
                        String hash = OAuthService.hex(OAuthService.sha256(body.replaceAll("\"(generated_at|from|to)\":\"[^\"]*\"", "").getBytes(StandardCharsets.UTF_8)));
                        boolean changed = !hash.equals(c.getLastPayloadHash());
                        boolean spaced = c.getLastSentAt() == null || c.getLastSentAt().isBefore(Instant.now().minusSeconds(c.getMinIntervalSeconds()));
                        if ((changed && spaced) || dailyDue) {
                            enqueue(c, changed ? "availability.changed" : "availability.daily", null, contentType(c), body);
                            c.setLastPayloadHash(hash);
                            if (dailyDue) c.setLastDailyAt(Instant.now());
                            c.setLastSentAt(Instant.now());
                            connectors.save(c);
                        }
                    }
                    case RES_NOTIFY -> { }
                }
            } catch (Exception e) {
                log.warn("Connector {} tick: {}", c.getPublicId(), e.getMessage());
            }
        }
        deliverDue();
    }

    /** Sends a real message now (for the console's Test button) and reports what the broker answered. */
    public ObjectNode test(OutboundConnector c) {
        ChannelSnapshot ch = channels.find(c.getChannelId()).orElseThrow(() -> ChannelError.INVALID_REQUEST.ex("Channel not found"));
        String body = switch (c.getType()) {
            case RATE_FILE -> rateFile(ch, c);
            case ARI_PUSH -> availability(ch, c);
            case RES_NOTIFY -> "JSON".equals(c.getFormat())
                ? JSON.createObjectNode().put("event", "connector.test").put("supplier", brand(ch)).put("sentAt", Instant.now().toString()).toString()
                : "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<OTA_PingRS xmlns=\"http://www.opentravel.org/OTA/2003/05\" Version=\"2024.1\"><Success/><EchoData>connector.test</EchoData></OTA_PingRS>";
        };
        ConnectorSend s = enqueue(c, "connector.test", null, contentType(c), body);
        attempt(c, s);
        ObjectNode n = JSON.createObjectNode();
        n.put("ok", s.getStatus() == ConnectorSend.Status.SENT).put("httpStatus", s.getLastHttpStatus()).put("error", s.getLastError()).put("bytes", body.length());
        n.put("preview", body.length() > 4000 ? body.substring(0, 4000) + "\n…" : body);
        return n;
    }

    // ------------------------------------------------------------------ delivery

    ConnectorSend enqueue(OutboundConnector c, String kind, String reservationNumber, String contentType, String body) {
        ConnectorSend s = new ConnectorSend();
        s.setConnectorId(c.getId());
        s.setChannelId(c.getChannelId());
        s.setKind(kind);
        s.setReservationNumber(reservationNumber);
        s.setContentType(contentType);
        s.setBody(body);
        return sends.save(s);
    }

    public void deliverDue() {
        for (ConnectorSend s : sends.findByStatusAndNextAttemptAtBeforeOrderByIdAsc(ConnectorSend.Status.PENDING, Instant.now(), PageRequest.of(0, 50))) {
            Optional<OutboundConnector> c = connectors.findById(s.getConnectorId());
            if (c.isEmpty() || !c.get().isEnabled()) {
                s.setStatus(ConnectorSend.Status.FAILED); s.setLastError(c.isEmpty() ? "Connector removed" : "Connector switched off"); sends.save(s);
                continue;
            }
            // Booking messages leave in order: a later change waits for an earlier one still pending.
            if (s.getReservationNumber() != null
                && sends.existsByConnectorIdAndReservationNumberAndStatusAndIdLessThan(s.getConnectorId(), s.getReservationNumber(), ConnectorSend.Status.PENDING, s.getId())) continue;
            attempt(c.get(), s);
        }
    }

    void attempt(OutboundConnector c, ConnectorSend s) {
        ChannelDeliveryLog entry = new ChannelDeliveryLog();
        entry.setChannelId(c.getChannelId());
        entry.setChannelName(c.getName());
        entry.setDirection(ChannelDeliveryLog.Direction.OUTBOUND);
        entry.setMessageType(("Connector " + c.getType() + " " + s.getKind()).substring(0, Math.min(60, ("Connector " + c.getType() + " " + s.getKind()).length())));
        entry.setActor("connector:" + c.getPublicId());
        entry.setRequestBytes(s.getBody().length());
        long start = System.nanoTime();
        s.setAttempts(s.getAttempts() + 1);
        try {
            Map<String, String> h = new LinkedHashMap<>();
            h.put("Content-Type", s.getContentType());
            h.put("Accept", "application/json, application/xml, text/xml, */*");
            h.put("User-Agent", "UR-Drive-Connector/1.0");
            h.put("X-URD-Event", s.getKind());
            h.put("X-URD-Delivery-Id", "csend_" + s.getId());
            h.put("Idempotency-Key", "csend_" + s.getId());
            String[] auth = authHeader(c);
            if (auth != null) h.put(auth[0], auth[1]);
            Reply res = sender.send(c.getUrl(), c.getMethod(), h, s.getBody());
            s.setLastHttpStatus(res.status());
            entry.setHttpStatus(res.status());
            entry.setResponseSnippet(res.body());
            if (res.status() >= 200 && res.status() < 300) {
                s.setStatus(ConnectorSend.Status.SENT); s.setSentAt(Instant.now()); s.setLastError(null);
                entry.setSuccess(true);
            } else {
                if (res.status() == 401) if (c.getId() != null) tokens.remove(c.getId());
                fail(s, "Broker answered HTTP " + res.status());
                entry.setError(s.getLastError());
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            fail(s, "Interrupted");
        } catch (Exception e) {
            fail(s, e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
            entry.setError(s.getLastError());
        } finally {
            entry.setDurationMs((System.nanoTime() - start) / 1_000_000);
        }
        sends.save(s);
        try { deliveryLog.save(entry); } catch (Exception ignored) { }
        c.setLastOk(s.getStatus() == ConnectorSend.Status.SENT);
        c.setLastResult((s.getStatus() == ConnectorSend.Status.SENT ? "Sent " : "Not sent ") + s.getKind()
            + (s.getLastHttpStatus() == null ? "" : " (HTTP " + s.getLastHttpStatus() + ")") + (s.getLastError() == null ? "" : ": " + trim(s.getLastError(), 300)));
        if (s.getStatus() == ConnectorSend.Status.SENT && c.getType() != OutboundConnector.Type.ARI_PUSH) c.setLastSentAt(Instant.now());
        connectors.save(c);
    }

    private static void fail(ConnectorSend s, String error) {
        s.setLastError(trim(error, 400));
        Instant next = Instant.now().plus(s.getAttempts() <= RETRY_MINUTES.length ? RETRY_MINUTES[s.getAttempts() - 1] : 360, ChronoUnit.MINUTES);
        if (next.isAfter(s.getCreatedAt().plus(GIVE_UP)) || "connector.test".equals(s.getKind())) s.setStatus(ConnectorSend.Status.FAILED);
        else s.setNextAttemptAt(next);
    }

    /** The Authorization (or custom) header for the broker; OAuth tokens are fetched and kept until shortly before they expire. */
    String[] authHeader(OutboundConnector c) throws Exception {
        String secret = c.getSecretEnc() == null ? null : box.open(c.getSecretEnc());
        return switch (c.getAuthType()) {
            case "BASIC" -> new String[] {"Authorization", "Basic " + Base64.getEncoder().encodeToString(((c.getAuthUser() == null ? "" : c.getAuthUser()) + ":" + secret).getBytes(StandardCharsets.UTF_8))};
            case "BEARER" -> new String[] {"Authorization", "Bearer " + secret};
            case "HEADER" -> new String[] {c.getAuthUser(), secret};
            case "OAUTH2" -> new String[] {"Authorization", "Bearer " + oauthToken(c, secret)};
            default -> null;
        };
    }

    private String oauthToken(OutboundConnector c, String secret) throws Exception {
        String[] cached = tokens.get(c.getId());
        if (cached != null && Long.parseLong(cached[1]) > System.currentTimeMillis() + 60_000) return cached[0];
        String form = "grant_type=client_credentials" + (c.getScope() == null ? "" : "&scope=" + URLEncoder.encode(c.getScope(), StandardCharsets.UTF_8));
        Map<String, String> h = new LinkedHashMap<>();
        h.put("Content-Type", "application/x-www-form-urlencoded");
        h.put("Accept", "application/json");
        h.put("Authorization", "Basic " + Base64.getEncoder().encodeToString((URLEncoder.encode(c.getAuthUser(), StandardCharsets.UTF_8) + ":"
            + URLEncoder.encode(secret, StandardCharsets.UTF_8)).getBytes(StandardCharsets.UTF_8)));
        Reply res = sender.send(c.getTokenUrl(), "POST", h, form);
        if (res.status() != 200) throw new IllegalStateException("Token request answered HTTP " + res.status());
        JsonNode t = JSON.readTree(res.body());
        String token = t.path("access_token").asText("");
        if (token.isEmpty()) throw new IllegalStateException("Token answer has no access_token");
        long ttl = Math.max(60, t.path("expires_in").asLong(3600));
        tokens.put(c.getId(), new String[] {token, String.valueOf(System.currentTimeMillis() + ttl * 1000)});
        return token;
    }

    // ------------------------------------------------------------------ helpers

    static String contentType(OutboundConnector c) {
        return switch (c.getFormat()) { case "XML" -> "application/xml; charset=UTF-8"; case "CSV" -> "text/csv; charset=UTF-8"; default -> "application/json; charset=UTF-8"; };
    }

    private static String defaultFormat(OutboundConnector.Type t) { return t == OutboundConnector.Type.ARI_PUSH ? "JSON" : "XML"; }

    private static Map<String, String> mapOf(OutboundConnector c) {
        Map<String, String> m = new HashMap<>();
        if (c.getFieldMap() == null) return m;
        try { JSON.readTree(c.getFieldMap()).fields().forEachRemaining(e -> m.put(e.getKey(), e.getValue().asText())); } catch (Exception ignored) { }
        return m;
    }

    /** Renames object keys everywhere in the tree (our name -> the broker's). */
    static JsonNode rename(JsonNode n, Map<String, String> map) {
        if (map.isEmpty()) return n;
        if (n.isObject()) {
            ObjectNode out = JSON.createObjectNode();
            n.fields().forEachRemaining(e -> out.set(map.getOrDefault(e.getKey(), e.getKey()), rename(e.getValue(), map)));
            return out;
        }
        if (n.isArray()) {
            ArrayNode out = JSON.createArrayNode();
            n.forEach(x -> out.add(rename(x, map)));
            return out;
        }
        return n;
    }

    private static String checkUrl(String url) {
        if (url == null || url.isBlank()) throw ChannelError.INVALID_REQUEST.ex("url is required");
        try {
            OutboundUrlGuard.check(url.trim());
        } catch (Exception e) {
            String m = e.getMessage() == null ? "" : e.getMessage();
            if (!m.startsWith("Endpoint host could not be resolved")) throw ChannelError.INVALID_REQUEST.ex("url must be a public HTTPS address: " + m);
        }
        return url.trim();
    }

    /** The supplier name brokers see on connector messages; never the system's own name. */
    static String brand(ChannelSnapshot ch) {
        String v = ch.vendorName();
        return v == null || v.isBlank() || v.toUpperCase(Locale.ROOT).contains("NCT") ? "UR-Drive Jordan" : v;
    }

    private static String cell(String s) {
        String v = s == null ? "" : s;
        if (v.startsWith("=") || v.startsWith("+") || v.startsWith("-") || v.startsWith("@")) v = "'" + v;   // no formulas in spreadsheets
        return v.contains(",") || v.contains("\"") || v.contains("\n") ? "\"" + v.replace("\"", "\"\"") + "\"" : v;
    }

    /** JSON text with plain decimals (150.00, never 1.5E+2). */
    static String write(JsonNode n) {
        try { return JSON.writeValueAsString(n); } catch (Exception e) { throw new IllegalStateException(e); }
    }

    private static String blank(String s, int max) { return s == null || s.isBlank() ? null : s.trim().length() > max ? s.trim().substring(0, max) : s.trim(); }

    private static String trim(String s, int max) { return s == null ? null : s.length() > max ? s.substring(0, max) : s; }
}
