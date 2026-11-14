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
        this.superAdmins = Arrays.stream(superAdmins.split(","))
            .map(s -> s.trim().toLowerCase(Locale.ROOT)).filter(s -> !s.isEmpty()).collect(Collectors.toUnmodifiableSet());
    }

    public boolean multiSupplier() { return multiSupplier; }

    public boolean isSuperAdmin(String email) {
        return email != null && superAdmins.contains(email.trim().toLowerCase(Locale.ROOT));
    }
}
