package com.carrental.backend.staff;

import com.carrental.backend.audit.ActivityService;
import com.carrental.backend.model.User;
import com.carrental.backend.repository.UserRepository;
import com.carrental.backend.tenant.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * The way back in when nobody can sign in to reset a password: set ADMIN_PASSWORD_RESET to
 * "login:new password" (login = the account's username or email) on the server and restart.
 * The account gets that password on start; nothing else about it changes. Remove the setting
 * once signed in, or a later password change would be replaced again at the next restart.
 * The password itself is never written to the log.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class AdminPasswordReset implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminPasswordReset.class);

    private final String setting;
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final ActivityService activity;

    public AdminPasswordReset(@Value("${ADMIN_PASSWORD_RESET:}") String setting, UserRepository users,
                              PasswordEncoder encoder, ActivityService activity) {
        this.setting = setting == null ? "" : setting.trim();
        this.users = users;
        this.encoder = encoder;
        this.activity = activity;
    }

    @Override
    public void run(ApplicationArguments args) {
        String result = apply();
        if (result != null) log.warn("ADMIN_PASSWORD_RESET: {}", result);
    }

    /** Does the reset; returns what happened (for the log), or null when the setting is not used. */
    String apply() {
        if (setting.isEmpty()) return null;
        int cut = setting.indexOf(':');
        if (cut <= 0 || cut == setting.length() - 1) return "ignored: write it as login:new password";
        String login = setting.substring(0, cut).trim().replaceAll("^[\"']|[\"']$", "");
        String password = setting.substring(cut + 1).replaceAll("^[\"']|[\"']$", "");
        String problem = StaffAccountService.passwordProblem(password);
        if (problem != null) return "ignored for " + login + ": " + problem;
        Optional<User> found = users.findByEmail(login).or(() -> users.findByEmailIgnoreCase(login))
            .or(() -> users.findFirstByUsernameIgnoreCase(login));
        if (found.isEmpty()) return "ignored: no account with username or email " + login;
        User u = found.get();
        if (u.getPassword() != null && encoder.matches(password, u.getPassword()))
            return "the password of " + u.getEmail() + " is already set from this setting; remove ADMIN_PASSWORD_RESET now";
        u.setPassword(encoder.encode(password));
        u.setPasswordLastChanged(java.time.LocalDateTime.now());
        users.save(u);
        String supplier = u.getSupplierId() == null || u.getSupplierId().isBlank() ? TenantContext.DEFAULT : u.getSupplierId();
        TenantContext.run(supplier, () -> activity.record(u.getEmail(), "PASSWORD_RESET", "security",
            "Password reset on the server (ADMIN_PASSWORD_RESET)", null, null));
        return "password of " + u.getEmail() + " was reset; sign in, then remove ADMIN_PASSWORD_RESET";
    }
}
