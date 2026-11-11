package com.carrental.backend.config;

import com.carrental.backend.model.User;
import com.carrental.backend.model.UserPermission;
import com.carrental.backend.model.UserStatus;
import com.carrental.backend.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;

/**
 * Test accounts for the automatic end-to-end tests (e2e/ folder).
 *
 * Runs only with the "e2e" profile, and refuses to run unless the server uses the throwaway
 * in-memory database, so it can never add accounts to a real database. The password comes from
 * E2E_PASSWORD; nothing is created without it.
 */
@Component
@Profile("e2e")
public class E2eSeed implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(E2eSeed.class);

    public static final String ADMIN_EMAIL = "e2e-admin@example.test";
    public static final String STAFF_EMAIL = "e2e-staff@example.test";

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final String datasourceUrl;
    private final String password;

    public E2eSeed(UserRepository users, PasswordEncoder encoder,
                   @Value("${spring.datasource.url:}") String datasourceUrl,
                   @Value("${e2e.password:${E2E_PASSWORD:}}") String password) {
        this.users = users;
        this.encoder = encoder;
        this.datasourceUrl = datasourceUrl;
        this.password = password;
    }

    @Override
    public void run(String... args) {
        if (!datasourceUrl.startsWith("jdbc:h2:mem:")) {
            throw new IllegalStateException("The e2e profile only runs on the in-memory test database, not on " + datasourceUrl.replaceAll("//[^/@]*@", "//***@"));
        }
        if (password == null || password.length() < 12) {
            throw new IllegalStateException("Set E2E_PASSWORD (12+ characters) for the e2e test accounts.");
        }
        save(ADMIN_EMAIL, "E2E Admin", Arrays.asList(UserPermission.values()));
        save(STAFF_EMAIL, "E2E Staff", List.of(
                UserPermission.VIEW_HOME_DASHBOARD, UserPermission.VIEW_RESERVATIONS, UserPermission.ACTION_RESERVATIONS_ADD,
                UserPermission.ACTION_RESERVATIONS_EDIT, UserPermission.VIEW_AGREEMENTS, UserPermission.VIEW_TRAFFIC_TICKETS));
        log.warn("E2E test accounts created ({} and {}). Never use the e2e profile outside tests.", ADMIN_EMAIL, STAFF_EMAIL);
    }

    private void save(String email, String name, List<UserPermission> permissions) {
        User u = users.findByEmail(email).orElseGet(User::new);
        u.setEmail(email);
        u.setFullName(name);
        u.setUsername(email.substring(0, email.indexOf('@')));
        u.setPassword(encoder.encode(password));
        u.setStatus(UserStatus.ACTIVE);
        u.setWebAppAccess(true);
        u.setPermissions(permissions);
        users.save(u);
    }
}
