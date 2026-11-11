package com.carrental.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Who may change which part of the saved data, checked on the server with the same permissions the screens use.
 *
 * Sections not listed (reservations, tickets, damages, invoices, messages, the activity log, years) are part of
 * everyday work and stay open to every signed-in user, as before. A section the user may not change is skipped and
 * reported, never applied; the rest of the same save still goes through, so a screen holding slightly older data
 * can never lose a booking because of an unrelated section.
 */
public final class StateSectionGuard {

    public static final String ADMIN = "ACTION_ADMIN_MANAGE_USERS";

    /** Section → any one of these permissions may change it (administrators may change everything). */
    static final Map<String, Set<String>> WRITE = Map.ofEntries(
        Map.entry("franchisePayments", Set.of("ACTION_FINANCIALS_MANAGE_FRANCHISE_PAYMENTS")),
        Map.entry("commissionMonths", Set.of("ACTION_FINANCIALS_MANAGE_FRANCHISE_PAYMENTS")),
        Map.entry("companyDetails", Set.of("ACTION_ADMIN_MANAGE_COMPANY_DETAILS")),
        Map.entry("fleet", Set.of("ACTION_ADMIN_MANAGE_FLEET")),
        Map.entry("availableExtras", Set.of("ACTION_ADMIN_MANAGE_EXTRAS")),
        Map.entry("rentalLocations", Set.of("ACTION_ADMIN_MANAGE_LOCATIONS")),
        // Importing bookings can add new sources; the website gives import to "Admin panel" holders too.
        Map.entry("sources", Set.of("ACTION_ADMIN_MANAGE_SOURCES", "VIEW_IMPORT_RESERVATIONS", "VIEW_ADMIN_PANEL")),
        // Anyone who can open Accounting could always add expenses there (after the security key).
        Map.entry("expenses", Set.of("ACTION_FINANCIALS_MANAGE_EXPENSES", "VIEW_FINANCIALS_ACCOUNTING")),
        Map.entry("aggregators", Set.of("VIEW_AGGREGATOR_SETUP")),
        Map.entry("stopSales", Set.of("VIEW_AGGREGATOR_SETUP")),
        Map.entry("channelPricing", Set.of("VIEW_AGGREGATOR_SETUP"))
    );

    /** Fields of a staff entry that only an administrator may change, even on one's own entry. */
    static final List<String> PROTECTED_USER_FIELDS = List.of("permissions", "role", "status", "webAppAccess", "password", "passwordHash");

    /** The person saving: their e-mail and permissions. {@link #SYSTEM} is the server itself (no limits). */
    public record Writer(String email, Set<String> permissions) {
        public static final Writer SYSTEM = new Writer(null, null);
        public boolean isSystem() { return permissions == null; }
        public boolean isAdmin() { return isSystem() || permissions.contains(ADMIN); }
        public static Writer of(String email, Collection<String> permissions) {
            return new Writer(email, permissions == null ? Set.of() : Set.copyOf(permissions));
        }
    }

    private StateSectionGuard() {}

    /** Staff passwords live only in the accounts table: removes any copy from a staff list. True when one was removed. */
    public static boolean stripPasswords(JsonNode users) {
        boolean removed = false;
        if (users != null && users.isArray()) {
            for (JsonNode u : users) {
                if (u instanceof ObjectNode o) {
                    removed |= o.remove("password") != null;
                    removed |= o.remove("passwordHash") != null;
                }
            }
        }
        return removed;
    }

    /** Deleting more than a few bookings in one save (e.g. a whole month). */
    public static boolean mayBulkDelete(Writer w) {
        return w.isAdmin() || w.permissions().contains("ACTION_ADMIN_DELETE_ALL_RESERVATIONS");
    }

    /** True when this writer may replace the whole section. */
    public static boolean maySet(Writer w, String section) {
        if (w.isAdmin()) return true;
        Set<String> need = WRITE.get(section);
        return need == null ? !"users".equals(section) : need.stream().anyMatch(w.permissions()::contains);
    }

    /**
     * The staff list a non-administrator may save: only their own entry changes (or is added when it is missing),
     * and never its permissions, role, status or password. Other people's entries are kept exactly as on the
     * server. Returns null only when the save does not contain the person's own entry at all.
     */
    public static ArrayNode ownUserOnly(Writer w, JsonNode current, JsonNode incoming) {
        if (w.email() == null || !incoming.isArray()) return null;
        // No staff list yet (a new system): it starts empty.
        if (!current.isArray()) current = JsonNodeFactory.instance.arrayNode();
        String me = w.email().trim().toLowerCase(Locale.ROOT);
        JsonNode mine = null;
        for (JsonNode u : incoming) if (me.equals(u.path("email").asText("").trim().toLowerCase(Locale.ROOT))) { mine = u; break; }
        if (!(mine instanceof ObjectNode)) return null;
        ArrayNode out = JsonNodeFactory.instance.arrayNode();
        boolean changed = false;
        boolean found = false;
        for (JsonNode u : current) {
            if (u instanceof ObjectNode server && me.equals(u.path("email").asText("").trim().toLowerCase(Locale.ROOT))) {
                ObjectNode merged = ((ObjectNode) mine).deepCopy();
                for (String f : PROTECTED_USER_FIELDS) {
                    if (server.has(f)) merged.set(f, server.get(f)); else merged.remove(f);
                }
                found = true;
                merged.set("email", server.get("email"));
                if (server.has("id")) merged.set("id", server.get("id"));
                changed |= !merged.equals(server);
                out.add(merged);
            } else {
                out.add(u);
            }
        }
        if (!found) {
            // Signed in but not on the staff list yet: the app adds the person's own profile.
            // Permissions and role never come from here (they live on the login account).
            ObjectNode added = ((ObjectNode) mine).deepCopy();
            for (String f : PROTECTED_USER_FIELDS) added.remove(f);
            out.add(added);
            changed = true;
        }
        // Nothing of the person's own changed: keep the list as it is (other people's entries are
        // never taken from a non-administrator), without reporting the save as refused.
        return out;
    }
}
