package com.carrental.backend.tenant;

import com.carrental.backend.audit.ActivityService;
import com.carrental.backend.model.User;
import com.carrental.backend.notify.CustomerEmailRequest;
import com.carrental.backend.notify.CustomerEmailService;
import com.carrental.backend.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Invitations and password links: a long random link, valid 72 hours, usable once. The person chooses their own
 * password; nobody else ever sees it. When the platform's email is not set up, the link is shown to the platform
 * admin to pass on instead.
 */
@Service
public class PasswordSetupService {

    private static final Logger log = LoggerFactory.getLogger(PasswordSetupService.class);
    public static final int VALID_HOURS = 72;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final PasswordSetupRepository tokens;
    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final CustomerEmailService email;
    private final ActivityService activity;
    private final SupplierService suppliers;

    public PasswordSetupService(PasswordSetupRepository tokens, UserRepository users, PasswordEncoder passwords,
                                CustomerEmailService email, ActivityService activity, SupplierService suppliers) {
        this.tokens = tokens;
        this.users = users;
        this.passwords = passwords;
        this.email = email;
        this.activity = activity;
        this.suppliers = suppliers;
    }

    public record Issued(String link, boolean emailSent, String emailProblem, Instant expiresAt) { }

    /** Makes a new link for the account (earlier unused links stop working) and emails it when email is set up. */
    public Issued issue(User u, String baseUrl, String by, boolean welcome) {
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        tokens.deleteOpenFor(u.getEmail());
        PasswordSetupToken t = new PasswordSetupToken();
        t.setTokenHash(hash(token));
        t.setEmail(u.getEmail());
        t.setSupplierId(u.getSupplierId());
        t.setCreatedAt(Instant.now());
        t.setExpiresAt(Instant.now().plus(VALID_HOURS, ChronoUnit.HOURS));
        t.setCreatedBy(by);
        tokens.save(t);
        String link = baseUrl.replaceAll("/+$", "") + "/set-password?token=" + token;
        String company = suppliers.find(u.getSupplierId() == null ? TenantContext.DEFAULT : u.getSupplierId()).map(Supplier::getName).orElse("");
        boolean sent = false;
        String problem = null;
        if (email.isConfigured()) {
            try {
                email.send(new CustomerEmailRequest(u.getEmail(),
                    welcome ? "Your " + company + " account is ready" : "Choose a new password for " + company,
                    welcome ? "Welcome, " + firstName(u) : "Choose a new password",
                    welcome ? "An account has been created for you on " + company + "'s rental management system. Choose your password to sign in."
                            : "A new password link was requested for your account. Choose a new password to sign in.",
                    List.of(List.of("Company", company), List.of("Sign-in email", u.getEmail()),
                        List.of("Link valid for", VALID_HOURS + " hours, once")),
                    "If the button does not open, copy this address into your browser: " + link
                        + "\nIf you did not expect this email, ignore it; nothing changes until the link is used.",
                    company, null, null, null, null, null,
                    "ACCOUNT", "info", null, null, null, null, null, null,
                    null, null, "Choose your password", link, null, null, null));
                sent = true;
            } catch (Exception e) {
                problem = e.getMessage();
                log.warn("Invitation email to {} not sent: {}", u.getEmail(), e.getMessage());
            }
        } else {
            problem = "Outgoing email is not set up";
        }
        return new Issued(link, sent, problem, t.getExpiresAt());
    }

    /** What the set-password page shows for a link (nothing when it is not valid). */
    public Optional<Map<String, String>> describe(String token) {
        return valid(token).flatMap(t -> users.findByEmail(t.getEmail())).map(u -> Map.of(
            "email", u.getEmail(),
            "name", u.getFullName() == null ? "" : u.getFullName(),
            "company", suppliers.find(u.getSupplierId() == null ? TenantContext.DEFAULT : u.getSupplierId()).map(Supplier::getName).orElse("")));
    }

    /** Sets the password chosen through a link. Returns the account's email, or empty when the link is not valid. */
    public Optional<String> use(String token, String password) {
        Optional<PasswordSetupToken> t = valid(token);
        if (t.isEmpty()) return Optional.empty();
        User u = users.findByEmail(t.get().getEmail()).orElse(null);
        if (u == null) return Optional.empty();
        u.setPassword(passwords.encode(password));
        u.setPasswordLastChanged(LocalDateTime.now());
        users.save(u);
        t.get().setUsedAt(Instant.now());
        tokens.save(t.get());
        TenantContext.run(u.getSupplierId() == null ? TenantContext.DEFAULT : u.getSupplierId(),
            () -> activity.record(u.getEmail(), "PASSWORD_SET", "auth", "Chose a password with an emailed link", null, null));
        return Optional.of(u.getEmail());
    }

    private Optional<PasswordSetupToken> valid(String token) {
        if (token == null || token.length() < 20 || token.length() > 100) return Optional.empty();
        return tokens.findById(hash(token)).filter(t -> t.getUsedAt() == null && t.getExpiresAt().isAfter(Instant.now()));
    }

    static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String firstName(User u) {
        String n = u.getFullName() == null ? "" : u.getFullName().trim();
        return n.isEmpty() ? "there" : n.split("\\s+")[0];
    }
}
