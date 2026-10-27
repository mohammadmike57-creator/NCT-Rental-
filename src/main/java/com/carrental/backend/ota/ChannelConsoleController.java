package com.carrental.backend.ota;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The XML test console for staff: sends a real broker message to a channel exactly as a broker would,
 * but always in the sandbox (nothing is booked for real, no webhooks) and without the broker's key.
 *
 *   POST /api/channels/{id}/console   {"format": "OTA|SOAP|XML|REST", "operation": "...", "method": "GET|POST|PATCH", "body": "..."}
 *
 * OTA: the message root decides the operation. SOAP: a full envelope. XML: operation = native operation name.
 * REST: operation = the path after /partner/v1/{channel}, e.g. "/availability" or "/reservations/RSV-2026-000123/cancel".
 */
@RestController
@RequestMapping("/api/channels/{channelId}")
public class ChannelConsoleController {

    private static final Pattern RES = Pattern.compile("^/reservations/([^/]+)(/cancel)?$");

    private final ChannelStateReader channels;
    private final OtaBookingController ota;
    private final OtaSoapController soap;
    private final NativeXmlController nativeXml;
    private final PartnerRestController rest;

    public ChannelConsoleController(ChannelStateReader channels, OtaBookingController ota, OtaSoapController soap,
                                    NativeXmlController nativeXml, PartnerRestController rest) {
        this.channels = channels;
        this.ota = ota;
        this.soap = soap;
        this.nativeXml = nativeXml;
        this.rest = rest;
    }

    @PostMapping("/console")
    public ResponseEntity<?> send(@PathVariable String channelId, @RequestBody Map<String, String> in, HttpServletRequest http, Authentication auth) {
        if (auth == null || auth.getAuthorities().stream().noneMatch(a -> ChannelGatewayAdminController.PERMISSION.equals(a.getAuthority()))) {
            return ResponseEntity.status(403).body(Map.of("error", "You need Channel Manager access for this."));
        }
        Optional<ChannelSnapshot> found = channels.find(channelId);
        if (found.isEmpty()) return ResponseEntity.status(404).body(Map.of("error", "Channel not found"));
        ChannelSnapshot ch = found.get();
        String format = in.getOrDefault("format", "OTA").toUpperCase(Locale.ROOT);
        String body = in.getOrDefault("body", "");
        String op = in.getOrDefault("operation", "").trim();
        String method = in.getOrDefault("method", "POST").toUpperCase(Locale.ROOT);
        if (body.length() > OtaRequestParser.MAX_REQUEST_BYTES) return ResponseEntity.badRequest().body(Map.of("error", "The message is too large"));

        String rid = "CONSOLE-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT);
        HttpServletRequest req = new Sandboxed(http, rid);
        req.setAttribute(ChannelGateway.CONSOLE_ATTR, ch.id());
        req.setAttribute(ChannelGateway.CONSOLE_ATTR + ".user", auth.getName());
        String code = ch.urlCode();
        long t = System.nanoTime();
        ResponseEntity<String> r;
        try {
            r = switch (format) {
                case "OTA" -> {
                    String root = rootName(body);
                    if (root == null || !OtaBookingController.MESSAGES.contains(root)) {
                        throw new IllegalArgumentException("The message must be one of " + String.join(", ", new TreeSet<>(OtaBookingController.MESSAGES)));
                    }
                    yield ota.dispatch(code, root, body, null, "console-" + rid, req);
                }
                case "SOAP" -> soap.call(code, body, "console-" + rid, req);
                case "XML" -> nativeXml.handle(op, body, req);
                case "REST" -> rest(code, method, op, body, req);
                default -> throw new IllegalArgumentException("Format must be OTA, SOAP, XML or REST");
            };
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", r.getStatusCode().value());
        out.put("durationMs", (System.nanoTime() - t) / 1_000_000);
        out.put("requestId", Optional.ofNullable(r.getHeaders().getFirst("X-Request-ID")).orElse(rid));
        out.put("contentType", r.getHeaders().getContentType() == null ? null : r.getHeaders().getContentType().toString());
        out.put("body", r.getBody());
        return ResponseEntity.ok(out);
    }

    private ResponseEntity<String> rest(String code, String method, String path, String body, HttpServletRequest req) {
        String p = path.startsWith("/") ? path : "/" + path;
        String query = "";
        int q = p.indexOf('?');
        if (q >= 0) { query = p.substring(q + 1); p = p.substring(0, q); }
        Map<String, String> params = new HashMap<>();
        for (String kv : query.split("&")) { int e = kv.indexOf('='); if (e > 0) params.put(kv.substring(0, e), kv.substring(e + 1)); }
        Matcher m = RES.matcher(p);
        return switch (method + " " + p) {
            case "GET /locations" -> rest.locations(code, req);
            case "GET /vehicle-groups" -> rest.groups(code, req);
            case "GET /extras" -> rest.extras(code, req);
            case "GET /coverages" -> rest.coverages(code, req);
            case "GET /ping" -> rest.ping(code, req);
            case "GET /inventory" -> rest.inventory(code, params.containsKey("days") ? Integer.valueOf(params.get("days")) : null, req);
            case "POST /availability" -> rest.availability(code, body, req);
            case "POST /quotes" -> rest.quote(code, body, req);
            case "POST /rate-rules" -> rest.rateRules(code, body, req);
            case "POST /reservations" -> rest.create(code, body, "console-" + UUID.randomUUID(), req);
            case "GET /reservations" -> rest.list(code, params.getOrDefault("from", ""), params.getOrDefault("to", ""), params.get("status"),
                Integer.parseInt(params.getOrDefault("page", "1")), Integer.parseInt(params.getOrDefault("size", "50")), req);
            default -> {
                if (p.startsWith("/locations/") && "GET".equals(method)) yield rest.location(code, p.substring(11), req);
                if (m.matches() && m.group(2) == null && "GET".equals(method)) yield rest.get(code, m.group(1), req);
                if (m.matches() && m.group(2) == null && "PATCH".equals(method)) yield rest.modify(code, m.group(1), body, req);
                if (m.matches() && m.group(2) != null && "POST".equals(method)) yield rest.cancel(code, m.group(1), body, req);
                throw new IllegalArgumentException("Unknown REST call " + method + " " + p);
            }
        };
    }

    /** The local name of the first element, without parsing the whole message. */
    static String rootName(String xml) {
        Matcher m = Pattern.compile("<(?:[\\w-]+:)?(OTA_\\w+RQ)[\\s>/]").matcher(xml == null ? "" : xml);
        return m.find() ? m.group(1) : null;
    }

    /** The staff request as a broker request: no credentials, always sandbox, its own request id. */
    private static final class Sandboxed extends HttpServletRequestWrapper {
        private final String rid;
        Sandboxed(HttpServletRequest r, String rid) { super(r); this.rid = rid; }
        @Override public String getHeader(String name) {
            return switch (name.toLowerCase(Locale.ROOT)) {
                case "authorization", "x-api-key", "idempotency-key" -> null;
                case "x-environment" -> "sandbox";
                case "x-request-id" -> rid;
                default -> super.getHeader(name);
            };
        }
        @Override public String getMethod() { return "POST"; }
        @Override public String getQueryString() { return null; }
    }
}
