package com.carrental.backend.platform;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Year;
import java.time.ZoneId;

/**
 * The public developer portal and the Postman collection. Both are static documents: no keys, no
 * channel data, nothing that depends on who asks, so they can be sent to any broker. The brand is
 * the supplier name brokers see (UR-Drive Jordan by default); the system's own name never appears.
 */
@RestController
public class DeveloperPortalController {

    static final MediaType HTML = new MediaType("text", "html", StandardCharsets.UTF_8);
    static final MediaType JSON = new MediaType("application", "json", StandardCharsets.UTF_8);

    private final String portal;
    private final String postman;

    public DeveloperPortalController(@Value("${platform.public-base-url:https://www.nctrental.com}") String baseUrl,
                                     @Value("${platform.brand-name:UR-Drive Jordan}") String brand) throws IOException {
        String base = baseUrl.replaceAll("/+$", "");
        this.portal = read("/api/portal.html")
            .replace("__BASE__", base)
            .replace("__BRAND__", escape(brand))
            .replace("__YEAR__", String.valueOf(Year.now(ZoneId.of("Asia/Amman")).getValue()));
        this.postman = read("/api/postman-v3.json").replace("https://www.nctrental.com", base);
    }

    @GetMapping({"/ota/developers", "/api/v3/developers"})
    public ResponseEntity<String> portal() {
        return ResponseEntity.ok().contentType(HTML)
            .header("Cache-Control", "public, max-age=300")
            .header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
            .header("X-Content-Type-Options", "nosniff")
            .header("Referrer-Policy", "no-referrer")
            .body(portal);
    }

    @GetMapping({"/api/v3/postman.json", "/ota/postman.json"})
    public ResponseEntity<String> postman() {
        return ResponseEntity.ok().contentType(JSON)
            .header("Cache-Control", "public, max-age=300")
            .header("Content-Disposition", "attachment; filename=\"urdrive-postman.json\"")
            .body(postman);
    }

    private static String read(String path) throws IOException {
        try (InputStream in = DeveloperPortalController.class.getResourceAsStream(path)) {
            if (in == null) throw new IOException("Missing resource " + path);
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static String escape(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
