package com.carrental.backend.staff;

import com.carrental.backend.model.User;
import com.carrental.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Who is online. Every signed-in request marks the person as seen (so anyone with the app open
 * counts, whatever version of the app they have loaded); pressing, typing or saving also marks
 * them as active. Status:
 *   online   app open and used in the last 5 minutes
 *   away     app open, but not touched for 5 minutes or more
 *   offline  nothing from them for 3 minutes, or signed out
 * Times are stored in UTC. The screen each person has open is kept in memory only.
 */
@Service
@RequiredArgsConstructor
public class PresenceService {

    private static final Logger log = LoggerFactory.getLogger(PresenceService.class);
    static final Duration OPEN_WINDOW = Duration.ofMinutes(3);
    static final Duration ACTIVE_WINDOW = Duration.ofMinutes(5);
    private static final Duration WRITE_EVERY = Duration.ofSeconds(45);

    private final UserRepository users;
    private final Map<String, String> screens = new ConcurrentHashMap<>();

    public static LocalDateTime nowUtc() { return LocalDateTime.now(ZoneOffset.UTC); }

    private static boolean recent(LocalDateTime t, LocalDateTime now, Duration d) {
        return t != null && Duration.between(t, now).compareTo(d) < 0;
    }

    /** A signed-in request: seen now, and active too when they changed something. Never throws. */
    public void seen(String email, boolean active) {
        update(email, active, null, null);
    }

    /** The app's heartbeat, sent while the person is using it. */
    public void heartbeat(String email, String deviceType, String screen) {
        if (email != null && screen != null && !screen.isBlank()) screens.put(email.toLowerCase(), screen.length() > 80 ? screen.substring(0, 80) : screen);
        update(email, true, deviceType, screen);
    }

    private void update(String email, boolean active, String deviceType, String screen) {
        if (email == null || email.isBlank()) return;
        LocalDateTime now = nowUtc();
        try {
            users.findByEmail(email).ifPresent(u -> {
                boolean seenFresh = Boolean.TRUE.equals(u.getIsOnline()) && recent(u.getLastSeen(), now, WRITE_EVERY);
                boolean activeFresh = !active || recent(u.getLastActiveAt(), now, WRITE_EVERY);
                String device = "mobile".equals(deviceType) || "desktop".equals(deviceType) ? deviceType : null;
                boolean deviceSame = device == null || device.equals(u.getDeviceType());
                // Busy users don't cause a database write per request.
                if (seenFresh && activeFresh && deviceSame) return;
                u.setLastSeen(now);
                u.setIsOnline(true);
                if (active) u.setLastActiveAt(now);
                if (device != null) u.setDeviceType(device);
                users.save(u);
            });
        } catch (Exception e) {
            log.warn("Could not update presence for {}: {}", email, e.getMessage());
        }
    }

    /** Signed out: offline straight away, keeping the time they were last seen. */
    public void signedOut(String email) {
        if (email == null || email.isBlank()) return;
        screens.remove(email.toLowerCase());
        try {
            users.findByEmail(email).ifPresent(u -> {
                u.setLastSeen(nowUtc());
                u.setIsOnline(false);
                users.save(u);
            });
        } catch (Exception e) {
            log.warn("Could not mark {} offline: {}", email, e.getMessage());
        }
    }

    public static String status(User u) {
        LocalDateTime now = nowUtc();
        if (!Boolean.TRUE.equals(u.getIsOnline()) || !recent(u.getLastSeen(), now, OPEN_WINDOW)) return "offline";
        return recent(u.getLastActiveAt(), now, ACTIVE_WINDOW) ? "online" : "away";
    }

    /** Fills in the live status and open screen (not saved) before accounts are returned to the app. */
    public List<User> withLiveStatus(List<User> list) {
        list.forEach(u -> {
            String st = status(u);
            u.setPresence(st);
            u.setIsOnline(!"offline".equals(st));
            u.setCurrentScreen("offline".equals(st) || u.getEmail() == null ? null : screens.get(u.getEmail().toLowerCase()));
        });
        return list;
    }

    /** The people online or away right now, most recently active first. */
    public List<Map<String, Object>> onlineNow() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (User u : withLiveStatus(new ArrayList<>(users.findAll()))) {
            if ("offline".equals(u.getPresence())) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", u.getId());
            m.put("email", u.getEmail());
            m.put("fullName", u.getFullName());
            m.put("position", u.getPosition());
            m.put("presence", u.getPresence());
            m.put("currentScreen", u.getCurrentScreen());
            m.put("deviceType", u.getDeviceType());
            m.put("lastSeen", u.getLastSeen());
            m.put("lastActiveAt", u.getLastActiveAt());
            out.add(m);
        }
        out.sort(Comparator.comparing((Map<String, Object> m) -> "online".equals(m.get("presence")) ? 0 : 1)
            .thenComparing(m -> String.valueOf(m.get("lastActiveAt")), Comparator.reverseOrder()));
        return out;
    }
}
