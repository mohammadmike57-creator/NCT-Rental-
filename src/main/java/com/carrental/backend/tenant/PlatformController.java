package com.carrental.backend.tenant;

import com.carrental.backend.audit.ActivityService;
import com.carrental.backend.audit.StaffActivity;
import com.carrental.backend.model.User;
import com.carrental.backend.model.UserPermission;
import com.carrental.backend.model.UserStatus;
import com.carrental.backend.repository.UserRepository;
import com.carrental.backend.security.JwtUtil;
import com.carrental.backend.staff.PresenceService;
import com.carrental.backend.staff.StaffAccountService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * The platform admin portal (/admin). Every address answers only a platform super admin (PLATFORM_SUPER_ADMINS)
 * signed in to UR-Drive Jordan, with MULTI_SUPPLIER on; anyone else gets "not found". Every change is written to the
 * platform activity log, and support access to a supplier's data is also written to that supplier's own log.
 *
 *   GET  /api/platform/me                                  who is signed in, packages on offer
 *   GET  /api/platform/overview                            totals and recent platform activity
 *   GET  /api/platform/suppliers                           every supplier with its figures
 *   POST /api/platform/suppliers                           create a supplier, its package and its owner
 *   GET  /api/platform/suppliers/{id}                      one supplier: profile, figures, staff
 *   PUT  /api/platform/suppliers/{id}                      change profile, package, broker access
 *   POST /api/platform/suppliers/{id}/status               ACTIVE / PAUSED / CLOSED, with a reason
 *   POST /api/platform/suppliers/{id}/users                add an administrator to a supplier (invitation)
 *   POST /api/platform/suppliers/{id}/users/{uid}/link     a new set-password link
 *   POST /api/platform/suppliers/{id}/users/{uid}/status   switch an account on or off
 *   POST /api/platform/suppliers/{id}/support              read-only support access (reason, 15–120 minutes)
 *   GET  /api/platform/activity                            platform activity log
 */
@RestController
public class PlatformController {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final SupplierService suppliers;
    private final PlatformSettings platform;
    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final ActivityService activity;
    private final PasswordSetupService setup;
    private final PlatformStats stats;
    private final ChannelRegistry channels;
    private final JwtUtil jwt;
    private final String baseUrl;

    public PlatformController(SupplierService suppliers, PlatformSettings platform, UserRepository users, PasswordEncoder passwords,
                              ActivityService activity, PasswordSetupService setup, PlatformStats stats, ChannelRegistry channels,
                              JwtUtil jwt, @Value("${app.base-url:https://www.nctrental.com}") String baseUrl) {
        this.suppliers = suppliers;
        this.platform = platform;
        this.users = users;
        this.passwords = passwords;
        this.activity = activity;
        this.setup = setup;
        this.stats = stats;
        this.channels = channels;
        this.jwt = jwt;
        this.baseUrl = baseUrl;
    }

    // ------------------------------------------------------------------ reading

    @GetMapping("/api/platform/me")
    public ResponseEntity<?> me(Authentication auth) {
        if (!allowed(auth)) return denied(auth);
        Map<String, Object> m = new LinkedHashMap<>();
        User u = users.findByEmail(auth.getName()).orElse(null);
        m.put("email", auth.getName());
        m.put("name", u == null ? auth.getName() : u.getFullName());
        List<Map<String, Object>> plans = new ArrayList<>();
        for (SupplierPlan p : SupplierPlan.values()) {
            Map<String, Object> pm = new LinkedHashMap<>();
            pm.put("id", p.name());
            pm.put("label", p.label());
            pm.put("description", p.description());
            pm.put("crm", p.hasCrm());
            pm.put("xml", p.hasXml());
            pm.put("permissions", p.permissions().stream().map(Enum::name).toList());
            plans.add(pm);
        }
        m.put("plans", plans);
        return ResponseEntity.ok(m);
    }

    @GetMapping("/api/platform/overview")
    public ResponseEntity<?> overview(Authentication auth) {
        if (!allowed(auth)) return notFound();
        List<Supplier> all = suppliers.all();
        Map<String, Long> byStatus = new LinkedHashMap<>(), byPlan = new LinkedHashMap<>();
        for (Supplier.Status st : Supplier.Status.values()) byStatus.put(st.name(), 0L);
        for (SupplierPlan p : SupplierPlan.values()) byPlan.put(p.name(), 0L);
        for (Supplier s : all) {
            byStatus.merge(s.getStatus(), 1L, Long::sum);
            byPlan.merge(TenantContext.DEFAULT.equals(s.getId()) ? "FULL" : s.plan().name(), 1L, Long::sum);
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("suppliers", all.size());
        m.put("byStatus", byStatus);
        m.put("byPlan", byPlan);
        m.put("users", sum(stats.users()));
        m.put("channels", sum(channels.channelsPerSupplier()));
        m.put("brokerCalls24h", sum(stats.brokerCalls(1)));
        m.put("brokerCalls7d", sum(stats.brokerCalls(7)));
        m.put("brokerBookings30d", sum(stats.brokerBookings(30)));
        m.put("recentActivity", platformActivity(8));
        return ResponseEntity.ok(m);
    }

    @GetMapping("/api/platform/suppliers")
    public ResponseEntity<?> list(Authentication auth) {
        if (!allowed(auth)) return notFound();
        Map<String, Long> u = stats.users(), ch = channels.channelsPerSupplier(), calls = stats.brokerCalls(7), bk = stats.brokerBookings(30);
        Map<String, Instant> last = stats.lastActivity();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Supplier s : suppliers.all()) {
            Map<String, Object> m = view(s);
            m.put("users", u.getOrDefault(s.getId(), 0L));
            m.put("channels", ch.getOrDefault(s.getId(), 0L));
            m.put("brokerCalls7d", calls.getOrDefault(s.getId(), 0L));
            m.put("brokerBookings30d", bk.getOrDefault(s.getId(), 0L));
            m.put("lastActivity", Optional.ofNullable(last.get(s.getId())).map(Instant::toString).orElse(null));
            m.put("owner", ownerOf(s.getId()).map(User::getEmail).orElse(null));
            out.add(m);
        }
        out.sort(Comparator.comparing((Map<String, Object> m) -> !TenantContext.DEFAULT.equals(m.get("id"))).thenComparing(m -> String.valueOf(m.get("name")).toLowerCase(Locale.ROOT)));
        return ResponseEntity.ok(out);
    }

    @GetMapping("/api/platform/suppliers/{id}")
    public ResponseEntity<?> detail(@PathVariable String id, Authentication auth) {
        if (!allowed(auth)) return notFound();
        Supplier s = suppliers.find(id).orElse(null);
        if (s == null) return notFound();
        Map<String, Object> m = view(s);
        m.put("channels", channels.channelsPerSupplier().getOrDefault(id, 0L));
        m.put("owner", ownerOf(id).map(User::getEmail).orElse(null));
        m.put("brokerCalls7d", stats.brokerCalls(7).getOrDefault(id, 0L));
        m.put("brokerBookings30d", stats.brokerBookings(30).getOrDefault(id, 0L));
        m.put("lastActivity", Optional.ofNullable(stats.lastActivity().get(id)).map(Instant::toString).orElse(null));
        List<Map<String, Object>> staff = new ArrayList<>();
        for (User x : staffOf(id)) staff.add(userView(x, s));
        m.put("staff", staff);
        m.put("history", platformActivity(200).stream().filter(a -> String.valueOf(a.get("summary")).contains("(" + s.getCode() + ")")).limit(25).toList());
        return ResponseEntity.ok(m);
    }

    /** Is this sign-in address free? ({@code id}: the supplier being edited, if any.) Also suggests one from a name. */
    @GetMapping("/api/platform/slug-check")
    public ResponseEntity<?> slugCheck(@RequestParam(required = false) String slug, @RequestParam(required = false) String name,
                                       @RequestParam(required = false) String id, Authentication auth) {
        if (!allowed(auth)) return notFound();
        Map<String, Object> m = new LinkedHashMap<>();
        if (name != null && (slug == null || slug.isBlank())) slug = freeSlug(SupplierService.suggestSlug(name));
        String clean = slug == null ? "" : slug.trim().toLowerCase(Locale.ROOT);
        String problem = suppliers.slugProblem(clean, id);
        m.put("slug", clean);
        m.put("available", problem == null);
        if (problem != null) m.put("problem", problem);
        m.put("url", baseUrl.replaceAll("/+$", "") + "/s/" + clean);
        return ResponseEntity.ok(m);
    }

    /** The address itself if free, else address-2, address-3 … */
    private String freeSlug(String wanted) {
        String base = wanted == null || wanted.length() < 3 ? "supplier" : wanted;
        if (suppliers.slugProblem(base, null) == null) return base;
        for (int i = 2; i < 1000; i++) {
            String tail = "-" + i;
            String c = (base.length() + tail.length() > 40 ? base.substring(0, 40 - tail.length()).replaceAll("-+$", "") : base) + tail;
            if (suppliers.slugProblem(c, null) == null) return c;
        }
        return base;
    }

    @GetMapping("/api/platform/activity")
    public ResponseEntity<?> activityLog(@RequestParam(defaultValue = "200") int limit, Authentication auth) {
        if (!allowed(auth)) return notFound();
        return ResponseEntity.ok(platformActivity(Math.max(1, Math.min(limit, 1000))));
    }

    // ------------------------------------------------------------------ changing

    public record SupplierForm(String code, String name, String legalName, String country, String currency, String timeZone,
                               String plan, Boolean testAccess, Boolean liveAccess,
                               String contactName, String contactEmail, String contactPhone, String supportEmail, String supportPhone,
                               String website, String address, String notes, String slug,
                               String ownerName, String ownerEmail, String ownerAccess, String ownerPassword) { }

    @PostMapping("/api/platform/suppliers")
    public ResponseEntity<?> create(@RequestBody SupplierForm f, Authentication auth) {
        if (!allowed(auth)) return notFound();
        String email = lower(f.ownerEmail());
        if (!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) return bad("Enter the owner's email address.");
        if (f.ownerName() == null || f.ownerName().isBlank()) return bad("Enter the owner's name.");
        boolean withPassword = "password".equalsIgnoreCase(f.ownerAccess());
        if (withPassword) {
            String problem = StaffAccountService.passwordProblem(f.ownerPassword());
            if (problem != null) return bad(problem);
        }
        if (users.existsByEmail(email)) return ResponseEntity.status(409).body(Map.of("error", "An account with this email already exists."));
        if (f.plan() != null && !List.of("FULL", "CRM", "XML").contains(f.plan().toUpperCase(Locale.ROOT))) return bad("Choose a package.");
        // The sign-in address: the one chosen, or one made from the name (made unique if needed).
        String slug = f.slug() == null || f.slug().isBlank() ? freeSlug(SupplierService.suggestSlug(f.name())) : f.slug().trim().toLowerCase(Locale.ROOT);
        String slugProblem = suppliers.slugProblem(slug, null);
        if (slugProblem != null) return bad("Sign-in address: " + slugProblem);
        Supplier s;
        try {
            s = suppliers.create(f.code(), f.name(), f.currency(), f.country(), f.timeZone());
        } catch (IllegalArgumentException | IllegalStateException e) {
            return bad(e.getMessage());
        }
        apply(s, f);
        s.setSlug(slug);
        suppliers.save(s);
        User owner = newAccount(s, email, f.ownerName(), "Owner", withPassword ? f.ownerPassword() : null);
        Map<String, Object> body = view(s);
        body.put("owner", email);
        if (!withPassword) body.put("invitation", invitation(owner, auth.getName(), true));
        log(auth, "SUPPLIER_CREATED", "Created supplier " + s.getName() + " (" + s.getCode() + ") with the " + s.plan().label()
            + " package; owner " + email + (withPassword ? " (password set by the platform)" : " (invited)"));
        return ResponseEntity.status(201).body(body);
    }

    @PutMapping("/api/platform/suppliers/{id}")
    public ResponseEntity<?> update(@PathVariable String id, @RequestBody SupplierForm f, Authentication auth) {
        if (!allowed(auth)) return notFound();
        Supplier s = suppliers.find(id).orElse(null);
        if (s == null) return notFound();
        if (f.name() != null && f.name().isBlank()) return bad("The supplier name cannot be empty.");
        String before = s.plan().label();
        if (TenantContext.DEFAULT.equals(id) && f.plan() != null && !"FULL".equalsIgnoreCase(f.plan())) return bad("UR-Drive Jordan always has the full system.");
        if (f.name() != null) s.setName(f.name().trim());
        String change = "";
        String oldAddress = s.slugOrCode();
        if (f.slug() != null && !f.slug().isBlank() && !f.slug().trim().equalsIgnoreCase(s.slugOrCode())) {
            if (TenantContext.DEFAULT.equals(id)) return bad("UR-Drive Jordan signs in at the main address.");
            String problem = suppliers.slugProblem(f.slug(), id);
            if (problem != null) return bad("Sign-in address: " + problem);
            s.setSlug(f.slug().trim().toLowerCase(Locale.ROOT));
        }
        apply(s, f);
        suppliers.save(s);
        if (!before.equals(s.plan().label())) change += "; package " + before + " → " + s.plan().label();
        if (!oldAddress.equals(s.slugOrCode())) change += "; sign-in address /s/" + oldAddress + " → /s/" + s.slugOrCode();
        log(auth, "SUPPLIER_UPDATED", "Updated supplier " + s.getName() + " (" + s.getCode() + ")" + change);
        return ResponseEntity.ok(view(s));
    }

    @PostMapping("/api/platform/suppliers/{id}/status")
    public ResponseEntity<?> status(@PathVariable String id, @RequestBody Map<String, String> body, Authentication auth) {
        if (!allowed(auth)) return notFound();
        Supplier s = suppliers.find(id).orElse(null);
        if (s == null) return notFound();
        String to = body.getOrDefault("status", "").toUpperCase(Locale.ROOT);
        if (!List.of("ACTIVE", "PAUSED", "CLOSED").contains(to)) return bad("Choose active, paused or closed.");
        if (TenantContext.DEFAULT.equals(id) && !"ACTIVE".equals(to)) return bad("UR-Drive Jordan cannot be paused or closed.");
        String reason = body.getOrDefault("reason", "").trim();
        if (!"ACTIVE".equals(to) && reason.isEmpty()) return bad("Give a reason; it is kept in the platform log.");
        String from = s.getStatus();
        s.setStatus(to);
        suppliers.save(s);
        log(auth, "SUPPLIER_" + to, "Supplier " + s.getName() + " (" + s.getCode() + ") " + from.toLowerCase(Locale.ROOT) + " → " + to.toLowerCase(Locale.ROOT)
            + (reason.isEmpty() ? "" : ": " + reason));
        return ResponseEntity.ok(view(s));
    }

    @PostMapping("/api/platform/suppliers/{id}/users")
    public ResponseEntity<?> addUser(@PathVariable String id, @RequestBody Map<String, String> body, Authentication auth) {
        if (!allowed(auth)) return notFound();
        Supplier s = suppliers.find(id).orElse(null);
        if (s == null) return notFound();
        String email = lower(body.get("email"));
        if (!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) return bad("Enter a valid email address.");
        if (body.getOrDefault("name", "").isBlank()) return bad("Enter the person's name.");
        if (users.existsByEmail(email)) return ResponseEntity.status(409).body(Map.of("error", "An account with this email already exists."));
        User u = newAccount(s, email, body.get("name"), body.getOrDefault("position", "Administrator"), null);
        log(auth, "SUPPLIER_USER_INVITED", "Invited " + email + " as administrator of " + s.getName() + " (" + s.getCode() + ")");
        Map<String, Object> out = userView(u, s);
        out.put("invitation", invitation(u, auth.getName(), true));
        return ResponseEntity.status(201).body(out);
    }

    @PostMapping("/api/platform/suppliers/{id}/users/{uid}/link")
    public ResponseEntity<?> newLink(@PathVariable String id, @PathVariable String uid, Authentication auth) {
        if (!allowed(auth)) return notFound();
        Supplier s = suppliers.find(id).orElse(null);
        User u = s == null ? null : staffOf(id).stream().filter(x -> x.getId().equals(uid)).findFirst().orElse(null);
        if (u == null) return notFound();
        Map<String, Object> inv = invitation(u, auth.getName(), false);
        log(auth, "SUPPLIER_USER_LINK", "New password link for " + u.getEmail() + " of " + s.getName() + " (" + s.getCode() + ")");
        return ResponseEntity.ok(inv);
    }

    @PostMapping("/api/platform/suppliers/{id}/users/{uid}/status")
    public ResponseEntity<?> userStatus(@PathVariable String id, @PathVariable String uid, @RequestBody Map<String, Boolean> body, Authentication auth) {
        if (!allowed(auth)) return notFound();
        Supplier s = suppliers.find(id).orElse(null);
        User u = s == null ? null : staffOf(id).stream().filter(x -> x.getId().equals(uid)).findFirst().orElse(null);
        if (u == null) return notFound();
        if (u.getEmail().equalsIgnoreCase(auth.getName())) return bad("You cannot switch off your own account here.");
        boolean on = Boolean.TRUE.equals(body.get("active"));
        u.setStatus(on ? UserStatus.ACTIVE : UserStatus.INACTIVE);
        users.save(u);
        log(auth, on ? "SUPPLIER_USER_ENABLED" : "SUPPLIER_USER_DISABLED", (on ? "Switched on " : "Switched off ") + u.getEmail() + " of " + s.getName() + " (" + s.getCode() + ")");
        return ResponseEntity.ok(userView(u, s));
    }

    @PostMapping("/api/platform/suppliers/{id}/support")
    public ResponseEntity<?> support(@PathVariable String id, @RequestBody Map<String, Object> body, Authentication auth) {
        if (!allowed(auth)) return notFound();
        Supplier s = suppliers.find(id).orElse(null);
        if (s == null) return notFound();
        if (TenantContext.DEFAULT.equals(id)) return bad("You are already signed in to UR-Drive Jordan.");
        if (!s.isActive()) return bad("The supplier is not active.");
        String reason = String.valueOf(body.getOrDefault("reason", "")).trim();
        if (reason.length() < 5) return bad("Give the reason for opening this supplier's data (at least a few words).");
        int minutes;
        try { minutes = Integer.parseInt(String.valueOf(body.getOrDefault("minutes", 30))); } catch (NumberFormatException e) { minutes = 30; }
        minutes = Math.max(15, Math.min(minutes, 120));
        String token = jwt.generateSupportToken(auth.getName(), id, minutes);
        Instant until = Instant.now().plusSeconds(minutes * 60L);
        log(auth, "SUPPORT_ACCESS", "Opened read-only support access to " + s.getName() + " (" + s.getCode() + ") for " + minutes + " min: " + reason);
        final int mins = minutes;
        TenantContext.run(id, () -> activity.record(auth.getName(), "PLATFORM_SUPPORT_ACCESS", "security",
            "Platform support opened your data read-only for " + mins + " minutes: " + reason, null, null));
        return ResponseEntity.ok(Map.of("token", token, "until", until.toString(), "supplier", s.getName(), "minutes", minutes));
    }

    // ------------------------------------------------------------------ helpers

    private boolean allowed(Authentication auth) {
        return auth != null && platform.multiSupplier() && isListed(auth)
            && TenantContext.DEFAULT.equals(TenantContext.current());
    }

    /** The account is named in PLATFORM_SUPER_ADMINS by its email or by its username. */
    private boolean isListed(Authentication auth) {
        String email = auth.getName();
        if (platform.isSuperAdmin(email)) return true;
        return users.findByEmail(email).map(u -> platform.isSuperAdmin(u.getUsername())).orElse(false);
    }

    /** Tells the signed-in person why the portal is closed to them, so they can fix the setting. */
    private ResponseEntity<?> denied(Authentication auth) {
        if (auth == null) return ResponseEntity.status(401).body(Map.of("error", "Sign in first"));
        String reason = !platform.multiSupplier() ? "off"
            : !TenantContext.DEFAULT.equals(TenantContext.current()) ? "supplier"
            : "not-listed";
        return ResponseEntity.status(403).body(Map.of("error", "No access", "reason", reason, "signedInAs", auth.getName()));
    }

    private void apply(Supplier s, SupplierForm f) {
        if (f.legalName() != null) s.setLegalName(clip(f.legalName(), 200));
        if (f.country() != null) s.setCountry(clip(f.country().toUpperCase(Locale.ROOT), 2));
        if (f.currency() != null && f.currency().trim().matches("[A-Za-z]{3}")) s.setCurrency(f.currency().trim().toUpperCase(Locale.ROOT));
        if (f.timeZone() != null && !f.timeZone().isBlank()) s.setTimeZone(clip(f.timeZone(), 60));
        if (f.plan() != null && !TenantContext.DEFAULT.equals(s.getId())) s.setPlan(SupplierPlan.of(f.plan()).name());
        if (f.testAccess() != null) s.setTestAccess(f.testAccess());
        if (f.liveAccess() != null) s.setLiveAccess(f.liveAccess());
        if (f.contactName() != null) s.setContactName(clip(f.contactName(), 120));
        if (f.contactEmail() != null) s.setContactEmail(clip(lower(f.contactEmail()), 160));
        if (f.contactPhone() != null) s.setContactPhone(clip(f.contactPhone(), 40));
        if (f.supportEmail() != null) s.setSupportEmail(clip(lower(f.supportEmail()), 160));
        if (f.supportPhone() != null) s.setSupportPhone(clip(f.supportPhone(), 40));
        if (f.website() != null) s.setWebsite(clip(f.website(), 200));
        if (f.address() != null) s.setAddress(clip(f.address(), 300));
        if (f.notes() != null) s.setNotes(clip(f.notes(), 2000));
    }

    /** A new administrator of the supplier with everything its package allows (they add their own staff after). */
    private User newAccount(Supplier s, String email, String name, String position, String password) {
        User u = new User();
        u.setSupplierId(s.getId());
        u.setEmail(email);
        String username = email.substring(0, email.indexOf('@'));
        if (users.existsByUsernameIgnoreCase(username)) username = username + "-" + s.getCode().toLowerCase(Locale.ROOT);
        while (users.existsByUsernameIgnoreCase(username)) username = username + RANDOM.nextInt(10);
        u.setUsername(username);
        u.setFullName(name.trim());
        byte[] random = new byte[24];
        RANDOM.nextBytes(random);
        // Invited people choose their password through the link; until then nobody knows this one.
        u.setPassword(passwords.encode(password != null ? password : java.util.Base64.getEncoder().encodeToString(random)));
        u.setPasswordLastChanged(LocalDateTime.now());
        u.setStatus(UserStatus.ACTIVE);
        u.setWebAppAccess(true);
        u.setPosition(position);
        u.setPermissions(new ArrayList<>(List.of(UserPermission.values())));   // capped by the package on every request
        return users.save(u);
    }

    private Map<String, Object> invitation(User u, String by, boolean welcome) {
        PasswordSetupService.Issued i = TenantContext.call(u.getSupplierId(), () -> setup.issue(u, baseUrl, by, welcome));
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("emailSent", i.emailSent());
        m.put("link", i.link());
        m.put("expiresAt", i.expiresAt().toString());
        if (i.emailProblem() != null) m.put("emailProblem", i.emailProblem());
        return m;
    }

    private List<User> staffOf(String supplierId) {
        return users.findAll().stream()
            .filter(u -> supplierId.equals(u.getSupplierId() == null || u.getSupplierId().isBlank() ? TenantContext.DEFAULT : u.getSupplierId()))
            .sorted(Comparator.comparing(u -> String.valueOf(u.getFullName()).toLowerCase(Locale.ROOT))).toList();
    }

    private Optional<User> ownerOf(String supplierId) {
        List<User> staff = staffOf(supplierId);
        return staff.stream().filter(u -> "Owner".equalsIgnoreCase(u.getPosition())).findFirst()
            .or(() -> staff.stream().filter(u -> u.getPermissions() != null && u.getPermissions().contains(UserPermission.ACTION_ADMIN_MANAGE_USERS)).findFirst());
    }

    private static Map<String, Object> userView(User u, Supplier s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", u.getId());
        m.put("name", u.getFullName());
        m.put("email", u.getEmail());
        m.put("position", u.getPosition());
        m.put("active", u.getStatus() == null || u.getStatus() == UserStatus.ACTIVE);
        m.put("admin", u.getPermissions() != null && u.getPermissions().contains(UserPermission.ACTION_ADMIN_MANAGE_USERS));
        m.put("permissions", s.plan().cap(u.getPermissions()).size());
        m.put("lastSeen", PresenceService.status(u).equals("offline") && u.getLastSeen() == null ? null : String.valueOf(u.getLastSeen()));
        m.put("presence", PresenceService.status(u));
        return m;
    }

    private static Map<String, Object> view(Supplier s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", s.getId());
        m.put("code", s.getCode());
        m.put("name", s.getName());
        m.put("legalName", s.getLegalName());
        m.put("status", s.getStatus());
        SupplierPlan plan = TenantContext.DEFAULT.equals(s.getId()) ? SupplierPlan.FULL : s.plan();
        m.put("plan", plan.name());
        m.put("planLabel", plan.label());
        m.put("currency", s.getCurrency());
        m.put("country", s.getCountry());
        m.put("timeZone", s.getTimeZone());
        m.put("testAccess", s.isTestAccess());
        m.put("liveAccess", s.isLiveAccess());
        m.put("contactName", s.getContactName());
        m.put("contactEmail", s.getContactEmail());
        m.put("contactPhone", s.getContactPhone());
        m.put("supportEmail", s.getSupportEmail());
        m.put("supportPhone", s.getSupportPhone());
        m.put("website", s.getWebsite());
        m.put("address", s.getAddress());
        m.put("notes", s.getNotes());
        m.put("primary", TenantContext.DEFAULT.equals(s.getId()));
        m.put("slug", TenantContext.DEFAULT.equals(s.getId()) ? null : s.slugOrCode());
        m.put("signInPath", TenantContext.DEFAULT.equals(s.getId()) ? "/" : "/s/" + s.slugOrCode());
        m.put("createdAt", s.getCreatedAt() == null ? null : s.getCreatedAt().toString());
        m.put("updatedAt", s.getUpdatedAt() == null ? null : s.getUpdatedAt().toString());
        return m;
    }

    private List<Map<String, Object>> platformActivity(int limit) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (StaffActivity a : TenantContext.call(TenantContext.DEFAULT, () -> activity.search(null, "platform", null, null, null, null, limit))) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("at", a.getOccurredAt() == null ? null : a.getOccurredAt().toString());
            m.put("by", a.getUserEmail());
            m.put("action", a.getAction());
            m.put("summary", a.getSummary());
            out.add(m);
        }
        return out;
    }

    private void log(Authentication auth, String action, String summary) {
        activity.record(auth.getName(), action, "platform", summary, null, null);
    }

    private static long sum(Map<String, Long> m) { return m.values().stream().mapToLong(Long::longValue).sum(); }
    private static String lower(String s) { return s == null ? "" : s.trim().toLowerCase(Locale.ROOT); }
    private static String clip(String s, int n) { String t = s.trim(); return t.length() <= n ? t : t.substring(0, n); }
    private static ResponseEntity<?> notFound() { return ResponseEntity.status(404).body(Map.of("error", "Not found")); }
    private static ResponseEntity<?> bad(String message) { return ResponseEntity.badRequest().body(Map.of("error", message)); }
}
