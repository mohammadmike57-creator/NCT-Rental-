package com.carrental.backend.tenant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * A rental company using the platform. Everything a supplier owns (office data, staff, broker channels and their
 * bookings, files, activity) is tied to its id; nobody signed in to one supplier can reach another's.
 * UR-Drive Jordan is the first supplier (id {@value TenantContext#DEFAULT}) and owns all data from before.
 */
@Entity
@Table(name = "suppliers")
public class Supplier {

    public enum Status { ACTIVE, PAUSED, CLOSED }

    @Id
    @Column(length = 40)
    private String id;

    /** Short code shown to brokers (e.g. URD); unique on the platform. */
    @Column(nullable = false, unique = true, length = 12)
    private String code;

    @Column(nullable = false)
    private String name;

    private String legalName;
    private String country;
    @Column(length = 3)
    private String currency;
    private String timeZone;

    @Column(nullable = false, length = 12)
    private String status = Status.ACTIVE.name();

    private Instant createdAt;
    private Instant updatedAt;

    /** The supplier's own sign-in address: www.nctrental.com/s/{slug}. Unique on the platform. */
    @Column(unique = true, length = 40)
    private String slug;

    /** FULL, CRM or XML (see SupplierPlan). */
    @Column(length = 12)
    private String plan = SupplierPlan.FULL.name();

    private String contactName;
    private String contactEmail;
    private String contactPhone;
    private String supportEmail;
    private String supportPhone;
    private String website;
    private String address;
    /** Brokers may use the test (sandbox) key / the live key. */
    private Boolean testAccess = Boolean.TRUE;
    private Boolean liveAccess = Boolean.TRUE;
    @Column(length = 2000)
    private String notes;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getLegalName() { return legalName; }
    public void setLegalName(String legalName) { this.legalName = legalName; }
    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public String getTimeZone() { return timeZone; }
    public void setTimeZone(String timeZone) { this.timeZone = timeZone; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public String getSlug() { return slug; }
    public void setSlug(String slug) { this.slug = slug; }
    /** The address part people use: the chosen one, or the code in small letters. */
    public String slugOrCode() { return slug == null || slug.isBlank() ? code.toLowerCase(java.util.Locale.ROOT) : slug; }
    public String getPlan() { return plan; }
    public void setPlan(String plan) { this.plan = plan; }
    public SupplierPlan plan() { return SupplierPlan.of(plan); }
    public String getContactName() { return contactName; }
    public void setContactName(String v) { this.contactName = v; }
    public String getContactEmail() { return contactEmail; }
    public void setContactEmail(String v) { this.contactEmail = v; }
    public String getContactPhone() { return contactPhone; }
    public void setContactPhone(String v) { this.contactPhone = v; }
    public String getSupportEmail() { return supportEmail; }
    public void setSupportEmail(String v) { this.supportEmail = v; }
    public String getSupportPhone() { return supportPhone; }
    public void setSupportPhone(String v) { this.supportPhone = v; }
    public String getWebsite() { return website; }
    public void setWebsite(String v) { this.website = v; }
    public String getAddress() { return address; }
    public void setAddress(String v) { this.address = v; }
    public boolean isTestAccess() { return !Boolean.FALSE.equals(testAccess); }
    public void setTestAccess(boolean v) { this.testAccess = v; }
    public boolean isLiveAccess() { return !Boolean.FALSE.equals(liveAccess); }
    public void setLiveAccess(boolean v) { this.liveAccess = v; }
    public String getNotes() { return notes; }
    public void setNotes(String v) { this.notes = v; }

    public boolean isActive() { return Status.ACTIVE.name().equals(status); }
}
