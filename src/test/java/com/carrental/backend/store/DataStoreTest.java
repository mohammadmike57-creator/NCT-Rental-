package com.carrental.backend.store;

import com.carrental.backend.model.AppData;
import com.carrental.backend.repository.AppDataRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * The storage modes never lose or change data: everything written comes back identical (same order, every field),
 * switching modes back and forth keeps everything, deleted bookings stay in the history.
 */
@SpringBootTest(properties = {
    "jwt.secret=test-secret-key-that-is-long-enough-for-hmac-sha256",
    "spring.datasource.url=jdbc:h2:mem:datastore-test;DB_CLOSE_DELAY=-1"
})
class DataStoreTest {

    static final String INITIAL = "{\"reservations\":{}}";

    @Autowired AppDataRepository documents;
    @Autowired StoredBookingRepository bookings;
    @Autowired StoredRecordRepository records;
    @Autowired BookingHistoryRepository history;
    @Autowired TransactionTemplate tx;
    final ObjectMapper json = new ObjectMapper();

    DataStore store(String mode) {
        return new DataStore(documents, bookings, records, history, tx, mode);
    }

    @BeforeEach
    void empty() {
        documents.deleteAll();
        bookings.deleteAll();
        records.deleteAll();
        history.deleteAll();
    }

    /** A realistic document: bookings in several months (one empty), lists, settings, unicode and nested fields. */
    ObjectNode sample() throws Exception {
        return (ObjectNode) json.readTree("""
            {"reservations":{
               "2026":{"January":[{"id":"r1","bookingId":"B-1","personName":"Jane Roe","amount":150.5,"status":"CONFIRMED",
                                   "extras":[{"name":"GPS","dailyPrice":8}],"driver":{"licence":"X1"}},
                                  {"id":"r2","bookingId":"B-2","personName":"سامي","amount":"90","status":"CANCELLED"}],
                       "February":[],
                       "March":[{"id":"r3","bookingId":"B-3","personName":"Ali","amount":200,"channelReservationNumber":"RSV-9"}]},
               "2025":{"December":[{"id":"r0","bookingId":"B-0","amount":10},{"id":"r00","bookingId":"B-00","personName":"No amount yet"}]}},
             "fleet":[{"id":"c1","modelName":"Kia","licensePlate":"10-1"},{"id":"c2","modelName":"Hyundai"}],
             "invoices":[],
             "trafficTickets":[{"id":"t1","bookingId":"B-1","amount":30}],
             "expenses":[{"id":"e1","amount":45,"description":"Car wash"}],
             "companyDetails":{"name":"UR-Drive Jordan","address":"Amman"},
             "users":[{"id":"u1","email":"a@b.c"}],
             "years":[2025,2026]}""");
    }

    void save(DataStore s, JsonNode data) throws Exception {
        AppData main = s.loadMain(INITIAL);
        main.setData(json.writeValueAsString(data));
        s.saveMain(main);
    }

    JsonNode read(DataStore s) throws Exception {
        return json.readTree(s.loadMain(INITIAL).getData());
    }

    @Test
    void everyModeGivesBackExactlyWhatWasSaved() throws Exception {
        for (String mode : List.of("document", "dual", "tables", "tables-only")) {
            empty();
            DataStore s = store(mode);
            ObjectNode data = sample();
            save(s, data);
            assertEquals(data, read(s), mode + ": identical after saving");
            assertEquals(data, read(store(mode)), mode + ": identical after a restart");
        }
    }

    @Test
    void tablesHoldEachBookingAndRecordWithTheReportColumns() throws Exception {
        DataStore s = store("dual");
        save(s, sample());
        assertEquals(5, bookings.count());
        assertNull(bookings.findById("r00").orElseThrow().getAmount(), "a booking without an amount is kept");
        StoredBooking b1 = bookings.findById("r1").orElseThrow();
        assertEquals("B-1", b1.getBookingId());
        assertEquals("2026", b1.getYearKey());
        assertEquals("January", b1.getMonthKey());
        assertEquals(150.5, b1.getAmount());
        assertEquals(90.0, bookings.findById("r2").orElseThrow().getAmount(), "text amounts are read too");
        assertEquals("RSV-9", bookings.findById("r3").orElseThrow().getChannelReservationNumber());
        assertEquals(2, records.findBySection("fleet").size());
        assertEquals(1, records.findBySection("expenses").size());
    }

    @Test
    void tablesOnlyKeepsBookingsOutOfTheDocumentAndRebuildsItWhenSwitchingBack() throws Exception {
        ObjectNode data = sample();
        save(store("tables-only"), data);
        JsonNode stored = json.readTree(documents.currentMainData().orElseThrow());
        assertTrue(stored.has("_storage"), "the document says what lives in tables");
        assertEquals(0, stored.path("reservations").path("2026").path("January").size(), "bookings are not in the document");
        assertTrue(stored.path("reservations").path("2026").has("February"), "the month layout is kept");
        assertEquals("UR-Drive Jordan", stored.path("companyDetails").path("name").asText(), "settings stay in the document");
        // Going back, in either direction, nothing is lost.
        assertEquals(data, read(store("document")), "document mode rebuilds everything from the tables");
        DataStore dual = store("dual");
        assertEquals(data, read(dual));
        save(dual, read(dual));
        assertFalse(json.readTree(documents.currentMainData().orElseThrow()).has("_storage"), "the document is complete again");
        assertEquals(data, read(store("document")));
    }

    @Test
    void changingAndDeletingBookingsKeepsThePreviousVersion() throws Exception {
        DataStore s = store("tables-only");
        ObjectNode data = sample();
        save(s, data);
        ArrayNode jan = (ArrayNode) data.path("reservations").path("2026").path("January");
        ((ObjectNode) jan.get(0)).put("amount", 175);
        jan.remove(1);                                   // B-2 deleted
        save(s, data);
        assertEquals(data, read(s));
        assertFalse(bookings.existsById("r2"));
        var b2 = s.historyOf("B-2");
        assertEquals(1, b2.size());
        assertEquals("DELETED", b2.get(0).getAction());
        assertTrue(b2.get(0).getPrevious().contains("سامي"), "the whole deleted booking is kept");
        var b1 = s.historyOf("B-1");
        assertEquals("CHANGED", b1.get(0).getAction());
        assertTrue(b1.get(0).getPrevious().contains("150.5"), "the version before the change is kept");
        assertEquals(1, s.recentlyDeleted().size());
    }

    @Test
    void movingABookingToAnotherMonthKeepsItOnce() throws Exception {
        DataStore s = store("tables-only");
        ObjectNode data = sample();
        save(s, data);
        ArrayNode jan = (ArrayNode) data.path("reservations").path("2026").path("January");
        JsonNode moved = jan.remove(0);
        ((ArrayNode) data.path("reservations").path("2026").path("February")).add(moved);
        save(s, data);
        assertEquals(data, read(s));
        assertEquals(5, bookings.count());
        assertEquals("February", bookings.findById("r1").orElseThrow().getMonthKey());
    }

    @Test
    void listsWithoutUniqueIdsStayInTheDocument() throws Exception {
        ObjectNode data = sample();
        data.putArray("messages").addObject().put("text", "no id");
        ((ArrayNode) data.get("fleet")).addObject().put("id", "c1").put("modelName", "duplicate id");
        DataStore s = store("tables-only");
        save(s, data);
        assertEquals(data, read(s));
        JsonNode stored = json.readTree(documents.currentMainData().orElseThrow());
        assertEquals(3, stored.path("fleet").size(), "fleet stays in the document");
        assertEquals(1, stored.path("messages").size(), "messages stay in the document");
        String inTables = stored.path("_storage").path("tables").toString();
        assertFalse(inTables.contains("fleet"), "fleet is not read from the tables");
        assertFalse(inTables.contains("messages"), "messages are not read from the tables");
        assertTrue(inTables.contains("reservations"), "bookings still are");
    }

    @Test
    void switchingOnTablesFillsThemFromTheExistingDataFirst() throws Exception {
        ObjectNode data = sample();
        save(store("document"), data);                   // today's data
        assertEquals(0, bookings.count());
        assertEquals(data, read(store("tables")), "the first read fills the tables and returns the same data");
        assertEquals(5, bookings.count());
        assertEquals(data, read(store("tables-only")));
    }

    @Test
    void theCheckReportsMatchingTablesAndMonthTotals() throws Exception {
        DataStore s = store("dual");
        save(s, sample());
        Map<String, Object> report = s.check();
        assertEquals(true, report.get("allMatch"));
        assertEquals(true, report.get("documentComplete"));
        String text = report.toString();
        assertTrue(text.contains("identical"));
        assertTrue(text.contains("January 2026"));
        // A difference is reported, and reading in "tables" mode still uses the (correct) document.
        StoredBooking b = bookings.findById("r1").orElseThrow();
        b.setData(b.getData().replace("Jane Roe", "Wrong Name"));
        bookings.save(b);
        assertEquals(false, store("dual").check().get("allMatch"));
        assertEquals("Jane Roe", read(store("tables")).path("reservations").path("2026").path("January").get(0).path("personName").asText(),
            "the tables can never replace correct data");
    }

    @Test
    void documentModeIsExactlyAsBefore() throws Exception {
        DataStore s = store("document");
        ObjectNode data = sample();
        save(s, data);
        assertEquals(json.writeValueAsString(data), documents.currentMainData().orElseThrow(), "one row, unchanged");
        assertEquals(0, bookings.count());
        assertEquals(0, records.count());
        assertFalse(documents.findById(DataStore.MARKER_ID).isPresent());
    }

    /** A booking table that refuses to save, like a full disk or an unexpected database problem. */
    StoredBookingRepository brokenBookings() {
        StoredBookingRepository broken = mock(StoredBookingRepository.class, org.mockito.AdditionalAnswers.delegatesTo(bookings));
        doThrow(new IllegalStateException("simulated database problem")).when(broken).saveAll(any());
        return broken;
    }

    @Test
    void inDualModeASaveNeverFailsBecauseOfTheTableCopy() throws Exception {
        ObjectNode data = sample();
        save(store("dual"), data);                       // tables filled and identical
        com.carrental.backend.monitoring.ErrorMonitor monitor = mock(com.carrental.backend.monitoring.ErrorMonitor.class);
        DataStore s = new DataStore(documents, brokenBookings(), records, history, tx, "dual");
        s.setMonitor(monitor);
        ((ObjectNode) data.path("reservations").path("2026").path("January").get(0)).put("personName", "Jane Changed");
        assertDoesNotThrow(() -> save(s, data), "the staff member's save goes through");
        assertEquals(json.writeValueAsString(data), documents.currentMainData().orElseThrow(), "the complete document has the change");
        assertEquals(data, read(s));
        verify(monitor).report(eq("server"), contains("could not be updated"), anyString(), isNull());
        assertFalse(documents.findById(DataStore.MARKER_ID).isPresent(), "the copy is marked for rebuilding");
        // Later (the problem gone), the copy is rebuilt from the complete document and matches again.
        DataStore healthy = store("dual");
        assertEquals(data, read(healthy));
        assertEquals(true, healthy.check().get("allMatch"));
        assertEquals("Jane Changed", read(store("tables")).path("reservations").path("2026").path("January").get(0).path("personName").asText());
    }

    @Test
    void aFailingCopyIsNotRetriedOnEveryRead() throws Exception {
        ObjectNode data = sample();
        save(store("document"), data);                   // today's data, tables empty
        StoredBookingRepository broken = brokenBookings();
        DataStore s = new DataStore(documents, broken, records, history, tx, "dual");
        assertEquals(data, read(s), "reading works while the copy cannot be made");
        assertEquals(data, read(s));
        assertEquals(data, read(s));
        verify(broken, times(1)).saveAll(any());          // tried once, then left alone for 10 minutes
    }

    @Test
    void tablesOnlyStaysAllOrNothing() throws Exception {
        ObjectNode data = sample();
        save(store("tables-only"), data);
        String before = documents.currentMainData().orElseThrow();
        DataStore s = new DataStore(documents, brokenBookings(), records, history, tx, "tables-only");
        ((ObjectNode) data.path("reservations").path("2026").path("January").get(0)).put("personName", "Not saved");
        assertThrows(RuntimeException.class, () -> save(s, data), "when bookings live only in tables, a failed save is refused");
        assertEquals(before, documents.currentMainData().orElseThrow(), "and nothing half-saved remains");
        assertEquals("Jane Roe", read(store("tables-only")).path("reservations").path("2026").path("January").get(0).path("personName").asText());
    }
}
