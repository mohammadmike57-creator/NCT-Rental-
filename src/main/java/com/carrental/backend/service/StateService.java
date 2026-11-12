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

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(StateService.class);

    private final AppDataRepository appDataRepository;
    private final ObjectMapper objectMapper;
    private final org.springframework.context.ApplicationEventPublisher events;
    /** How the main document is stored (one row, or bookings and records in their own tables): see DataStore. */
    private final com.carrental.backend.store.DataStore dataStore;

    private static final String INITIAL_STATE = "{" +
        "\"reservations\":{}," +
        "\"sources\":[" +
            "{\"id\":\"1\",\"name\":\"Website\",\"paymentType\":\"Prepaid\"}," +
            "{\"id\":\"2\",\"name\":\"Phone\",\"paymentType\":\"Pay on Arrival\"}," +
            "{\"id\":\"3\",\"name\":\"Walk-in\",\"paymentType\":\"Pay on Arrival\"}" +
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
        return loadMain().getData();
    }

    /** The data as sent to the app: the same, but without any password fields left in the staff list by older versions. */
    public String getStateForClient() {
        String data = getFullState();
        try {
            JsonNode root = objectMapper.readTree(data);
            if (!(root instanceof ObjectNode o) || !StateSectionGuard.stripPasswords(o.path("users"))) return data;
            return objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            return data;
        }
    }

    public synchronized void mergeState(String updatesJson) {
        mergeState(updatesJson, StateSectionGuard.Writer.SYSTEM);
    }

    /** The older whole-section save, with the same section permissions as {@link #applyPatch(String, StateSectionGuard.Writer)}. */
    public synchronized List<String> mergeState(String updatesJson, StateSectionGuard.Writer writer) {
        List<String> skipped = new java.util.ArrayList<>();
        if (!writer.isAdmin()) {
            try {
                JsonNode current = objectMapper.readTree(loadMain().getData());
                ObjectNode updates = (ObjectNode) objectMapper.readTree(updatesJson);
                for (String key : new java.util.ArrayList<>(iterable(updates.fieldNames()))) {
                    if (StateSectionGuard.maySet(writer, key)) continue;
                    JsonNode own = "users".equals(key) ? StateSectionGuard.ownUserOnly(writer, current.path(key), updates.get(key)) : null;
                    if (own != null) { updates.set(key, own); continue; }
                    if (!updates.get(key).equals(current.path(key))) skipped.add(key);
                    updates.remove(key);
                }
                updatesJson = objectMapper.writeValueAsString(updates);
            } catch (Exception e) {
                throw new RuntimeException("Failed to check the save: " + e.getMessage(), e);
            }
        }
        mergeUnchecked(updatesJson);
        return skipped;
    }

    private static java.util.List<String> iterable(java.util.Iterator<String> it) {
        java.util.List<String> out = new java.util.ArrayList<>();
        it.forEachRemaining(out::add);
        return out;
    }

    private void mergeUnchecked(String updatesJson) {
        // Ensure the document exists before merging
        AppData appData = loadMain();
        autoBackup(appData);

        try {
            JsonNode current = objectMapper.readTree(appData.getData());
            JsonNode updates = objectMapper.readTree(updatesJson);
            JsonNode merged = deepMerge(current, updates);
            String mergedJson = objectMapper.writeValueAsString(merged);
            appData.setData(mergedJson);
            dataStore.saveMain(appData);
        } catch (Exception e) {
            throw new RuntimeException("Failed to merge state: " + e.getMessage(), e);
        }
    }

    private static final int AUTO_BACKUPS_KEPT = 72; // three days of hourly copies
    static final int UPDATE_BACKUPS_KEPT = 10;

    /**
     * Every time a new version of the server starts (each update on Render), a full copy of the data is
     * kept first as "backup-before-update-<time>", before anyone can change anything. These are separate
     * from the hourly copies; the newest 10 are kept. A failed copy never stops the server.
     */
    @org.springframework.context.event.EventListener(org.springframework.boot.context.event.ApplicationReadyEvent.class)
    public synchronized void backupBeforeUpdate() {
        try {
            appDataRepository.findMain().ifPresent(main -> {
                AppData copy = new AppData();
                copy.setId("backup-before-update-" + Instant.now().toString().replace(':', '-'));
                copy.setData(dataStore.readFull(INITIAL_STATE));   // the complete data, also what lives in tables
                appDataRepository.save(copy);
                log.info("Data backup kept before this update: {}", copy.getId());
                List<String> ids = appDataRepository.updateBackupIds();
                for (int i = UPDATE_BACKUPS_KEPT; i < ids.size(); i++) appDataRepository.deleteById(ids.get(i));
            });
        } catch (Exception e) {
            log.warn("Could not keep a backup before this update: {}", e.getMessage());
        }
    }

    /** All the data as one JSON file for an administrator to keep (passwords removed). */
    public String backupFileContent() {
        return getStateForClient();
    }
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

    /** The main row with the data as saved now (never a copy cached earlier in the same request). */
    private AppData loadMain() {
        return dataStore.loadMain(INITIAL_STATE);
    }

    /**
     * Applies precise changes so staff working at the same time never overwrite each other:
     *   {"op":"upsertReservation","year":2026,"month":"October","reservation":{...}}  add or replace one booking (by id)
     *   {"op":"deleteReservation","id":"..."}                                          remove one booking
     *   {"op":"set","key":"fleet","value":[...]}                                        replace one top-level section
     * Writes are serialised, so each change is applied to the latest saved data.
     */
    public synchronized void applyPatch(String patchJson) {
        applyPatch(patchJson, StateSectionGuard.Writer.SYSTEM);
    }

    /**
     * As {@link #applyPatch(String)}, for a signed-in person: sections they may not change are skipped (see
     * {@link StateSectionGuard}). Returns the names of the skipped sections.
     */
    public synchronized List<String> applyPatch(String patchJson, StateSectionGuard.Writer writer) {
        List<String> skipped = new java.util.ArrayList<>();
        AppData appData = loadMain();
        autoBackup(appData);
        try {
            ObjectNode root = (ObjectNode) objectMapper.readTree(appData.getData());
            JsonNode patch = objectMapper.readTree(patchJson);
            JsonNode ops = patch.path("ops");
            // Safety net against a screen that failed to load overwriting everything: deleting many
            // bookings at once needs an explicit flag, and a list holding several items is never emptied.
            // Deleting many bookings at once also needs the "delete all reservations" permission.
            boolean bulkAllowed = patch.path("allowBulkDelete").asBoolean(false) && StateSectionGuard.mayBulkDelete(writer);
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
                    case "deleteReservation" -> {
                        if (refuseDeletes) break;
                        JsonNode existing = findReservation(root, op.path("id").asText(""));
                        if (existing instanceof ObjectNode res && !res.path("channelReservationNumber").asText("").isBlank()) {
                            // A broker booking is never removed: it is cancelled, so the broker is told and the record stays.
                            if (!"CANCELLED".equals(res.path("status").asText())) {
                                JsonNode before = res.deepCopy();
                                res.put("status", "CANCELLED").put("cancelledAt", Instant.now().toString())
                                    .put("cancellationReason", "Cancelled by the supplier").put("lastEditedBy", "Staff (delete)");
                                changed.add(new ReservationChangedEvent(before, res.deepCopy()));
                            }
                        } else {
                            removeReservation(root, op.path("id").asText(), null);
                        }
                    }
                    case "set" -> {
                        String key = op.path("key").asText();
                        JsonNode value = op.path("value");
                        JsonNode existing = root.path(key);
                        if (!StateSectionGuard.maySet(writer, key)) {
                            JsonNode own = "users".equals(key) ? StateSectionGuard.ownUserOnly(writer, existing, value) : null;
                            if (own == null) {
                                if (!value.equals(existing)) skipped.add(key);
                                break;
                            }
                            value = own;
                        }
                        if ("users".equals(key)) { value = value.deepCopy(); StateSectionGuard.stripPasswords(value); }
                        boolean wipesList = value.isArray() && value.size() == 0 && existing.isArray() && existing.size() >= 2;
                        if (!key.isEmpty() && !wipesList) root.set(key, value);
                    }
                    default -> { /* unknown operations are ignored */ }
                }
            }
            appData.setData(objectMapper.writeValueAsString(root));
            dataStore.saveMain(appData);
            // Listeners (e.g. broker webhooks) must never make a save fail.
            for (ReservationChangedEvent e : changed) {
                try { events.publishEvent(e); } catch (Exception ignored) { /* logged by the listener */ }
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to apply changes: " + e.getMessage(), e);
        }
        if (!skipped.isEmpty()) {
            org.slf4j.LoggerFactory.getLogger(StateService.class)
                .warn("Save by {}: skipped section(s) {} (no permission to change them)", writer.email(), skipped);
        }
        return skipped;
    }

    /** Removes a broker booking's copy from the reservations list (staff deleted it under OTA XML). */
    public synchronized void removeBrokerReservation(String id) {
        if (id == null || id.isBlank()) return;
        AppData appData = loadMain();
        try {
            ObjectNode root = (ObjectNode) objectMapper.readTree(appData.getData());
            JsonNode existing = findReservation(root, id);
            if (existing == null || existing.path("channelReservationNumber").asText("").isBlank()) return;   // only broker bookings
            autoBackup(appData);
            removeReservation(root, id, null);
            appData.setData(objectMapper.writeValueAsString(root));
            dataStore.saveMain(appData);
        } catch (Exception e) {
            throw new RuntimeException("Failed to remove the booking: " + e.getMessage(), e);
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
        ObjectNode reservations = objectAt(root, "reservations");
        ObjectNode yearNode = objectAt(reservations, year);
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
            dataStore.saveMain(appData);
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
        dataStore.saveMain(main);
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

    /** The object under {@code key}, created when missing (what ObjectNode.with did); refuses to replace a non-object. */
    private static ObjectNode objectAt(ObjectNode parent, String key) {
        JsonNode existing = parent.get(key);
        if (existing == null || existing.isNull()) return parent.putObject(key);
        if (existing instanceof ObjectNode o) return o;
        throw new IllegalStateException("\"" + key + "\" is not an object");
    }
}
