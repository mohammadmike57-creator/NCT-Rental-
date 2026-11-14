package com.carrental.backend.tenant;

import com.carrental.backend.service.StateService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * GET /auth/branding?code=XYZ (no sign-in): what a supplier's own sign-in page (/s/XYZ) shows. Only the public face:
 * name, logo, colour and sign-in line. Unknown, paused or closed suppliers, and the switch off, answer "not found".
 */
@RestController
public class BrandingController {

    private final SupplierRepository suppliers;
    private final SupplierService supplierService;
    private final StateService state;
    private final ObjectMapper json;

    public BrandingController(SupplierRepository suppliers, SupplierService supplierService, StateService state, ObjectMapper json) {
        this.suppliers = suppliers;
        this.supplierService = supplierService;
        this.state = state;
        this.json = json;
    }

    @GetMapping("/auth/branding")
    public ResponseEntity<?> branding(@RequestParam String code) {
        // The supplier's own address, or its code (both keep working).
        Supplier s = supplierService.byAddress(code).orElse(null);
        if (s == null || TenantContext.DEFAULT.equals(s.getId()) || !supplierService.isActive(s.getId())) {
            return ResponseEntity.status(404).body(Map.of("error", "Not found"));
        }
        JsonNode company;
        try {
            company = json.readTree(TenantContext.call(s.getId(), state::getFullState)).path("companyDetails");
        } catch (Exception e) {
            company = json.createObjectNode();
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("code", s.getCode());
        m.put("slug", s.slugOrCode());
        m.put("name", company.path("name").asText(s.getName()).isBlank() ? s.getName() : company.path("name").asText(s.getName()));
        String logo = company.path("logoUrl").asText("");
        // Only an uploaded image or a data URL; anything else (another site) is not shown on the sign-in page.
        m.put("logoUrl", logo.startsWith("/api/media/") || logo.startsWith("data:image/") ? logo : null);
        String color = company.path("brandColor").asText("");
        m.put("brandColor", color.matches("^#[0-9a-fA-F]{6}$") ? color : null);
        String tagline = company.path("signInTagline").asText("");
        m.put("signInTagline", tagline.length() > 90 ? tagline.substring(0, 90) : tagline);
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(5))).body(m);
    }
}
