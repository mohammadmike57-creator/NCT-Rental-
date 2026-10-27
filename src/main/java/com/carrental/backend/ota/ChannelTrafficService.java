package com.carrental.backend.ota;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The traffic log: every broker call in full, masked, plus the statistics staff and brokers look at
 * first (volume, error rate, response times, look-to-book).
 */
@Service
public class ChannelTrafficService {

    private static final Logger log = LoggerFactory.getLogger(ChannelTrafficService.class);
    static final int MAX_REQUEST = 64 * 1024, MAX_RESPONSE = 256 * 1024;
    /** Request attribute set by the SOAP endpoint and the staff console (clients cannot set attributes). */
    static final String FORMAT_ATTR = "nct.channel.format";
    static final String RAW_BODY_ATTR = "nct.channel.rawBody";

    private static final Pattern[] SECRETS = {
        Pattern.compile("(<(?:\\w+:)?(?:ApiKey|PasswordHash|Password)>)([^<]*)(</)"),
        Pattern.compile("(MessagePassword=\")([^\"]*)(\")"),
        Pattern.compile("(\"(?:api_key|apiKey|password|cvv|cvc)\"\\s*:\\s*\")([^\"]*)(\")", Pattern.CASE_INSENSITIVE),
        Pattern.compile("(SeriesCode=\")([^\"]*)(\")"),
    };
    /** 13–19 digit card-like numbers (spaces or dashes allowed, not part of a reference like ABC-123…): keep the last four. */
    private static final Pattern CARD = Pattern.compile("(?<![\\w.-])(?:\\d[ -]?){12,18}\\d(?![\\w.])");
    private static final Pattern RSV = Pattern.compile("RSV-\\d{4}-\\d{6}");
    private static final Set<String> SEARCHES = Set.of("OTA_VehAvailRate", "XML Availability", "REST availability");
    private static final Set<String> BOOKINGS = Set.of("OTA_VehRes", "XML ReservationCreate", "REST create");

    private final ChannelMessageRepository messages;
    private final int retentionDays;

    public ChannelTrafficService(ChannelMessageRepository messages, @Value("${channel.traffic.retention-days:30}") int retentionDays) {
        this.messages = messages;
        this.retentionDays = Math.max(1, retentionDays);
    }

    public void record(ChannelSnapshot ch, HttpServletRequest http, String operation, String requestBody, String requestId,
                       int status, boolean success, String errorCode, String errorMessage, String responseBody, long ms, String remote,
                       boolean sandbox) {
        try {
            Object raw = http == null ? null : http.getAttribute(RAW_BODY_ATTR);
            String req = raw instanceof String r ? r : requestBody;
            if ((req == null || req.isBlank()) && http != null) {
                req = http.getMethod() + " " + http.getRequestURI() + (http.getQueryString() == null ? "" : "?" + http.getQueryString());
            }
            ChannelMessage m = new ChannelMessage();
            m.setChannelId(ch.id());
            m.setRequestId(requestId);
            m.setFormat(format(http, operation));
            m.setOperation(operation.length() > 60 ? operation.substring(0, 60) : operation);
            m.setHttpStatus(status);
            m.setSuccess(success);
            m.setErrorCode(errorCode);
            m.setErrorMessage(errorMessage == null ? null : errorMessage.length() > 500 ? errorMessage.substring(0, 500) : errorMessage);
            m.setDurationMs(ms);
            m.setRequestBytes(req == null ? 0 : req.length());
            m.setResponseBytes(responseBody == null ? 0 : responseBody.length());
            m.setRemoteIp(remote == null ? null : remote.length() > 64 ? remote.substring(0, 64) : remote);
            m.setSandbox(sandbox);
            m.setRequestBody(clip(mask(req), MAX_REQUEST));
            m.setResponseBody(clip(mask(responseBody), MAX_RESPONSE));
            Matcher rsv = RSV.matcher((responseBody == null ? "" : responseBody) + " " + (req == null ? "" : req));
            if (rsv.find()) m.setReservationNumber(rsv.group());
            m.setCreatedAt(Instant.now());
            messages.save(m);
        } catch (Exception e) {
            log.warn("Could not record broker message for {}: {}", ch.id(), e.getMessage());   // never break a broker response
        }
    }

    static String format(HttpServletRequest http, String operation) {
        Object f = http == null ? null : http.getAttribute(FORMAT_ATTR);
        if (f instanceof String s) return s;
        if (operation.startsWith("XML ")) return "XML";
        if (operation.startsWith("REST ")) return "REST";
        return "OTA";
    }

    static String mask(String s) {
        if (s == null || s.isEmpty()) return s;
        String out = s;
        for (Pattern p : SECRETS) out = p.matcher(out).replaceAll("$1•••••$3");
        Matcher m = CARD.matcher(out);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            String digits = m.group().replaceAll("[ -]", "");
            boolean luhn = luhn(digits);
            m.appendReplacement(sb, Matcher.quoteReplacement(luhn ? "•••• •••• •••• " + digits.substring(digits.length() - 4) : m.group()));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    /** Only real card numbers (Luhn-valid) are masked, so phone numbers and references stay readable. */
    private static boolean luhn(String d) {
        int sum = 0;
        boolean alt = false;
        for (int i = d.length() - 1; i >= 0; i--) {
            int n = d.charAt(i) - '0';
            if (alt) { n *= 2; if (n > 9) n -= 9; }
            sum += n;
            alt = !alt;
        }
        return sum % 10 == 0;
    }

    private static String clip(String s, int max) {
        if (s == null || s.length() <= max) return s;
        return s.substring(0, max) + "\n… [truncated, " + s.length() + " characters in total]";
    }

    public List<ChannelMessage> search(String channelId, int hours, String operation, String result, String q, int limit) {
        String query = q == null ? "" : q.trim();
        return messages.search(channelId, Instant.now().minus(Math.max(1, Math.min(hours, 24 * retentionDays)), ChronoUnit.HOURS),
            operation == null ? "" : operation, result == null ? "" : result, query,
            query.isEmpty() ? "" : "%" + query.toLowerCase(Locale.ROOT).replace("%", "").replace("_", "") + "%",
            PageRequest.of(0, Math.max(1, Math.min(limit, 500))));
    }

    public Optional<ChannelMessage> get(String channelId, long id) {
        return messages.findById(id).filter(m -> m.getChannelId().equals(channelId));
    }

    /** Volume, errors, response times (average, p95, max), look-to-book and an hourly series. */
    public Map<String, Object> stats(String channelId, int hours) {
        int h = Math.max(1, Math.min(hours, 24 * 30));
        Instant since = Instant.now().minus(h, ChronoUnit.HOURS);
        List<Object[]> rows = messages.statsRows(channelId, since);
        long total = rows.size(), errors = 0, searches = 0, bookings = 0, sum = 0, max = 0;
        List<Long> durations = new ArrayList<>();
        Map<String, long[]> byOp = new TreeMap<>();          // calls, errors, total ms
        Map<String, Long> byError = new TreeMap<>();
        boolean hourly = h <= 72;
        int buckets = hourly ? h : (int) Math.ceil(h / 24.0);
        long[][] series = new long[buckets][2];
        ChronoUnit unit = hourly ? ChronoUnit.HOURS : ChronoUnit.DAYS;
        Instant nowT = Instant.now().truncatedTo(unit);
        for (Object[] r : rows) {
            long ms = ((Number) r[0]).longValue();
            String op = (String) r[1];
            boolean ok = (Boolean) r[2];
            String err = (String) r[3];
            Instant at = (Instant) r[4];
            durations.add(ms);
            sum += ms;
            max = Math.max(max, ms);
            long[] o = byOp.computeIfAbsent(op, k -> new long[3]);
            o[0]++; o[2] += ms;
            if (!ok) { errors++; o[1]++; if (err != null) byError.merge(err, 1L, Long::sum); }
            if (SEARCHES.contains(op)) searches++;
            if (BOOKINGS.contains(op) && ok) bookings++;
            long back = unit.between(at.truncatedTo(unit), nowT);     // 0 = the current hour / day
            int i = (int) (buckets - 1 - back);
            if (i >= 0 && i < buckets) {
                series[i][0]++;
                if (!ok) series[i][1]++;
            }
        }
        Collections.sort(durations);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("hours", h);
        out.put("calls", total);
        out.put("errors", errors);
        out.put("errorRate", total == 0 ? 0 : Math.round(errors * 1000.0 / total) / 10.0);
        out.put("avgMs", total == 0 ? 0 : sum / total);
        out.put("p95Ms", durations.isEmpty() ? 0 : durations.get((int) Math.min(durations.size() - 1, Math.ceil(durations.size() * 0.95) - 1)));
        out.put("maxMs", max);
        out.put("searches", searches);
        out.put("bookings", bookings);
        out.put("lookToBook", bookings == 0 ? null : Math.round(searches * 10.0 / bookings) / 10.0);
        List<Map<String, Object>> ops = new ArrayList<>();
        byOp.forEach((k, v) -> ops.add(Map.of("operation", k, "calls", v[0], "errors", v[1], "avgMs", v[0] == 0 ? 0 : v[2] / v[0])));
        ops.sort((a, b) -> Long.compare((Long) b.get("calls"), (Long) a.get("calls")));
        out.put("operations", ops);
        List<Map<String, Object>> errs = new ArrayList<>();
        byError.forEach((k, v) -> errs.add(Map.of("code", k, "count", v)));
        errs.sort((a, b) -> Long.compare((Long) b.get("count"), (Long) a.get("count")));
        out.put("errorCodes", errs);
        List<Map<String, Object>> ser = new ArrayList<>();
        for (int i = 0; i < buckets; i++) {
            Instant at = nowT.minus(buckets - 1 - i, unit);
            ser.add(Map.of("at", at.toString(), "calls", series[i][0], "errors", series[i][1]));
        }
        out.put("series", ser);
        out.put("retentionDays", retentionDays);
        return out;
    }

    public int purge() {
        return messages.purge(Instant.now().minus(retentionDays, ChronoUnit.DAYS));
    }
}
