package com.carrental.backend.ota;

import com.carrental.backend.service.StateService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import com.carrental.backend.tenant.ChannelRegistry;
import com.carrental.backend.tenant.SupplierService;
import com.carrental.backend.tenant.TenantContext;
import org.springframework.stereotype.Service;

import java.util.Optional;

/**
 * Looks up distribution channels in the application state document.
 * The frontend is the system of record for channel configuration, so the
 * server reads the same JSON instead of keeping a second copy.
 */
@Service
@RequiredArgsConstructor
public class ChannelStateReader {

    private final StateService stateService;
    private final ObjectMapper objectMapper;
    private final ChannelRegistry registry;
    private final SupplierService suppliers;

    /**
     * Finds a channel by its partner-facing channel code (case-insensitive) or by internal id.
     *
     * Only the owner's channels are found: when the request already works for a supplier (staff signed in, or a
     * job for one supplier) another supplier's channel is "not found". A broker call is not tied to a supplier yet;
     * finding its channel ties the rest of the call to the channel's owner, so everything it reads or books is
     * that supplier's.
     */
    public Optional<ChannelSnapshot> find(String codeOrId) {
        if (codeOrId == null || codeOrId.isBlank()) return Optional.empty();
        Optional<String> owner = registry.owner(codeOrId);
        if (owner.isEmpty()) return Optional.empty();
        if (TenantContext.isBound()) {
            if (!owner.get().equals(TenantContext.current())) return Optional.empty();
        } else {
            // A paused supplier, or one whose package has no OTA XML, answers no broker.
            if (!suppliers.isActive(owner.get()) || !suppliers.planOf(owner.get()).hasXml()) return Optional.empty();
            TenantContext.bind(owner.get());
        }
        return findOwn(codeOrId);
    }

    private Optional<ChannelSnapshot> findOwn(String codeOrId) {
        JsonNode state = readState();
        JsonNode aggregators = state.get("aggregators");
        if (aggregators == null || !aggregators.isArray()) return Optional.empty();

        JsonNode byId = null;
        for (JsonNode agg : aggregators) {
            String code = ChannelSnapshot.text(agg, "channelCode", "");
            if (!code.isBlank() && code.equalsIgnoreCase(codeOrId)) {
                return Optional.of(new ChannelSnapshot(agg, state.get("fleet"), state.get("stopSales"), state.path("companyDetails").path("name").asText("")));
            }
            if (codeOrId.equals(ChannelSnapshot.text(agg, "id", null))) byId = agg;
        }
        return Optional.ofNullable(byId).map(agg -> new ChannelSnapshot(agg, state.get("fleet"), state.get("stopSales"), state.path("companyDetails").path("name").asText("")));
    }

    /**
     * Every channel: the current supplier's when the work is for one supplier, otherwise (background jobs) the
     * channels of every active supplier. Each carries its {@link ChannelSnapshot#supplierId()}; a job works on it
     * inside {@code TenantContext.run(ch.supplierId(), …)}.
     */
    public java.util.List<ChannelSnapshot> all() {
        if (TenantContext.isBound()) return allOwn();
        java.util.List<ChannelSnapshot> out = new java.util.ArrayList<>();
        for (String supplier : suppliers.activeIds()) {
            if (suppliers.planOf(supplier).hasXml()) out.addAll(TenantContext.call(supplier, this::allOwn));   // CRM-only: no broker work
        }
        return out;
    }

    private java.util.List<ChannelSnapshot> allOwn() {
        JsonNode state = readState();
        java.util.List<ChannelSnapshot> out = new java.util.ArrayList<>();
        JsonNode aggregators = state.get("aggregators");
        if (aggregators != null && aggregators.isArray()) {
            for (JsonNode agg : aggregators) out.add(new ChannelSnapshot(agg, state.get("fleet"), state.get("stopSales"), state.path("companyDetails").path("name").asText("")));
        }
        return out;
    }

    /** Why the platform does not let this supplier's brokers make this call (test or live access switched off), or null. */
    public String accessProblem(String supplierId, boolean sandbox) {
        if (TenantContext.DEFAULT.equals(supplierId)) return null;
        return suppliers.find(supplierId).map(s -> sandbox
            ? (s.isTestAccess() ? null : "Test access is not enabled for this supplier")
            : (s.isLiveAccess() ? null : "Live access is not enabled for this supplier yet")).orElse(null);
    }

    /** The supplier owning a channel (by code or id), for background work that must run as that supplier. */
    public Optional<String> ownerOf(String codeOrId) { return registry.owner(codeOrId); }

    /** Runs background work for one channel as its owner; nothing runs for a channel nobody owns. */
    public void asOwner(String channelId, Runnable work) {
        registry.owner(channelId).ifPresent(owner -> TenantContext.run(owner, work));
    }

    private JsonNode readState() {
        try {
            return objectMapper.readTree(stateService.getFullState());
        } catch (Exception e) {
            throw new IllegalStateException("Application state is not valid JSON", e);
        }
    }
}
