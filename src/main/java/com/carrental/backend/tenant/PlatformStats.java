package com.carrental.backend.tenant;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;

/** Platform figures per supplier, counted in the database (records from before suppliers count as UR-Drive Jordan's). */
@Component
public class PlatformStats {

    private final JdbcTemplate jdbc;

    public PlatformStats(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public Map<String, Long> users() {
        return count("SELECT COALESCE(supplier_id, 'urd'), COUNT(*) FROM users GROUP BY COALESCE(supplier_id, 'urd')");
    }

    /** Live broker calls (tests not counted) since {@code days} ago. */
    public Map<String, Long> brokerCalls(int days) {
        return count("SELECT COALESCE(supplier_id, 'urd'), COUNT(*) FROM channel_message WHERE created_at >= ? AND sandbox = false GROUP BY COALESCE(supplier_id, 'urd')", since(days));
    }

    /** Live broker bookings since {@code days} ago. */
    public Map<String, Long> brokerBookings(int days) {
        return count("SELECT COALESCE(supplier_id, 'urd'), COUNT(*) FROM channel_booking WHERE created_at >= ? AND sandbox = false GROUP BY COALESCE(supplier_id, 'urd')", since(days));
    }

    /** When anyone of each supplier last did something. */
    public Map<String, Instant> lastActivity() {
        Map<String, Instant> out = new HashMap<>();
        try {
            jdbc.query("SELECT COALESCE(supplier_id, 'urd'), MAX(occurred_at) FROM staff_activity WHERE category <> 'platform' GROUP BY COALESCE(supplier_id, 'urd')",
                rs -> { Timestamp t = rs.getTimestamp(2); if (t != null) out.put(rs.getString(1), t.toInstant()); });
        } catch (Exception ignored) {
            // table not there yet
        }
        return out;
    }

    private Map<String, Long> count(String sql, Object... args) {
        Map<String, Long> out = new HashMap<>();
        try {
            jdbc.query(sql, rs -> { out.put(rs.getString(1), rs.getLong(2)); }, args);
        } catch (Exception ignored) {
            // a table that does not exist yet counts nothing
        }
        return out;
    }

    private static Timestamp since(int days) { return Timestamp.from(Instant.now().minus(days, ChronoUnit.DAYS)); }
}
