package com.carrental.backend.ota;

import com.carrental.backend.service.StateService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
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

    /** Finds a channel by its partner-facing channel code (case-insensitive) or by internal id. */
    public Optional<ChannelSnapshot> find(String codeOrId) {
        if (codeOrId == null || codeOrId.isBlank()) return Optional.empty();
        JsonNode state = readState();
        JsonNode aggregators = state.get("aggregators");
        if (aggregators == null || !aggregators.isArray()) return Optional.empty();

        JsonNode byId = null;
        for (JsonNode agg : aggregators) {
            String code = ChannelSnapshot.text(agg, "channelCode", "");
            if (!code.isBlank() && code.equalsIgnoreCase(codeOrId)) {
                return Optional.of(new ChannelSnapshot(agg, state.get("fleet"), state.get("stopSales")));
            }
            if (codeOrId.equals(ChannelSnapshot.text(agg, "id", null))) byId = agg;
        }
        return Optional.ofNullable(byId).map(agg -> new ChannelSnapshot(agg, state.get("fleet"), state.get("stopSales")));
    }

    private JsonNode readState() {
        try {
            return objectMapper.readTree(stateService.getFullState());
        } catch (Exception e) {
            throw new IllegalStateException("Application state is not valid JSON", e);
        }
    }
}
