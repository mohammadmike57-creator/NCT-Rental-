package com.carrental.backend.platform;

import com.carrental.backend.ota.ChannelError;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Public facts for brokers and the developer portal: the error catalogue and a health check of the broker
 * platform. No credentials, no channel data. The plain /health used by the hosting platform is unchanged.
 */
@RestController
public class PlatformInfoController {

    static final ZoneId OPERATIONS = ZoneId.of("Asia/Amman");
    private final JdbcTemplate jdbc;

    public PlatformInfoController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Every error code the broker APIs return, with its HTTP status, OTA type and code, and what to do. */
    @GetMapping("/ota/errors")
    public ResponseEntity<Map<String, Object>> errors() {
        List<Map<String, Object>> list = new ArrayList<>();
        for (ChannelError e : ChannelError.values()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("code", e.name());
            m.put("httpStatus", e.http.value());
            m.put("otaType", e.otaType);
            m.put("otaCode", e.otaCode);
            m.put("meaning", e.meaning);
            m.put("retryable", e == ChannelError.SYSTEM_ERROR || e == ChannelError.RATE_LIMIT_EXCEEDED);
            m.put("brokerAction", e.brokerAction);
            list.add(m);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "success");
        body.put("timestamp", Instant.now().truncatedTo(ChronoUnit.SECONDS).toString());
        body.put("errors", list);
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(1, TimeUnit.HOURS).cachePublic()).body(body);
    }

    /** Is the broker platform able to serve: the database answers, and the operational clock. */
    @GetMapping("/ota/health")
    public ResponseEntity<Map<String, Object>> health() {
        long t0 = System.nanoTime();
        boolean db;
        try {
            Integer one = jdbc.queryForObject("SELECT 1", Integer.class);
            db = one != null && one == 1;
        } catch (Exception e) {
            db = false;
        }
        long dbMs = (System.nanoTime() - t0) / 1_000_000;
        Map<String, Object> database = new LinkedHashMap<>();
        database.put("status", db ? "UP" : "DOWN");
        database.put("latencyMs", dbMs);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", db ? "UP" : "DOWN");
        body.put("timestamp", Instant.now().truncatedTo(ChronoUnit.SECONDS).toString());
        body.put("timeZone", OPERATIONS.getId());
        body.put("localTime", ZonedDateTime.now(OPERATIONS).truncatedTo(ChronoUnit.SECONDS).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        body.put("apiVersions", List.of("ota-1.0", "ota-2018A-1.0", "ota-2024A-1.0", "xml-1.0", "partner-1.0", "3.0.0"));
        body.put("components", Map.of("database", database));
        return ResponseEntity.status(db ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
            .cacheControl(CacheControl.noStore()).body(body);
    }
}
