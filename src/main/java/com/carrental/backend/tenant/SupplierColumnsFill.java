package com.carrental.backend.tenant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * On every start: rows saved before suppliers existed get UR-Drive Jordan's supplier id, and each table gets an
 * index starting with supplier_id. Only fills empty values; never changes a row that already has a supplier, and
 * never touches any other column. A table or column that does not exist yet is skipped.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class SupplierColumnsFill implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SupplierColumnsFill.class);

    /** table → second index column (after supplier_id). */
    static final List<String[]> TABLES = List.of(
        new String[]{"users", "email"},
        new String[]{"staff_activity", "occurred_at"},
        new String[]{"media_files", "id"},
        new String[]{"payments", "id"},
        new String[]{"mail_settings", "id"},
        new String[]{"channel_booking", "channel_id"},
        new String[]{"channel_message", "created_at"},
        new String[]{"channel_offer", "channel_id"},
        new String[]{"channel_secret", "channel_id"},
        new String[]{"channel_webhook_delivery", "channel_id"},
        new String[]{"channel_delivery_log", "channel_id"},
        new String[]{"channel_inventory_snapshot", "channel_id"},
        new String[]{"oauth_client", "channel_id"},
        new String[]{"outbound_connector", "channel_id"},
        new String[]{"connector_send", "channel_id"},
        new String[]{"webhook_subscription", "channel_id"},
        new String[]{"store_records", "id"},
        new String[]{"store_bookings", "id"},
        new String[]{"store_booking_history", "id"});

    private final JdbcTemplate jdbc;

    public SupplierColumnsFill(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Override
    public void run(ApplicationArguments args) {
        int filled = 0;
        for (String[] t : TABLES) {
            try {
                filled += jdbc.update("UPDATE " + t[0] + " SET supplier_id = ? WHERE supplier_id IS NULL", TenantContext.DEFAULT);
            } catch (Exception e) {
                log.debug("supplier_id fill skipped for {}: {}", t[0], e.getMessage());
                continue;
            }
            try {
                jdbc.execute("CREATE INDEX IF NOT EXISTS idx_" + t[0] + "_supplier ON " + t[0] + " (supplier_id, " + t[1] + ")");
            } catch (Exception e) {
                log.debug("supplier index skipped for {}: {}", t[0], e.getMessage());
            }
        }
        if (filled > 0) log.info("Gave {} existing record(s) the supplier UR-Drive Jordan (URD)", filled);
    }
}
