package com.carrental.backend.service;

import com.carrental.backend.model.AppData;
import com.carrental.backend.repository.AppDataRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class StateService {

    private final AppDataRepository appDataRepository;
    private final ObjectMapper objectMapper;
    private final org.springframework.context.ApplicationEventPublisher events;

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

    // Every read-modify-write below is synchronised and saves (and commits) before releasing the lock,
    // so concurrent saves are applied one after another on the latest data. (No @Transactional here:
    // it would commit after the lock is released and let a parallel save read stale data.)
    public synchronized String getFullState() {
        AppData appData = appDataRepository.findMain()
                .orElseGet(() -> {
                    AppData newData = new AppData();
                    newData.setId("main");
                    newData.setData(INITIAL_STATE);
                    return appDataRepository.save(newData);
                });
        return appData.getData();
    }

    public synchronized void mergeState(String updatesJson) {
        // Ensure the document exists before merging
        AppData appData = appDataRepository.findMain()
                .orElseGet(() -> {
                    AppData newData = new AppData();
                    newData.setId("main");
                    newData.setData(INITIAL_STATE);
                    return appDataRepository.save(newData);
                });
        autoBackup(appData);

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

    private static final int AUTO_BACKUPS_KEPT = 72; // three days of hourly copies
    private Instant lastAutoBackup;

    /**
     * Before data changes, keeps a full copy of the data as an "auto-<timestamp>" row at most once an
     * hour (and on the first change after the server starts), so any mistake can be restored.
     */
    private void autoBackup(AppData current) {
        try {
            Instant now = Instant.now();
            if (lastAutoBackup != null && now.isBefore(lastAutoBackup.plusSeconds(3600))) return;
            AppData copy = new AppData();
            copy.setId("auto-" + now.toString().replace(':', '-'));
            copy.setData(current.getData());
            appDataRepository.save(copy);
            lastAutoBackup = now;
            List<String> ids = appDataRepository.autoBackupIds();
            for (int i = AUTO_BACKUPS_KEPT; i < ids.size(); i++) appDataRepository.deleteById(ids.get(i));
        } catch (Exception e) {
            // A failed backup must never block saving.
        }
    }

    private AppData loadMain() {
        return appDataRepository.findMain().orElseGet(() -> {
            AppData newData = new AppData();
            newData.setId("main");
            newData.setData(INITIAL_STATE);
            return appDataRepository.save(newData);
        });
    }

    /**
     * Applies precise changes so staff working at the same time never overwrite each other:
     *   {"op":"upsertReservation","year":2026,"month":"October","reservation":{...}}  add or replace one booking (by id)
     *   {"op":"deleteReservation","id":"..."}                                          remove one booking
     *   {"op":"set","key":"fleet","value":[...]}                                        replace one top-level section
     * Writes are serialised, so each change is applied to the latest saved data.
     */
    public synchronized void applyPatch(String patchJson) {
        AppData appData = loadMain();
        autoBackup(appData);
        try {
            ObjectNode root = (ObjectNode) objectMapper.readTree(appData.getData());
            JsonNode patch = objectMapper.readTree(patchJson);
            JsonNode ops = patch.path("ops");
            // Safety net against a screen that failed to load overwriting everything: deleting many
            // bookings at once needs an explicit flag, and a list holding several items is never emptied.
            boolean bulkAllowed = patch.path("allowBulkDelete").asBoolean(false);
            int deletes = 0;
            for (JsonNode op : ops) if ("deleteReservation".equals(op.path("op").asText())) deletes++;
            boolean refuseDeletes = deletes > 3 && !bulkAllowed;
            List<ReservationChangedEvent> changed = new java.util.ArrayList<>();
            for (JsonNode op : ops) {
                switch (op.path("op").asText()) {
                    case "upsertReservation" -> {
                        JsonNode before = findReservation(root, op.path("reservation").path("id").asText(""));
                        upsertReservation(root, op.path("year").asText(), op.path("month").asText(), op.path("reservation"));
                        changed.add(new ReservationChangedEvent(before == null ? null : before.deepCopy(), op.path("reservation")));
                    }
                    case "deleteReservation" -> { if (!refuseDeletes) removeReservation(root, op.path("id").asText(), null); }
                    case "set" -> {
                        String key = op.path("key").asText();
                        JsonNode value = op.path("value");
                        JsonNode existing = root.path(key);
                        boolean wipesList = value.isArray() && value.size() == 0 && existing.isArray() && existing.size() >= 2;
                        if (!key.isEmpty() && !wipesList) root.set(key, value);
                    }
                    default -> { /* unknown operations are ignored */ }
                }
            }
            appData.setData(objectMapper.writeValueAsString(root));
            appDataRepository.save(appData);
            // Listeners (e.g. broker webhooks) must never make a save fail.
            for (ReservationChangedEvent e : changed) {
                try { events.publishEvent(e); } catch (Exception ignored) { /* logged by the listener */ }
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to apply changes: " + e.getMessage(), e);
        }
    }

    /** The booking with this id, wherever it is filed, or null. */
    private JsonNode findReservation(ObjectNode root, String id) {
        if (id.isEmpty()) return null;
        JsonNode years = root.path("reservations");
        for (Iterator<JsonNode> y = years.elements(); y.hasNext(); ) {
            for (Iterator<JsonNode> m = y.next().elements(); m.hasNext(); ) {
                JsonNode list = m.next();
                if (list.isArray()) for (JsonNode r : list) if (id.equals(r.path("id").asText())) return r;
            }
        }
        return null;
    }

    private void upsertReservation(ObjectNode root, String year, String month, JsonNode reservation) {
        String id = reservation.path("id").asText("");
        if (id.isEmpty() || year.isEmpty() || month.isEmpty()) return;
        ObjectNode reservations = root.with("reservations");
        ObjectNode yearNode = reservations.with(year);
        JsonNode bucket = yearNode.get(month);
        ArrayNode target = bucket instanceof ArrayNode ? (ArrayNode) bucket : yearNode.putArray(month);
        // Replace in place when it is already in this month, otherwise move it here.
        for (int i = 0; i < target.size(); i++) {
            if (id.equals(target.get(i).path("id").asText())) {
                target.set(i, reservation);
                removeReservation(root, id, target);
                return;
            }
        }
        removeReservation(root, id, null);
        target.add(reservation);
    }

    /** Removes a booking by id from every month, except from {@code keep}. */
    private void removeReservation(ObjectNode root, String id, ArrayNode keep) {
        JsonNode reservations = root.path("reservations");
        if (!reservations.isObject() || id.isEmpty()) return;
        reservations.fields().forEachRemaining(y -> {
            if (!y.getValue().isObject()) return;
            y.getValue().fields().forEachRemaining(m -> {
                if (!(m.getValue() instanceof ArrayNode arr) || arr == keep) return;
                for (Iterator<JsonNode> it = arr.elements(); it.hasNext(); ) {
                    if (id.equals(it.next().path("id").asText())) it.remove();
                }
            });
        });
    }

    /** Sections an administrator can clear; everything else (company details, terms, staff, settings) is kept. */
    public static final Map<String, String> CLEARABLE = Map.of(
        "reservations", "{}",
        "fleet", "[]",
        "trafficTickets", "[]",
        "vehicleDamages", "[]",
        "invoices", "[]",
        "expenses", "[]",
        "franchisePayments", "[]",
        "messages", "[]",
        "stopSales", "[]"
    );

    /**
     * Clears the chosen sections after saving a full copy of the data as a backup row
     * ("backup-<timestamp>") in the same table. Returns the backup id.
     */
    public synchronized String clearSections(List<String> sections, String by) {
        AppData appData = loadMain();
        try {
            String backupId = "backup-" + Instant.now().toString().replace(':', '-');
            AppData backup = new AppData();
            backup.setId(backupId);
            backup.setData(appData.getData());
            appDataRepository.save(backup);

            ObjectNode root = (ObjectNode) objectMapper.readTree(appData.getData());
            for (String key : sections) {
                String empty = CLEARABLE.get(key);
                if (empty != null) root.set(key, objectMapper.readTree(empty));
            }
            appData.setData(objectMapper.writeValueAsString(root));
            appDataRepository.save(appData);
            return backupId;
        } catch (Exception e) {
            throw new RuntimeException("Failed to clear data: " + e.getMessage(), e);
        }
    }

    /** Backup copies with what they hold, newest first. */
    public List<Map<String, Object>> listBackups() {
        List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (String id : appDataRepository.backupIds()) {
            appDataRepository.findById(id).ifPresent(b -> {
                Map<String, Object> row = new java.util.LinkedHashMap<>();
                row.put("id", id);
                row.put("kind", id.startsWith("auto-") ? "automatic" : "manual");
                try {
                    JsonNode d = objectMapper.readTree(b.getData());
                    int[] bookings = {0};
                    d.path("reservations").fields().forEachRemaining(y -> y.getValue().fields().forEachRemaining(m -> bookings[0] += m.getValue().size()));
                    row.put("bookings", bookings[0]);
                    row.put("fleet", d.path("fleet").size());
                    row.put("sources", d.path("sources").size());
                    row.put("company", d.path("companyDetails").path("name").asText(""));
                } catch (Exception ignored) { }
                row.put("size", b.getData() == null ? 0 : b.getData().length());
                out.add(row);
            });
        }
        return out;
    }

    /** Replaces the live data with a backup copy, after keeping the current data as a backup too. */
    public synchronized String restoreBackup(String id) {
        if (id == null || !(id.startsWith("auto-") || id.startsWith("backup-"))) throw new IllegalArgumentException("Unknown backup");
        AppData source = appDataRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("Backup not found"));
        AppData main = loadMain();
        String safetyId = "backup-before-restore-" + Instant.now().toString().replace(':', '-');
        AppData safety = new AppData();
        safety.setId(safetyId);
        safety.setData(main.getData());
        appDataRepository.save(safety);
        main.setData(source.getData());
        appDataRepository.save(main);
        return safetyId;
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
