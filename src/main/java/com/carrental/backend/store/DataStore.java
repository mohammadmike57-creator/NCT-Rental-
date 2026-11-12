package com.carrental.backend.store;

import com.carrental.backend.model.AppData;
import com.carrental.backend.repository.AppDataRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.*;

/**
 * Where the business data is kept. The rest of the server works on one JSON document (reservations, fleet,
 * invoices, settings...); this class decides how that document is stored, chosen with STORAGE_MODE:
 *
 * <ul>
 *   <li><b>document</b> (default): as before, the whole document in one row of app_data.</li>
 *   <li><b>dual</b>: the document as before, and every booking and record also in its own table row.
 *       Reading still uses the document. Used to fill and check the tables.</li>
 *   <li><b>tables</b>: bookings and records are read from their tables; the document is still written in full,
 *       so going back to "dual" or "document" is instant.</li>
 *   <li><b>tables-only</b>: bookings and records live only in their tables; the document keeps settings and the
 *       month/year layout. Switching back to any other mode rebuilds the full document from the tables.</li>
 * </ul>
 *
 * In every mode except "document", each change or deletion of a booking keeps the previous version in
 * store_booking_history. Lists keep their exact order. A section whose items have no unique "id" stays in the
 * document (it is reported by {@link #check()}).
 */
@Component
public class DataStore {

    private static final Logger log = LoggerFactory.getLogger(DataStore.class);

    /** List sections kept one item per row in store_records. */
    public static final List<String> RECORD_SECTIONS = List.of(
        "fleet", "invoices", "trafficTickets", "vehicleDamages", "expenses", "franchisePayments", "messages");
    static final String RESERVATIONS = "reservations";
    /** Written into the document in tables-only mode: which sections live in tables. Never sent to the app. */
    static final String META = "_storage";
    static final String MARKER_ID = "storage-tables-ready";

    public enum Mode {
        DOCUMENT, DUAL, TABLES, TABLES_ONLY;
        static Mode parse(String s) {
            String v = s == null ? "" : s.trim().toLowerCase(Locale.ROOT).replace('_', '-');
            return switch (v) {
                case "dual" -> DUAL;
                case "tables" -> TABLES;
                case "tables-only" -> TABLES_ONLY;
                default -> DOCUMENT;
            };
        }
        boolean writesTables() { return this != DOCUMENT; }
        /** The document is still complete and saved first; the tables are an extra copy that may lag behind. */
        boolean documentLeads() { return this == DUAL || this == TABLES; }
        boolean readsTables() { return this == TABLES || this == TABLES_ONLY; }
    }

    private final AppDataRepository documents;
    private final StoredBookingRepository bookings;
    private final StoredRecordRepository records;
    private final BookingHistoryRepository history;
    private final TransactionTemplate tx;
    private final ObjectMapper json = new ObjectMapper();
    private final Mode mode;

    /** What the tables hold now (key -> position + data), so a save writes only what changed. */
    private Map<String, String> bookingCache;
    private final Map<String, Map<String, String>> recordCache = new HashMap<>();
    /** The last stored document and the full document built from it, so frequent reads cost nothing. */
    private String lastStored;
    private String assembledCache;
    /** When updating the table copy last failed (dual / tables): it is not retried on every read. */
    private volatile Instant copyFailedAt;
    static final long COPY_RETRY_SECONDS = 600;
    private com.carrental.backend.monitoring.ErrorMonitor monitor;

    /** Problems with the table copy are reported (Activity Log -> System errors, and ALERT_EMAIL). */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setMonitor(com.carrental.backend.monitoring.ErrorMonitor monitor) { this.monitor = monitor; }

    public DataStore(AppDataRepository documents, StoredBookingRepository bookings, StoredRecordRepository records,
                     BookingHistoryRepository history, TransactionTemplate tx, @Value("${storage.mode:${STORAGE_MODE:document}}") String mode) {
        this.documents = documents;
        this.bookings = bookings;
        this.records = records;
        this.history = history;
        this.tx = tx;
        this.mode = Mode.parse(mode);
        log.info("Data storage mode: {}", this.mode.name().toLowerCase(Locale.ROOT).replace('_', '-'));
    }

    public Mode mode() { return mode; }

    // ------------------------------------------------------------------ reading

    /**
     * The main document with all data, as the rest of the server knows it. {@code initial} is used when there is
     * no data yet. The returned AppData is the stored row; {@link #saveMain(AppData)} writes it back.
     */
    public synchronized AppData loadMain(String initial) {
        AppData main = documents.findMain().orElseGet(() -> {
            AppData fresh = new AppData();
            fresh.setId("main");
            fresh.setData(initial);
            return documents.save(fresh);
        });
        documents.currentMainData().ifPresent(main::setData);
        if (mode == Mode.DOCUMENT && !main.getData().contains("\"" + META + "\"")) return main;   // as before
        try {
            String stored = main.getData();
            if (stored.equals(lastStored) && assembledCache != null) { main.setData(assembledCache); return main; }
            ObjectNode doc = (ObjectNode) json.readTree(stored);
            boolean split = doc.has(META);
            if (mode.writesTables() && !tablesReady()) {
                if (mode.documentLeads()) tryFillTables(doc);   // never stops reading: the document is complete
                else fillTables(doc);
            }
            if (split || (mode.readsTables() && tablesReady())) main.setData(json.writeValueAsString(assemble(doc, split)));
            lastStored = stored;
            assembledCache = main.getData();
        } catch (Exception e) {
            throw new IllegalStateException("The stored data could not be read: " + e.getMessage(), e);
        }
        return main;
    }

    /** The full document as text (for backups and the download). */
    public String readFull(String initial) {
        return loadMain(initial).getData();
    }

    // ------------------------------------------------------------------ writing

    /** Saves the full document given by the rest of the server, in the way the storage mode says. */
    public synchronized void saveMain(AppData main) {
        if (!mode.writesTables()) {
            documents.save(main);
            return;
        }
        if (mode.documentLeads()) {
            saveDocumentThenCopy(main);
            return;
        }
        try {
            ObjectNode full = (ObjectNode) json.readTree(main.getData());
            full.remove(META);
            tx.executeWithoutResult(status -> {
                Set<String> inTables = syncTables(full);
                AppData row = documents.findMain().orElse(main);
                String stored = write(mode == Mode.TABLES_ONLY ? splitDocument(full, inTables) : full);
                row.setData(stored);
                documents.save(row);
                main.setData(write(full));
                lastStored = stored;
                assembledCache = main.getData();
            });
        } catch (RuntimeException e) {
            invalidateCaches();
            throw e;
        } catch (Exception e) {
            invalidateCaches();
            throw new IllegalStateException("The data could not be saved: " + e.getMessage(), e);
        }
    }

    /**
     * dual / tables: the complete document is saved first, exactly as in "document" mode, so a save never depends
     * on the tables. Then the tables are brought up to date. If that fails the save still stands: the problem is
     * reported, and the tables are rebuilt from the complete document later (reading uses the document meanwhile).
     */
    private void saveDocumentThenCopy(AppData main) {
        ObjectNode full;
        try {
            full = (ObjectNode) json.readTree(main.getData());
        } catch (Exception e) {
            throw new IllegalStateException("The data could not be saved: " + e.getMessage(), e);
        }
        boolean hadMeta = full.remove(META) != null;
        String stored = hadMeta ? write(full) : main.getData();
        main.setData(stored);
        documents.save(main);
        lastStored = null;
        assembledCache = null;
        if (!tablesReady()) {
            tryFillTables(full);
            return;
        }
        try {
            tx.executeWithoutResult(status -> syncTables(full));
        } catch (RuntimeException e) {
            copyFailed(e);
        }
    }

    /** Fills the tables from the complete document; on failure reports it and carries on with the document. */
    private void tryFillTables(ObjectNode doc) {
        Instant failed = copyFailedAt;
        if (failed != null && failed.plusSeconds(COPY_RETRY_SECONDS).isAfter(Instant.now())) return;
        try {
            fillTables(doc);
            copyFailedAt = null;
        } catch (RuntimeException e) {
            copyFailed(e);
        }
    }

    private void copyFailed(RuntimeException e) {
        invalidateCaches();
        copyFailedAt = Instant.now();
        try {
            documents.deleteById(MARKER_ID);   // rebuilt from the complete document on a later read
        } catch (RuntimeException ignored) {
            // the marker stays; the next check still shows any difference
        }
        String text = "The extra table copy of the data (STORAGE_MODE=" + mode.name().toLowerCase(Locale.ROOT).replace('_', '-')
            + ") could not be updated. The save itself succeeded and nothing is lost; the copy is rebuilt automatically. "
            + e.getMessage();
        log.error(text, e);
        if (monitor != null) monitor.report("server", text, String.valueOf(e), null);
    }

    // ------------------------------------------------------------------ checking

    /** Compares the document with the tables, section by section (meaningful while the document is complete). */
    public synchronized Map<String, Object> check() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("mode", mode.name().toLowerCase(Locale.ROOT).replace('_', '-'));
        out.put("tablesReady", tablesReady());
        try {
            ObjectNode doc = (ObjectNode) json.readTree(documents.currentMainData().orElse("{}"));
            boolean split = doc.has(META);
            out.put("documentComplete", !split);
            List<Map<String, Object>> sections = new ArrayList<>();
            boolean allMatch = true;
            // Bookings: count and money per month, and every booking exactly.
            Map<String, Object> b = new LinkedHashMap<>();
            b.put("section", RESERVATIONS);
            JsonNode fromTables = bookingsFromTables(doc.path(RESERVATIONS));
            if (!manageableBookings(doc.path(RESERVATIONS))) {
                b.put("status", "kept in the document (bookings without a unique id)");
            } else if (split) {
                b.put("status", "in tables only");
                b.put("items", countBookings(fromTables));
            } else {
                boolean same = fromTables.equals(doc.path(RESERVATIONS));
                allMatch &= same || !tablesReady();
                b.put("status", !tablesReady() ? "tables not filled yet" : same ? "identical" : "DIFFERENT");
                b.put("items", countBookings(doc.path(RESERVATIONS)));
                b.put("months", monthTotals(doc.path(RESERVATIONS), fromTables));
            }
            sections.add(b);
            for (String section : RECORD_SECTIONS) {
                Map<String, Object> s = new LinkedHashMap<>();
                s.put("section", section);
                JsonNode docList = doc.path(section);
                JsonNode tableList = recordsFromTables(section);
                if (!manageableList(docList)) {
                    s.put("status", "kept in the document (items without a unique id)");
                } else if (split && inTables(doc, section)) {
                    s.put("status", "in tables only");
                    s.put("items", tableList.size());
                } else {
                    boolean same = tableList.equals(docList.isMissingNode() ? json.createArrayNode() : docList);
                    allMatch &= same || !tablesReady();
                    s.put("status", !tablesReady() ? "tables not filled yet" : same ? "identical" : "DIFFERENT");
                    s.put("items", docList.size());
                    s.put("inTables", tableList.size());
                }
                sections.add(s);
            }
            out.put("sections", sections);
            out.put("allMatch", allMatch);
            out.put("deletedBookingsKept", history.findTop100ByActionOrderByChangedAtDesc("DELETED").size());
        } catch (Exception e) {
            out.put("error", e.getMessage());
            out.put("allMatch", false);
        }
        return out;
    }

    /** Earlier versions of a booking (by its booking number), newest first. */
    public List<BookingHistory> historyOf(String bookingId) {
        return history.findTop50ByBookingIdOrderByChangedAtDesc(bookingId);
    }

    /** The most recently deleted bookings, newest first. */
    public List<BookingHistory> recentlyDeleted() {
        return history.findTop100ByActionOrderByChangedAtDesc("DELETED");
    }

    // ------------------------------------------------------------------ internals

    private boolean tablesReady() {
        return documents.findById(MARKER_ID).isPresent();
    }

    /** First switch to a table mode: copy everything from the document into the tables. */
    private void fillTables(ObjectNode doc) {
        tx.executeWithoutResult(status -> {
            syncTables(doc);
            AppData marker = new AppData();
            marker.setId(MARKER_ID);
            marker.setData("{\"filledAt\":\"" + Instant.now() + "\"}");
            documents.save(marker);
        });
        log.info("Storage tables filled from the document ({} bookings).", countBookings(doc.path(RESERVATIONS)));
    }

    private void invalidateCaches() {
        bookingCache = null;
        recordCache.clear();
        lastStored = null;
        assembledCache = null;
    }

    /** Makes the tables hold exactly what {@code full} holds; returns the sections now kept in tables. */
    private Set<String> syncTables(ObjectNode full) {
        Set<String> inTables = new LinkedHashSet<>();
        Instant now = Instant.now();
        JsonNode reservations = full.path(RESERVATIONS);
        if (manageableBookings(reservations)) {
            syncBookings(reservations, now);
            inTables.add(RESERVATIONS);
        }
        for (String section : RECORD_SECTIONS) {
            JsonNode list = full.path(section);
            if (!list.isArray() || !manageableList(list)) continue;
            syncRecords(section, list, now);
            inTables.add(section);
        }
        return inTables;
    }

    private void syncBookings(JsonNode reservations, Instant now) {
        if (bookingCache == null) {
            bookingCache = new HashMap<>();
            for (StoredBooking b : bookings.findAll()) bookingCache.put(b.getId(), fingerprint(b.getYearKey(), b.getMonthKey(), b.getPosition(), b.getData()));
        }
        Set<String> seen = new HashSet<>();
        List<StoredBooking> toSave = new ArrayList<>();
        for (Iterator<Map.Entry<String, JsonNode>> years = reservations.fields(); years.hasNext(); ) {
            Map.Entry<String, JsonNode> y = years.next();
            for (Iterator<Map.Entry<String, JsonNode>> months = y.getValue().fields(); months.hasNext(); ) {
                Map.Entry<String, JsonNode> m = months.next();
                int pos = 0;
                for (JsonNode r : m.getValue()) {
                    String id = r.path("id").asText();
                    String data = write(r);
                    String fp = fingerprint(y.getKey(), m.getKey(), pos, data);
                    seen.add(id);
                    String before = bookingCache.get(id);
                    if (!fp.equals(before)) {
                        if (before != null) {
                            StoredBooking old = bookings.findById(id).orElse(null);
                            if (old != null && !old.getData().equals(data)) keepHistory(old, "CHANGED", now);
                        }
                        toSave.add(toRow(id, y.getKey(), m.getKey(), pos, r, data, now));
                        bookingCache.put(id, fp);
                    }
                    pos++;
                }
            }
        }
        if (!toSave.isEmpty()) bookings.saveAll(toSave);
        List<String> gone = bookingCache.keySet().stream().filter(id -> !seen.contains(id)).toList();
        for (String id : gone) {
            bookings.findById(id).ifPresent(old -> { keepHistory(old, "DELETED", now); bookings.delete(old); });
            bookingCache.remove(id);
        }
    }

    private void syncRecords(String section, JsonNode list, Instant now) {
        Map<String, String> cache = recordCache.computeIfAbsent(section, s -> {
            Map<String, String> c = new HashMap<>();
            for (StoredRecord r : records.findBySection(s)) c.put(r.getItemId(), r.getPosition() + "|" + r.getData());
            return c;
        });
        Set<String> seen = new HashSet<>();
        List<StoredRecord> toSave = new ArrayList<>();
        int pos = 0;
        for (JsonNode item : list) {
            String id = item.path("id").asText();
            String data = write(item);
            String fp = pos + "|" + data;
            seen.add(id);
            if (!fp.equals(cache.get(id))) {
                StoredRecord row = new StoredRecord();
                row.setSection(section);
                row.setItemId(id);
                row.setPosition(pos);
                row.setData(data);
                row.setUpdatedAt(now);
                toSave.add(row);
                cache.put(id, fp);
            }
            pos++;
        }
        if (!toSave.isEmpty()) records.saveAll(toSave);
        for (String id : cache.keySet().stream().filter(id -> !seen.contains(id)).toList()) {
            records.deleteById(new StoredRecord.Key(section, id));
            cache.remove(id);
        }
    }

    private void keepHistory(StoredBooking old, String action, Instant now) {
        BookingHistory h = new BookingHistory();
        h.setRowId(old.getId());
        h.setBookingId(old.getBookingId());
        h.setAction(action);
        h.setPrevious(old.getData());
        h.setChangedAt(now);
        history.save(h);
    }

    private static String fingerprint(String year, String month, int pos, String data) {
        return year + "|" + month + "|" + pos + "|" + data;
    }

    private StoredBooking toRow(String id, String year, String month, int pos, JsonNode r, String data, Instant now) {
        StoredBooking b = new StoredBooking();
        b.setId(id);
        b.setYearKey(year);
        b.setMonthKey(month);
        b.setPosition(pos);
        b.setBookingId(text(r, "bookingId", 120));
        b.setStatus(text(r, "status", 40));
        b.setStartDate(text(r, "startDate", 40));
        b.setEndDate(text(r, "endDate", 40));
        b.setSource(text(r, "source", 120));
        b.setLocationName(text(r, "locationName", 120));
        b.setCarModel(text(r, "carModel", 120));
        b.setLicensePlate(text(r, "licensePlate", 40));
        b.setChannelReservationNumber(text(r, "channelReservationNumber", 120));
        JsonNode amount = r.path("amount");
        Double value = null;   // (a plain ?: here would unbox null and fail for bookings without an amount)
        if (amount.isNumber()) value = amount.asDouble();
        else if (amount.isTextual()) value = parseDouble(amount.asText());
        b.setAmount(value);
        b.setData(data);
        b.setUpdatedAt(now);
        return b;
    }

    private static Double parseDouble(String s) {
        try { return Double.parseDouble(s.trim()); } catch (Exception e) { return null; }
    }

    private static String text(JsonNode r, String field, int max) {
        JsonNode v = r.path(field);
        if (v.isMissingNode() || v.isNull()) return null;
        String s = v.asText();
        return s.length() <= max ? s : s.substring(0, max);
    }

    /** Bookings can be kept per row only when each has a unique, non-empty id that fits the column. */
    private static boolean manageableBookings(JsonNode reservations) {
        if (!reservations.isObject()) return false;
        Set<String> ids = new HashSet<>();
        for (JsonNode year : iterable(reservations)) {
            if (!year.isObject()) return false;
            for (JsonNode month : iterable(year)) {
                if (!month.isArray()) return false;
                for (JsonNode r : month) {
                    String id = r.path("id").asText("");
                    if (!r.isObject() || id.isBlank() || id.length() > 120 || !ids.add(id)) return false;
                }
            }
        }
        return true;
    }

    private static boolean manageableList(JsonNode list) {
        if (list.isMissingNode()) return true;
        if (!list.isArray()) return false;
        Set<String> ids = new HashSet<>();
        for (JsonNode item : list) {
            String id = item.path("id").asText("");
            if (!item.isObject() || id.isBlank() || id.length() > 160 || !ids.add(id)) return false;
        }
        return true;
    }

    private static Iterable<JsonNode> iterable(JsonNode node) {
        List<JsonNode> out = new ArrayList<>();
        node.elements().forEachRemaining(out::add);
        return out;
    }

    /** tables-only: the document keeps the layout (years and months) and settings; lists live in the tables. */
    private ObjectNode splitDocument(ObjectNode full, Set<String> inTables) {
        ObjectNode doc = full.deepCopy();
        if (inTables.contains(RESERVATIONS)) {
            ObjectNode layout = json.createObjectNode();
            full.path(RESERVATIONS).fields().forEachRemaining(y -> {
                ObjectNode months = layout.putObject(y.getKey());
                y.getValue().fieldNames().forEachRemaining(m -> months.putArray(m));
            });
            doc.set(RESERVATIONS, layout);
        }
        for (String section : RECORD_SECTIONS) if (inTables.contains(section) && full.has(section)) doc.putArray(section);
        ArrayNode meta = doc.putObject(META).putArray("tables");
        inTables.forEach(meta::add);
        return doc;
    }

    private boolean inTables(ObjectNode doc, String section) {
        for (JsonNode s : doc.path(META).path("tables")) if (section.equals(s.asText())) return true;
        return false;
    }

    /**
     * The full document: the stored document with the table sections filled in from the tables.
     * While the document is still complete ("tables" mode), each table section is only used when it is identical
     * to the document's; otherwise the document's is used and a warning is written, so the tables can never
     * replace correct data. In tables-only mode, exactly the sections saved to tables in that save are read.
     */
    private ObjectNode assemble(ObjectNode doc, boolean split) {
        ObjectNode full = doc.deepCopy();
        full.remove(META);
        if (split) {
            if (inTables(doc, RESERVATIONS)) full.set(RESERVATIONS, bookingsFromTables(doc.path(RESERVATIONS)));
            for (String section : RECORD_SECTIONS) if (inTables(doc, section)) full.set(section, recordsFromTables(section));
            return full;
        }
        if (manageableBookings(doc.path(RESERVATIONS))) {
            JsonNode t = bookingsFromTables(doc.path(RESERVATIONS));
            if (t.equals(doc.path(RESERVATIONS))) full.set(RESERVATIONS, t);
            else log.warn("Storage check: bookings in the tables differ from the document; the document is used.");
        }
        for (String section : RECORD_SECTIONS) {
            if (!doc.has(section) || !manageableList(doc.path(section))) continue;
            JsonNode t = recordsFromTables(section);
            if (t.equals(doc.path(section))) full.set(section, t);
            else log.warn("Storage check: {} in the tables differ from the document; the document is used.", section);
        }
        return full;
    }

    /** Reservations rebuilt from the table, in the document's year/month layout (empty months kept). */
    private ObjectNode bookingsFromTables(JsonNode layout) {
        ObjectNode out = json.createObjectNode();
        if (layout.isObject()) layout.fields().forEachRemaining(y -> {
            ObjectNode months = out.putObject(y.getKey());
            if (y.getValue().isObject()) y.getValue().fieldNames().forEachRemaining(months::putArray);
        });
        List<StoredBooking> all = new ArrayList<>(bookings.findAll());
        all.sort(Comparator.comparing(StoredBooking::getYearKey).thenComparing(StoredBooking::getMonthKey).thenComparingInt(StoredBooking::getPosition));
        for (StoredBooking b : all) {
            ObjectNode months = out.has(b.getYearKey()) ? (ObjectNode) out.get(b.getYearKey()) : out.putObject(b.getYearKey());
            ArrayNode list = months.has(b.getMonthKey()) ? (ArrayNode) months.get(b.getMonthKey()) : months.putArray(b.getMonthKey());
            list.add(read(b.getData()));
        }
        return out;
    }

    private ArrayNode recordsFromTables(String section) {
        ArrayNode out = json.createArrayNode();
        for (StoredRecord r : records.findBySectionOrderByPositionAsc(section)) out.add(read(r.getData()));
        return out;
    }

    private static int countBookings(JsonNode reservations) {
        int n = 0;
        for (JsonNode y : iterable(reservations)) for (JsonNode m : iterable(y)) n += m.size();
        return n;
    }

    /** Per month: bookings and money in the document and in the tables. */
    private static List<Map<String, Object>> monthTotals(JsonNode doc, JsonNode tables) {
        List<Map<String, Object>> out = new ArrayList<>();
        doc.fields().forEachRemaining(y -> y.getValue().fields().forEachRemaining(m -> {
            JsonNode t = tables.path(y.getKey()).path(m.getKey());
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("month", m.getKey() + " " + y.getKey());
            row.put("bookings", m.getValue().size());
            row.put("bookingsInTables", t.size());
            row.put("amount", round(sum(m.getValue())));
            row.put("amountInTables", round(sum(t)));
            out.add(row);
        }));
        return out;
    }

    private static double sum(JsonNode list) {
        double s = 0;
        for (JsonNode r : list) { JsonNode a = r.path("amount"); if (a.isNumber()) s += a.asDouble(); }
        return s;
    }

    private static double round(double v) { return Math.round(v * 100.0) / 100.0; }

    private String write(JsonNode node) {
        try { return json.writeValueAsString(node); } catch (Exception e) { throw new IllegalStateException(e); }
    }

    private JsonNode read(String text) {
        try { return json.readTree(text); } catch (Exception e) { throw new IllegalStateException(e); }
    }
}
