package com.carrental.backend.tenant;

import com.carrental.backend.model.AppData;
import com.carrental.backend.repository.AppDataRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

/** The suppliers on the platform and where each one's office data is kept. */
@Service
@Order(1)
public class SupplierService implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SupplierService.class);
    private static final Pattern CODE = Pattern.compile("^[A-Z0-9]{2,12}$");
    /** Office data of suppliers other than UR-Drive Jordan: one row each in app_data (UR-Drive keeps "main"). */
    static final String DOCUMENT_PREFIX = "supplier-";

    private final SupplierRepository suppliers;
    private final AppDataRepository documents;
    private final PlatformSettings platform;
    private final ObjectMapper json;

    public SupplierService(SupplierRepository suppliers, AppDataRepository documents, PlatformSettings platform, ObjectMapper json) {
        this.suppliers = suppliers;
        this.documents = documents;
        this.platform = platform;
        this.json = json;
    }

    /** UR-Drive Jordan exists as the first supplier on every start (it owns everything from before). */
    @Override
    public void run(ApplicationArguments args) {
        ensureDefault();
    }

    public synchronized Supplier ensureDefault() {
        return suppliers.findById(TenantContext.DEFAULT).orElseGet(() -> {
            Supplier s = new Supplier();
            s.setId(TenantContext.DEFAULT);
            s.setCode("URD");
            s.setName("UR-Drive Jordan");
            s.setCountry("JO");
            s.setCurrency("JOD");
            s.setTimeZone("Asia/Amman");
            s.setCreatedAt(Instant.now());
            log.info("Supplier UR-Drive Jordan (URD) recorded as the owner of the existing data");
            return suppliers.save(s);
        });
    }

    /** Where a supplier's office data is kept: UR-Drive Jordan keeps the original row "main". */
    public static String documentId(String supplierId) {
        return TenantContext.DEFAULT.equals(supplierId) ? "main" : DOCUMENT_PREFIX + supplierId;
    }

    public Optional<Supplier> find(String id) { return id == null ? Optional.empty() : suppliers.findById(id); }

    public List<Supplier> all() { return suppliers.findAll(); }

    /** Suppliers whose data and brokers are in use (UR-Drive Jordan always; others only with MULTI_SUPPLIER on). */
    public List<String> activeIds() {
        if (!platform.multiSupplier()) return List.of(TenantContext.DEFAULT);
        return suppliers.findAll().stream().filter(Supplier::isActive).map(Supplier::getId).toList();
    }

    /** True when people and brokers of this supplier may work now. */
    public boolean isActive(String supplierId) {
        if (TenantContext.DEFAULT.equals(supplierId)) return true;   // UR-Drive Jordan is never switched off by this
        if (!platform.multiSupplier()) return false;
        return suppliers.findById(supplierId).map(Supplier::isActive).orElse(false);
    }

    public Supplier save(Supplier s) {
        s.setUpdatedAt(Instant.now());
        return suppliers.save(s);
    }

    /** The supplier's package (UR-Drive Jordan always has the full system). */
    public SupplierPlan planOf(String supplierId) {
        if (supplierId == null || TenantContext.DEFAULT.equals(supplierId)) return SupplierPlan.FULL;
        return suppliers.findById(supplierId).map(Supplier::plan).orElse(SupplierPlan.FULL);
    }

    /** Fills the account's supplier name, package and what the package allows, for the app (nothing is stored). */
    public com.carrental.backend.model.User describe(com.carrental.backend.model.User u) {
        if (u == null) return null;
        // The supplier the request works for: the account's own, or the one a platform support sign-in opened.
        String id = TenantContext.isBound() ? TenantContext.current()
            : u.getSupplierId() == null || u.getSupplierId().isBlank() ? TenantContext.DEFAULT : u.getSupplierId();
        Supplier s = suppliers.findById(id).orElse(null);
        SupplierPlan plan = TenantContext.DEFAULT.equals(id) || s == null ? SupplierPlan.FULL : s.plan();
        u.setSupplierName(s == null ? null : s.getName());
        u.setSupplierCode(s == null ? null : TenantContext.DEFAULT.equals(id) ? s.getCode() : s.slugOrCode());   // used in the sign-in link
        u.setSupplierPlan(plan.name());
        u.setPlanPermissions(new java.util.ArrayList<>(plan.permissions()));
        return u;
    }

    private static final Pattern SLUG = Pattern.compile("^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$");
    /** Words that are pages of the site itself, never a supplier's address. */
    private static final java.util.Set<String> RESERVED = java.util.Set.of("admin", "api", "auth", "login", "logout", "s", "set-password",
        "ota", "xml", "partner", "oauth", "static", "assets", "guide", "help", "support", "www", "app", "platform", "urd", "nct");

    /** A suggested address from a name: "Desert Drive Rentals" → desert-drive-rentals. */
    public static String suggestSlug(String name) {
        String s = java.text.Normalizer.normalize(name == null ? "" : name, java.text.Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");
        if (s.length() > 40) s = s.substring(0, 40).replaceAll("-+$", "");
        return s;
    }

    /** Why this address cannot be used by the supplier ({@code self}: its own id, or null for a new one), or null when it can. */
    public String slugProblem(String slug, String self) {
        String s = slug == null ? "" : slug.trim().toLowerCase(Locale.ROOT);
        if (!SLUG.matcher(s).matches() || s.contains("--"))
            return "Use 3 to 40 small letters, digits or single hyphens, starting and ending with a letter or digit.";
        if (RESERVED.contains(s)) return "This address is reserved for the site itself. Choose another.";
        Optional<Supplier> bySlug = suppliers.findBySlugIgnoreCase(s);
        if (bySlug.isPresent() && !bySlug.get().getId().equals(self)) return "Another supplier already uses this address.";
        Optional<Supplier> byCode = suppliers.findByCodeIgnoreCase(s);
        if (byCode.isPresent() && !byCode.get().getId().equals(self)) return "Another supplier's code is the same as this address.";
        return null;
    }

    /** The supplier whose sign-in address (or code) this is. */
    public Optional<Supplier> byAddress(String slugOrCode) {
        if (slugOrCode == null || slugOrCode.isBlank()) return Optional.empty();
        String s = slugOrCode.trim();
        return suppliers.findBySlugIgnoreCase(s).or(() -> suppliers.findByCodeIgnoreCase(s));
    }

    /** Adds a supplier with its own empty office data. Needs MULTI_SUPPLIER on. */
    public synchronized Supplier create(String code, String name, String currency, String country, String timeZone) {
        if (!platform.multiSupplier()) throw new IllegalStateException("More suppliers are not switched on (MULTI_SUPPLIER)");
        String c = code == null ? "" : code.trim().toUpperCase(Locale.ROOT);
        if (!CODE.matcher(c).matches()) throw new IllegalArgumentException("Supplier code: 2 to 12 letters or digits");
        if (name == null || name.isBlank()) throw new IllegalArgumentException("Supplier name is required");
        if (suppliers.existsByCodeIgnoreCase(c) || suppliers.existsById(c.toLowerCase(Locale.ROOT)))
            throw new IllegalArgumentException("Supplier code " + c + " is already used");
        Supplier s = new Supplier();
        s.setId(c.toLowerCase(Locale.ROOT));
        s.setCode(c);
        s.setName(name.trim());
        s.setCurrency(currency == null || currency.isBlank() ? "USD" : currency.trim().toUpperCase(Locale.ROOT));
        s.setCountry(country);
        s.setTimeZone(timeZone == null || timeZone.isBlank() ? "UTC" : timeZone.trim());
        s.setCreatedAt(Instant.now());
        suppliers.save(s);
        AppData doc = new AppData();
        doc.setId(documentId(s.getId()));
        doc.setData(emptyDocument(s));
        documents.save(doc);
        log.info("Supplier {} ({}) created", s.getName(), s.getCode());
        return s;
    }

    /** A new supplier's office data: its name and currency, and nothing of anyone else's. */
    String emptyDocument(Supplier s) {
        ObjectNode d = json.createObjectNode();
        d.putObject("reservations");
        d.putArray("sources").addObject().put("id", "1").put("name", "Walk-in").put("paymentType", "Pay on Arrival");
        d.putArray("fleet");
        // Every company field present (empty), so nothing of anyone else's is ever filled in.
        d.putObject("companyDetails").put("name", s.getName()).put("subName", "").put("address", "").put("phone", "")
            .put("email", "").put("taxNumber", "").put("website", "").put("currency", s.getCurrency()).put("requirePaymentApproval", false);
        for (String k : List.of("trafficTickets", "vehicleDamages", "users", "expenses", "rentalLocations", "messages", "invoices",
                "availableExtras", "franchisePayments", "activityLog", "aggregators", "stopSales")) d.putArray(k);
        int year = LocalDate.now().getYear();
        d.putArray("years").add(year).add(year + 1);
        try {
            return json.writeValueAsString(d);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
