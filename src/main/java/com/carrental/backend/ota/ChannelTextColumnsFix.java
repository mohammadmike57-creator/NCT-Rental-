package com.carrental.backend.ota;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;

/**
 * The broker gateway's long text fields (booking replies kept for retries, sandbox bookings, price breakdowns,
 * webhook payloads) were mapped with @Lob. On PostgreSQL that stores each value as a large object and writes only
 * its number into the TEXT column, and large objects cannot be read outside a transaction: the bookings list,
 * idempotent retries, retrieve, modify and cancel then failed with "Large Objects may not be used in auto-commit
 * mode". The fields are plain text now; this puts the real text back into the rows saved the old way.
 * Safe to run on every start: JSON values are never digits only, so only those references are touched.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class ChannelTextColumnsFix implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ChannelTextColumnsFix.class);
    private static final String[][] COLUMNS = {
        {"channel_booking", "create_response"},
        {"channel_booking", "sandbox_reservation"},
        {"channel_offer", "breakdown"},
        {"channel_webhook_delivery", "payload"},
    };

    private final JdbcTemplate jdbc;
    private final DataSource dataSource;

    public ChannelTextColumnsFix(JdbcTemplate jdbc, DataSource dataSource) {
        this.jdbc = jdbc;
        this.dataSource = dataSource;
    }

    @Override
    public void run(ApplicationArguments args) {
        try (Connection c = dataSource.getConnection()) {
            if (!c.getMetaData().getDatabaseProductName().toLowerCase().contains("postgres")) return;
        } catch (Exception e) {
            log.warn("Channel text column check skipped: {}", e.getMessage());
            return;
        }
        for (String[] tc : COLUMNS) {
            String t = tc[0], col = tc[1];
            try {
                Boolean exists = jdbc.queryForObject("SELECT to_regclass('public." + t + "') IS NOT NULL", Boolean.class);
                if (!Boolean.TRUE.equals(exists)) continue;
                int n = jdbc.update("UPDATE " + t + " SET " + col + " = convert_from(lo_get(" + col + "::oid), 'UTF8') "
                    + "WHERE " + col + " ~ '^[0-9]{1,10}$' AND EXISTS (SELECT 1 FROM pg_largeobject_metadata m WHERE m.oid = " + col + "::oid)");
                if (n > 0) log.info("Restored {} {}.{} value(s) saved as large objects", n, t, col);
            } catch (Exception e) {
                log.warn("Could not restore {}.{}: {}", t, col, e.getMessage());
            }
        }
    }
}
