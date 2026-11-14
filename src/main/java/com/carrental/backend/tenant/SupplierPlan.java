package com.carrental.backend.tenant;

import com.carrental.backend.model.UserPermission;

import java.util.Arrays;
import java.util.Collection;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

import static com.carrental.backend.model.UserPermission.*;

/**
 * What a supplier has bought. The package caps every person's permissions on the server: whatever a supplier's
 * administrator ticks for a person, nobody gets more than the package holds, and brokers are only answered for a
 * package with OTA XML.
 */
public enum SupplierPlan {

    FULL("Full system", "Rental management (CRM) and OTA XML distribution together.", EnumSet.allOf(UserPermission.class)),

    CRM("CRM only", "Reservations, agreements, fleet, customers, finance and reports. No broker connections.",
        except(VIEW_AGGREGATOR_SETUP, ACTION_ADMIN_MANAGE_RATE_PLANS, ACTION_ADMIN_MANAGE_TERMS)),

    XML("OTA XML only", "Broker channels, rates, availability, stop sales and broker bookings, with the fleet and branches they need.",
        EnumSet.of(VIEW_AGGREGATOR_SETUP, ACTION_ADMIN_MANAGE_RATE_PLANS, ACTION_ADMIN_MANAGE_TERMS,
            VIEW_FLEET_AVAILABILITY, VIEW_MY_PROFILE, VIEW_INTERNAL_MESSAGES,
            VIEW_ADMIN_PANEL, ACTION_ADMIN_MANAGE_USERS, ACTION_ADMIN_MANAGE_FLEET, ACTION_ADMIN_MANAGE_LOCATIONS,
            ACTION_ADMIN_MANAGE_EXTRAS, ACTION_ADMIN_MANAGE_COMPANY_DETAILS, ACTION_ADMIN_MANAGE_EMAIL_SETTINGS, VIEW_SYSTEM_ACTIVITY_LOG));

    private final String label;
    private final String description;
    private final Set<UserPermission> permissions;

    SupplierPlan(String label, String description, Set<UserPermission> permissions) {
        this.label = label;
        this.description = description;
        this.permissions = permissions;
    }

    public String label() { return label; }
    public String description() { return description; }
    public Set<UserPermission> permissions() { return permissions; }
    public boolean hasXml() { return permissions.contains(VIEW_AGGREGATOR_SETUP); }
    public boolean hasCrm() { return permissions.contains(VIEW_RESERVATIONS); }

    /** Sections of the office data people of this package may not change (their screens are not in the package). */
    public Set<String> blockedSections() {
        Set<String> out = new java.util.HashSet<>();
        if (!hasCrm()) out.addAll(List.of("reservations", "trafficTickets", "vehicleDamages", "invoices", "expenses",
            "franchisePayments", "commissionMonths", "sources"));
        if (!hasXml()) out.addAll(List.of("aggregators", "stopSales", "channelPricing"));
        return out;
    }

    /** A person's permissions as the package allows them. */
    public List<UserPermission> cap(Collection<UserPermission> granted) {
        return granted == null ? List.of() : granted.stream().filter(permissions::contains).distinct().toList();
    }

    /** The plan with this name; anything unknown is the full system (UR-Drive Jordan and suppliers from before packages). */
    public static SupplierPlan of(String name) {
        if (name == null) return FULL;
        return Arrays.stream(values()).filter(p -> p.name().equalsIgnoreCase(name.trim())).findFirst().orElse(FULL);
    }

    private static Set<UserPermission> except(UserPermission... left) {
        EnumSet<UserPermission> s = EnumSet.allOf(UserPermission.class);
        for (UserPermission p : left) s.remove(p);
        return s;
    }
}
