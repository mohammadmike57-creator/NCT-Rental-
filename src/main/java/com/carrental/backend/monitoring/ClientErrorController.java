package com.carrental.backend.monitoring;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Screens that crash in a staff member's browser report here (signed-in staff only, 20 per hour each). */
@RestController
public class ClientErrorController {

    static final int LIMIT_PER_HOUR = 20;

    public record ClientError(String message, String stack, String screen, String url, String userAgent) {}

    private final ErrorMonitor monitor;
    private final Map<String, long[]> counts = new ConcurrentHashMap<>();

    public ClientErrorController(ErrorMonitor monitor) { this.monitor = monitor; }

    @PostMapping("/api/client-errors")
    public ResponseEntity<Map<String, String>> report(@RequestBody ClientError e, Authentication auth) {
        String user = auth == null ? "unknown" : auth.getName();
        if (!allowed(user)) return ResponseEntity.status(429).body(Map.of("error", "Too many error reports."));
        String screen = e.screen() == null || e.screen().isBlank() ? "unknown screen" : e.screen();
        String ref = monitor.report("browser", "Screen “" + clip(screen, 60) + "” failed: " + clip(e.message(), 200),
                "Screen: " + clip(screen, 60) + "\nPage: " + clip(e.url(), 200) + "\nBrowser: " + clip(e.userAgent(), 200) + "\n\n" + clip(e.stack(), 3000), user);
        return ResponseEntity.ok(Map.of("reference", ref));
    }

    private boolean allowed(String user) {
        long hour = Instant.now().getEpochSecond() / 3600;
        long[] c = counts.compute(user, (k, v) -> v == null || v[0] != hour ? new long[]{hour, 0} : v);
        synchronized (c) { return ++c[1] <= LIMIT_PER_HOUR; }
    }

    private static String clip(String s, int n) {
        if (s == null) return "";
        return s.length() <= n ? s : s.substring(0, n) + "…";
    }
}
