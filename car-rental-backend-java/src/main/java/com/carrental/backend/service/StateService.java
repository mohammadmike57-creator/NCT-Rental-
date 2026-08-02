package com.carrental.backend.service;

import com.carrental.backend.model.AppData;
import com.carrental.backend.repository.AppDataRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class StateService {

    private final AppDataRepository appDataRepository;
    private final ObjectMapper objectMapper;

    private static final String INITIAL_STATE = "{" +
        "\"reservations\":{}," +
        "\"sources\":[" +
            "{\"id\":\"1\",\"name\":\"Website\",\"paymentType\":\"PREPAID\"}," +
            "{\"id\":\"2\",\"name\":\"Phone\",\"paymentType\":\"PAY_ON_ARRIVAL\"}," +
            "{\"id\":\"3\",\"name\":\"Walk-in\",\"paymentType\":\"PAY_ON_ARRIVAL\"}" +
        "]," +
        "\"fleet\":[" +
            "{\"id\":\"v1\",\"modelName\":\"Toyota Corolla\",\"licensePlate\":\"\",\"registrationExpiry\":\"2026-12-31\",\"category\":\"Economy\",\"securityDeposit\":200,\"excess\":500,\"sippCode\":\"EDMR\",\"transmission\":\"AUTOMATIC\"}," +
            "{\"id\":\"v2\",\"modelName\":\"Hyundai Accent\",\"licensePlate\":\"\",\"registrationExpiry\":\"2026-12-31\",\"category\":\"Economy\",\"securityDeposit\":200,\"excess\":500,\"sippCode\":\"EDMR\",\"transmission\":\"AUTOMATIC\"}," +
            "{\"id\":\"v3\",\"modelName\":\"Kia Sportage\",\"licensePlate\":\"\",\"registrationExpiry\":\"2026-12-31\",\"category\":\"SUV\",\"securityDeposit\":300,\"excess\":700,\"sippCode\":\"IFAR\",\"transmission\":\"AUTOMATIC\"}" +
        "]," +
        "\"companyDetails\":{" +
            "\"name\":\"UR-Drive Jordan\",\"subName\":\"NCT Car Rental LLC\",\"address\":\"Amman, Jordan\",\"phone\":\"+962 7 9999 9999\",\"email\":\"contact@urdrive.com\",\"taxNumber\":\"123456789\",\"requirePaymentApproval\":false" +
        "}," +
        "\"trafficTickets\":[]," +
        "\"vehicleDamages\":[]," +
        "\"users\":[]," +
        "\"expenses\":[]," +
        "\"rentalLocations\":[" +
            "{\"id\":\"loc1\",\"name\":\"Amman\",\"address\":\"Amman, Jordan\"}," +
            "{\"id\":\"loc2\",\"name\":\"Aqaba\",\"address\":\"Aqaba, Jordan\"}," +
            "{\"id\":\"loc3\",\"name\":\"Dead Sea\",\"address\":\"Dead Sea, Jordan\"}" +
        "]," +
        "\"messages\":[]," +
        "\"invoices\":[]," +
        "\"availableExtras\":[]," +
        "\"franchisePayments\":[]," +
        "\"activityLog\":[]," +
        "\"aggregators\":[]," +
        "\"stopSales\":[]," +
        "\"years\":[2025,2026]" +
    "}";

    public String getFullState() {
        AppData appData = appDataRepository.findMain()
                .orElseGet(() -> {
                    AppData newData = new AppData();
                    newData.setId("main");
                    newData.setData(INITIAL_STATE);
                    return appDataRepository.save(newData);
                });
        return appData.getData();
    }

    public void mergeState(String updatesJson) {
        // Ensure the document exists before merging
        AppData appData = appDataRepository.findMain()
                .orElseGet(() -> {
                    AppData newData = new AppData();
                    newData.setId("main");
                    newData.setData(INITIAL_STATE);
                    return appDataRepository.save(newData);
                });

        try {
            JsonNode current = objectMapper.readTree(appData.getData());
            JsonNode updates = objectMapper.readTree(updatesJson);
            JsonNode merged = deepMerge(current, updates);
            String mergedJson = objectMapper.writeValueAsString(merged);
            appData.setData(mergedJson);
            appDataRepository.save(appData);
        } catch (Exception e) {
            throw new RuntimeException("Failed to merge state: " + e.getMessage(), e);
        }
    }

    private JsonNode deepMerge(JsonNode source, JsonNode target) {
        if (source.isObject() && target.isObject()) {
            ObjectNode merged = objectMapper.createObjectNode();
            merged.setAll((ObjectNode) source);
            target.fields().forEachRemaining(entry -> {
                String key = entry.getKey();
                JsonNode targetValue = entry.getValue();
                JsonNode sourceValue = source.get(key);
                if (sourceValue != null && sourceValue.isObject() && targetValue.isObject()) {
                    merged.set(key, deepMerge(sourceValue, targetValue));
                } else {
                    merged.set(key, targetValue);
                }
            });
            return merged;
        }
        return target;
    }
}
