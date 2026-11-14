package com.carrental.backend.tenant;

import com.carrental.backend.repository.AppDataRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.ResponseStatus;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Which supplier owns each broker channel. Brokers address a channel by its code (/ota/v1/{code}/…) and staff
 * screens by its id, so both are unique on the whole platform: a supplier cannot save a channel whose code or
 * id another supplier already uses. A broker call is then answered for the channel's owner only.
 */
@Component
public class ChannelRegistry {

    private static final Logger log = LoggerFactory.getLogger(ChannelRegistry.class);

    private final AppDataRepository documents;
    private final SupplierService suppliers;
    private final ObjectMapper json;
    /** "code:SBK" / "id:a1" → supplier id. */
    private final Map<String, String> owners = new HashMap<>();
    private boolean built;

    public ChannelRegistry(AppDataRepository documents, @Lazy SupplierService suppliers, ObjectMapper json) {
        this.documents = documents;
        this.suppliers = suppliers;
        this.json = json;
    }

    /** The supplier owning the channel with this code (any case) or id. */
    public synchronized Optional<String> owner(String codeOrId) {
        if (codeOrId == null || codeOrId.isBlank()) return Optional.empty();
        build();
        String s = owners.get(codeKey(codeOrId));
        return Optional.ofNullable(s != null ? s : owners.get("id:" + codeOrId));
    }

    /** Refuses a save that would give this supplier a channel code or id another supplier already has. */
    public synchronized void check(String supplier, JsonNode aggregators) {
        if (aggregators == null || !aggregators.isArray()) return;
        build();
        for (JsonNode a : aggregators) {
            String code = a.path("channelCode").asText("").trim();
            String id = a.path("id").asText("").trim();
            if (!code.isEmpty()) {
                String other = owners.get(codeKey(code));
                if (other != null && !other.equals(supplier)) throw new ChannelTakenException("Channel code " + code.toUpperCase(Locale.ROOT)
                    + " is already used on the platform. Choose another code.");
            }
            if (!id.isEmpty()) {
                String other = owners.get("id:" + id);
                if (other != null && !other.equals(supplier)) throw new ChannelTakenException("This channel cannot be saved: its id is already used on the platform.");
            }
        }
    }

    /** Records the supplier's channels as just saved. */
    public synchronized void update(String supplier, JsonNode aggregators) {
        if (!built) return;   // built in full on the next look-up
        owners.values().removeIf(supplier::equals);
        put(supplier, aggregators);
    }

    /** Number of broker channels each supplier has. */
    public synchronized Map<String, Long> channelsPerSupplier() {
        build();
        Map<String, Long> out = new HashMap<>();
        owners.forEach((k, v) -> { if (k.startsWith("id:")) out.merge(v, 1L, Long::sum); });
        return out;
    }

    public synchronized void invalidate() {
        owners.clear();
        built = false;
    }

    private void build() {
        if (built) return;
        owners.clear();
        java.util.Set<String> ids = new java.util.LinkedHashSet<>();
        ids.add(TenantContext.DEFAULT);   // UR-Drive Jordan first: its channels keep their codes whatever happens
        suppliers.all().forEach(s -> ids.add(s.getId()));
        for (String supplier : ids) {
            try {
                String data = documents.currentData(SupplierService.documentId(supplier)).orElse(null);
                if (data != null) put(supplier, json.readTree(data).path("aggregators"));
            } catch (Exception e) {
                log.warn("Channels of supplier {} could not be read: {}", supplier, e.getMessage());
            }
        }
        built = true;
    }

    private void put(String supplier, JsonNode aggregators) {
        if (aggregators == null || !aggregators.isArray()) return;
        for (JsonNode a : aggregators) {
            String code = a.path("channelCode").asText("").trim();
            String id = a.path("id").asText("").trim();
            if (!code.isEmpty()) owners.putIfAbsent(codeKey(code), supplier);
            if (!id.isEmpty()) owners.putIfAbsent("id:" + id, supplier);
        }
    }

    private static String codeKey(String code) { return "code:" + code.trim().toUpperCase(Locale.ROOT); }

    @ResponseStatus(HttpStatus.CONFLICT)
    public static class ChannelTakenException extends RuntimeException {
        public ChannelTakenException(String message) { super(message); }
    }
}
