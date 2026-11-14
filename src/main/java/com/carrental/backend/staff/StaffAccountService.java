package com.carrental.backend.staff;

import com.carrental.backend.model.User;
import com.carrental.backend.model.UserPermission;
import com.carrental.backend.model.UserStatus;
import com.carrental.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Pattern;

/** Staff login accounts (the users table that /auth/login checks). */
@Service
@RequiredArgsConstructor
public class StaffAccountService {

    public static final int MIN_PASSWORD_LENGTH = 8;
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final com.carrental.backend.repository.MfaSettingsRepository twoStepSettings;
    private final com.carrental.backend.tenant.SupplierService suppliers;

    public static class StaffAccountException extends RuntimeException {
        private final int status;
        public StaffAccountException(int status, String message) { super(message); this.status = status; }
        public int status() { return status; }
    }

    /**
     * The permissions to store: only what the supplier's package holds, and nothing newly given that the person
     * saving does not have themselves (taking permissions away is always allowed). Kept permissions the package
     * no longer holds are dropped, so a package change cannot leave hidden rights behind.
     */
    List<UserPermission> granted(List<UserPermission> wanted, List<UserPermission> before, java.util.Set<String> actor) {
        com.carrental.backend.tenant.SupplierPlan plan = suppliers.planOf(com.carrental.backend.tenant.TenantContext.current());
        List<UserPermission> inPlan = plan.cap(wanted);
        if (actor != null) {
            for (UserPermission p : inPlan) {
                if (!before.contains(p) && !actor.contains(p.name())) {
                    throw new StaffAccountException(403, "You cannot give a permission you do not have yourself (" + p.name() + ").");
                }
            }
        }
        return new java.util.ArrayList<>(inPlan);
    }

    /** Staff of the signed-in person's own supplier; anyone else's account is "not found". */
    static boolean ofThisSupplier(User u) {
        return com.carrental.backend.tenant.SupplierScope.mine(u.getSupplierId());
    }

    public List<User> list() {
        List<User> all = new ArrayList<>(users.findAll().stream().filter(StaffAccountService::ofThisSupplier).toList());
        all.sort(Comparator.comparing(u -> Optional.ofNullable(u.getFullName()).orElse("").toLowerCase()));
        return all;
    }

    @Transactional
    public User create(StaffAccountRequest req) {
        return create(req, null);
    }

    /**
     * {@code actorPermissions}: what the person creating the account may do (null = no limit, the server itself).
     * Nobody can give a permission they do not have, and nothing outside the supplier's package is kept.
     */
    @Transactional
    public User create(StaffAccountRequest req, java.util.Set<String> actorPermissions) {
        String email = normaliseEmail(req.email());
        if (email == null || !EMAIL.matcher(email).matches()) throw new StaffAccountException(400, "A valid email address is required.");
        if (isBlank(req.fullName())) throw new StaffAccountException(400, "Full name is required.");
        validatePassword(req.password());
        if (users.existsByEmail(email)) throw new StaffAccountException(409, "An account with this email already exists.");
        String username = isBlank(req.username()) ? email.substring(0, email.indexOf('@')) : req.username().trim();
        if (users.existsByUsernameIgnoreCase(username)) throw new StaffAccountException(409, "This username is already taken.");

        User u = new User();
        u.setSupplierId(com.carrental.backend.tenant.TenantContext.current());   // the creator's own supplier
        u.setEmail(email);
        u.setUsername(username);
        u.setPassword(passwordEncoder.encode(req.password()));
        u.setPasswordLastChanged(LocalDateTime.now());
        u.setStatus(UserStatus.ACTIVE);
        u.setWebAppAccess(true);
        applyProfile(u, req);
        u.setPermissions(granted(parsePermissions(req.permissions()), List.of(), actorPermissions));
        return users.save(u);
    }

    @Transactional
    public User update(String id, StaffAccountRequest req, String actorEmail) {
        return update(id, req, actorEmail, null);
    }

    @Transactional
    public User update(String id, StaffAccountRequest req, String actorEmail, java.util.Set<String> actorPermissions) {
        User u = users.findById(id).filter(StaffAccountService::ofThisSupplier).orElseThrow(() -> new StaffAccountException(404, "Account not found."));
        boolean self = u.getEmail().equalsIgnoreCase(actorEmail);

        if (req.email() != null) {
            String email = normaliseEmail(req.email());
            if (email == null || !EMAIL.matcher(email).matches()) throw new StaffAccountException(400, "A valid email address is required.");
            if (!email.equalsIgnoreCase(u.getEmail()) && users.existsByEmail(email)) throw new StaffAccountException(409, "An account with this email already exists.");
            if (self && !email.equalsIgnoreCase(u.getEmail())) throw new StaffAccountException(400, "Change your own email from your profile.");
            u.setEmail(email);
        }
        if (req.username() != null && !req.username().isBlank() && !req.username().trim().equals(u.getUsername())) {
            // Changing only the letter case of one's own username is fine; anything else must be free on the platform.
            if (!req.username().trim().equalsIgnoreCase(u.getUsername()) && users.existsByUsernameIgnoreCase(req.username().trim()))
                throw new StaffAccountException(409, "This username is already taken.");
            u.setUsername(req.username().trim());
        }
        applyProfile(u, req);

        List<UserPermission> newPerms = req.permissions() != null
            ? granted(parsePermissions(req.permissions()), u.getPermissions() == null ? List.of() : u.getPermissions(), actorPermissions)
            : u.getPermissions();
        UserStatus newStatus = req.status() != null ? parseStatus(req.status()) : u.getStatus();
        Boolean newAccess = req.webAppAccess() != null ? req.webAppAccess() : u.getWebAppAccess();

        boolean willBeAdmin = isActiveAdmin(newPerms, newStatus, newAccess);
        if (self && !willBeAdmin) throw new StaffAccountException(400, "You cannot remove your own administrator access or disable your own account.");
        if (isActiveAdmin(u) && !willBeAdmin && countActiveAdmins() <= 1) {
            throw new StaffAccountException(400, "At least one active administrator must remain.");
        }
        u.setPermissions(newPerms);
        u.setStatus(newStatus);
        u.setWebAppAccess(newAccess);
        return users.save(u);
    }

    @Transactional
    public User resetPassword(String id, String newPassword) {
        validatePassword(newPassword);
        User u = users.findById(id).filter(StaffAccountService::ofThisSupplier).orElseThrow(() -> new StaffAccountException(404, "Account not found."));
        u.setPassword(passwordEncoder.encode(newPassword));
        u.setPasswordLastChanged(LocalDateTime.now());
        return users.save(u);
    }

    @Transactional
    public void delete(String id, String actorEmail) {
        User u = users.findById(id).filter(StaffAccountService::ofThisSupplier).orElseThrow(() -> new StaffAccountException(404, "Account not found."));
        if (u.getEmail().equalsIgnoreCase(actorEmail)) throw new StaffAccountException(400, "You cannot delete your own account.");
        if (isActiveAdmin(u) && countActiveAdmins() <= 1) throw new StaffAccountException(400, "At least one active administrator must remain.");
        twoStepSettings.findByUser(u).ifPresent(twoStepSettings::delete);   // their two-step sign-in goes with the account
        users.delete(u);
    }

    public Optional<User> findByEmail(String email) {
        return users.findByEmail(email);
    }

    // ----------------------------------------------------------------------

    private void applyProfile(User u, StaffAccountRequest req) {
        if (req.fullName() != null) {
            if (req.fullName().isBlank()) throw new StaffAccountException(400, "Full name is required.");
            u.setFullName(req.fullName().trim());
        }
        if (req.position() != null) u.setPosition(req.position().trim());
        if (req.nationalId() != null) u.setNationalId(req.nationalId().trim());
        if (req.sscNumber() != null) u.setSscNumber(req.sscNumber().trim());
        if (req.hireDate() != null) u.setHireDate(req.hireDate().trim());
        if (req.baseSalaryJOD() != null) {
            if (req.baseSalaryJOD() < 0) throw new StaffAccountException(400, "Salary cannot be negative.");
            u.setBaseSalaryJOD(req.baseSalaryJOD());
        }
    }

    static List<UserPermission> parsePermissions(List<String> names) {
        if (names == null) return new ArrayList<>();
        Set<UserPermission> out = new LinkedHashSet<>();
        for (String n : names) {
            if (n == null) continue;
            try { out.add(UserPermission.valueOf(n.trim())); } catch (IllegalArgumentException ignored) { /* unknown names are dropped */ }
        }
        return new ArrayList<>(out);
    }

    private static UserStatus parseStatus(String s) {
        try { return UserStatus.valueOf(s.trim().toUpperCase(Locale.ROOT)); }
        catch (Exception e) { throw new StaffAccountException(400, "Unknown status: " + s); }
    }

    /** Why a password is not accepted, or null when it is. */
    public static String passwordProblem(String p) {
        try {
            validatePassword(p);
            return null;
        } catch (StaffAccountException e) {
            return e.getMessage();
        }
    }

    private static void validatePassword(String p) {
        if (p == null || p.length() < MIN_PASSWORD_LENGTH) {
            throw new StaffAccountException(400, "Password must be at least " + MIN_PASSWORD_LENGTH + " characters.");
        }
        if (p.length() > 128) throw new StaffAccountException(400, "Password is too long.");
        if (!p.matches(".*[A-Za-z].*") || !p.matches(".*\\d.*")) {
            throw new StaffAccountException(400, "Password must contain letters and numbers.");
        }
    }

    private static boolean isActiveAdmin(List<UserPermission> perms, UserStatus status, Boolean access) {
        return perms != null && perms.contains(UserPermission.ACTION_ADMIN_MANAGE_USERS)
                && (status == null || status == UserStatus.ACTIVE) && !Boolean.FALSE.equals(access);
    }

    private static boolean isActiveAdmin(User u) {
        return isActiveAdmin(u.getPermissions(), u.getStatus(), u.getWebAppAccess());
    }

    private long countActiveAdmins() {
        return users.findAll().stream().filter(StaffAccountService::ofThisSupplier).filter(StaffAccountService::isActiveAdmin).count();
    }

    private static String normaliseEmail(String e) {
        return e == null ? null : e.trim().toLowerCase(Locale.ROOT);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
