package com.carrental.backend.monitoring;

import com.carrental.backend.audit.ActivityService;
import com.carrental.backend.controller.HealthController;
import com.carrental.backend.notify.MailSettingsService;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import javax.sql.DataSource;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ErrorMonitorTest {

    @Test
    void referencesAreShortAndReadable() {
        for (int i = 0; i < 100; i++) assertTrue(ErrorMonitor.newReference().matches("ERR-[2-9A-HJKMNP-Z]{6}"));
    }

    @Test
    void withoutAnAlertAddressNothingIsEmailed() {
        MailSettingsService mail = Mockito.mock(MailSettingsService.class);
        ErrorMonitor m = new ErrorMonitor(Mockito.mock(ActivityService.class), mail, "");
        m.report("server", "boom", "details", "a@b.c");
        m.sendAlerts();
        Mockito.verifyNoInteractions(mail);
        assertTrue(m.pendingForTest().isEmpty());
        m.stop();
    }

    @Test
    void theAlertListsEachErrorWithItsReference() {
        String body = ErrorMonitor.body(List.of(new ErrorMonitor.Report(Instant.parse("2026-11-11T08:00:00Z"), "ERR-ABC234", "browser", "Screen “Home” failed: x", "sara@nct.test")), 3);
        assertTrue(body.contains("ERR-ABC234"));
        assertTrue(body.contains("11 Nov 11:00"), "Amman time");
        assertTrue(body.contains("Screen  sara@nct.test"));
        assertTrue(body.contains("…and 3 more."));
    }

    @Test
    void healthIsDownWhenTheDatabaseIsUnreachable() throws Exception {
        DataSource ds = Mockito.mock(DataSource.class);
        Mockito.when(ds.getConnection()).thenThrow(new SQLException("connection refused"));
        var res = new HealthController(ds).health();
        assertEquals(503, res.getStatusCode().value());
        assertEquals("DATABASE DOWN", res.getBody());
    }
}
