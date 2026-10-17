package com.carrental.backend.audit;

import com.carrental.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class ActivityService {

    private static final Logger log = LoggerFactory.getLogger(ActivityService.class);
    private static final Pattern ACTION = Pattern.compile("^[A-Z][A-Z0-9_]{1,63}$");
    public static final Set<String> CATEGORIES = Set.of("auth", "reservation", "agreement", "charges", "invoice", "email", "fleet", "finance", "settings", "staff", "other");

    private final StaffActivityRepository repo;
    private final UserRepository users;

    /** Records an event; never throws, so logging can't break the action being logged. */
    public void record(String userEmail, String action, String category, String summary, String bookingId, String details) {
        try {
            StaffActivity a = new StaffActivity();
            a.setOccurredAt(Instant.now());
            a.setUserEmail(clip(userEmail == null || userEmail.isBlank() ? "unknown" : userEmail, 255));
            a.setUserName(users.findByEmail(a.getUserEmail()).map(u -> u.getFullName()).orElse(null));
            a.setAction(ACTION.matcher(nz(action)).matches() ? action : "OTHER");
            a.setCategory(CATEGORIES.contains(nz(category)) ? category : "other");
            a.setSummary(clip(nz(summary), 500));
            a.setBookingId(bookingId == null || bookingId.isBlank() ? null : clip(bookingId, 64));
            a.setDetails(details == null || details.isBlank() ? null : clip(details, 4000));
            repo.save(a);
        } catch (Exception e) {
            log.warn("Could not record activity {}: {}", action, e.getMessage());
        }
    }

    public List<StaffActivity> search(String user, String category, String bookingId, String q, Instant from, Instant to, int limit) {
        Specification<StaffActivity> spec = (root, query, cb) -> cb.conjunction();
        if (user != null && !user.isBlank()) spec = spec.and((r, qq, cb) -> cb.equal(cb.lower(r.get("userEmail")), user.toLowerCase()));
        if (category != null && !category.isBlank()) spec = spec.and((r, qq, cb) -> cb.equal(r.get("category"), category));
        if (bookingId != null && !bookingId.isBlank()) spec = spec.and((r, qq, cb) -> cb.equal(r.get("bookingId"), bookingId));
        if (from != null) spec = spec.and((r, qq, cb) -> cb.greaterThanOrEqualTo(r.get("occurredAt"), from));
        if (to != null) spec = spec.and((r, qq, cb) -> cb.lessThan(r.get("occurredAt"), to));
        if (q != null && !q.isBlank()) {
            String like = "%" + q.toLowerCase() + "%";
            spec = spec.and((r, qq, cb) -> cb.or(cb.like(cb.lower(r.get("summary")), like), cb.like(cb.lower(r.get("action")), like),
                cb.like(cb.lower(cb.coalesce(r.get("bookingId"), "")), like)));
        }
        int size = Math.max(1, Math.min(limit, 1000));
        return repo.findAll(spec, PageRequest.of(0, size, Sort.by(Sort.Direction.DESC, "occurredAt"))).getContent();
    }

    /** Per staff member: events, last activity and a breakdown by category, for the last N days. */
    public List<Map<String, Object>> summary(int days) {
        Instant since = Instant.now().minus(Math.max(1, Math.min(days, 366)), ChronoUnit.DAYS);
        Map<String, Map<String, Object>> byUser = new LinkedHashMap<>();
        for (Object[] row : repo.summarySince(since)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("userEmail", row[0]);
            m.put("userName", row[1]);
            m.put("events", ((Number) row[2]).longValue());
            m.put("lastActivity", String.valueOf(row[3]));
            m.put("byCategory", new LinkedHashMap<String, Long>());
            byUser.put(String.valueOf(row[0]), m);
        }
        for (Object[] row : repo.categoriesSince(since)) {
            Map<String, Object> m = byUser.get(String.valueOf(row[0]));
            if (m != null) {
                @SuppressWarnings("unchecked") Map<String, Long> c = (Map<String, Long>) m.get("byCategory");
                c.put(String.valueOf(row[1]), ((Number) row[2]).longValue());
            }
        }
        List<Map<String, Object>> out = new ArrayList<>(byUser.values());
        out.sort((a, b) -> String.valueOf(b.get("lastActivity")).compareTo(String.valueOf(a.get("lastActivity"))));
        return out;
    }

    private static String nz(String s) { return s == null ? "" : s; }
    private static String clip(String s, int n) { return s.length() <= n ? s : s.substring(0, n); }
}
