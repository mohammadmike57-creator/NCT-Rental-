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

    private final String template;
    private final String portal;
    private final String postman;
    private com.carrental.backend.tenant.SupplierRepository suppliers;
    private com.carrental.backend.tenant.SupplierService supplierService;
    private com.carrental.backend.service.StateService state;

    /** For ?supplier=CODE: another supplier's brokers see that supplier's name on the portal. */
    @org.springframework.beans.factory.annotation.Autowired
    void setSuppliers(com.carrental.backend.tenant.SupplierRepository suppliers, com.carrental.backend.tenant.SupplierService supplierService,
                      com.carrental.backend.service.StateService state) {
        this.suppliers = suppliers;
        this.supplierService = supplierService;
        this.state = state;
    }

    public DeveloperPortalController(@Value("${platform.public-base-url:https://www.nctrental.com}") String baseUrl,
                                     @Value("${platform.brand-name:UR-Drive Jordan}") String brand) throws IOException {
        String base = baseUrl.replaceAll("/+$", "");
        this.template = read("/api/portal.html")
            .replace("__BASE__", base)
            .replace("__YEAR__", String.valueOf(Year.now(ZoneId.of("Asia/Amman")).getValue()));
        this.portal = template.replace("__BRAND__", escape(brand));
        this.postman = read("/api/postman-v3.json").replace("https://www.nctrental.com", base);
    }

    @GetMapping({"/ota/developers", "/api/v3/developers"})
    public ResponseEntity<String> portal(@org.springframework.web.bind.annotation.RequestParam(name = "supplier", required = false) String code) {
        String page = portal;
        String name = code == null ? null : supplierName(code);
        if (name != null) page = template.replace("__BRAND__", escape(name));
        return ResponseEntity.ok().contentType(HTML)
            .header("Cache-Control", "public, max-age=300")
            .header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
            .header("X-Content-Type-Options", "nosniff")
            .header("Referrer-Policy", "no-referrer")
            .body(page);
    }

    /** An active supplier's company name, for its own brokers (unknown or inactive: the standard portal). */
    private String supplierName(String code) {
        if (suppliers == null) return null;
        return supplierService.byAddress(code.trim())
            .filter(s -> !com.carrental.backend.tenant.TenantContext.DEFAULT.equals(s.getId()) && supplierService.isActive(s.getId()))
            .map(s -> {
                try {
                    String n = new com.fasterxml.jackson.databind.ObjectMapper().readTree(
                        com.carrental.backend.tenant.TenantContext.call(s.getId(), state::getFullState)).path("companyDetails").path("name").asText("");
                    return n.isBlank() ? s.getName() : n;
                } catch (Exception e) {
                    return s.getName();
                }
            }).orElse(null);
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
