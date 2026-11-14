package com.carrental.backend.tenant;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Platform switches, set on the server (Render → Environment), never in the code:
 *   MULTI_SUPPLIER=true             other suppliers can be created and used (off: UR-Drive Jordan only, as before)
 *   PLATFORM_SUPER_ADMINS=a@x,b@y   accounts allowed into the platform admin portal (/admin)
 */
@Component
public class PlatformSettings {

    private final boolean multiSupplier;
    private final Set<String> superAdmins;

    public PlatformSettings(@Value("${platform.multi-supplier:${MULTI_SUPPLIER:false}}") boolean multiSupplier,
                            @Value("${platform.super-admins:${PLATFORM_SUPER_ADMINS:}}") String superAdmins) {
        this.multiSupplier = multiSupplier;
        // Commas, semicolons or spaces between entries; quotes pasted around the value are ignored.
        this.superAdmins = Arrays.stream(superAdmins.split("[,;\\s]+"))
            .map(s -> s.replaceAll("[\"']", "").trim().toLowerCase(Locale.ROOT)).filter(s -> !s.isEmpty()).collect(Collectors.toUnmodifiableSet());
    }

    public boolean multiSupplier() { return multiSupplier; }

    /** True when any of the account's names (its email, or its username) is listed. */
    public boolean isSuperAdmin(String... names) {
        for (String n : names) if (n != null && superAdmins.contains(n.trim().toLowerCase(Locale.ROOT))) return true;
        return false;
    }
}
