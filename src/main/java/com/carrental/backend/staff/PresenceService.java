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
import java.util.List;

/**
 * "Last seen" for staff accounts. The app sends a heartbeat while someone is actually using it
 * (and every recorded action counts too); a user is online when seen within the last few minutes.
 * Times are stored in UTC.
 */
@Service
@RequiredArgsConstructor
public class PresenceService {

    private static final Logger log = LoggerFactory.getLogger(PresenceService.class);
    static final Duration ONLINE_WINDOW = Duration.ofMinutes(3);
    private static final Duration WRITE_EVERY = Duration.ofSeconds(45);

    private final UserRepository users;

    public static LocalDateTime nowUtc() { return LocalDateTime.now(ZoneOffset.UTC); }

    /** Marks the user as seen now; never throws. */
    public void touch(String email, String deviceType) {
        if (email == null || email.isBlank()) return;
        LocalDateTime now = nowUtc();
        try {
            users.findByEmailIgnoreCase(email).ifPresent(u -> {
                // Busy users don't cause a database write per request.
                boolean fresh = Boolean.TRUE.equals(u.getIsOnline()) && u.getLastSeen() != null
                    && Duration.between(u.getLastSeen(), now).compareTo(WRITE_EVERY) < 0;
                if (fresh && (deviceType == null || deviceType.equals(u.getDeviceType()))) return;
                u.setLastSeen(now);
                u.setIsOnline(true);
                if (deviceType != null && (deviceType.equals("mobile") || deviceType.equals("desktop"))) u.setDeviceType(deviceType);
                users.save(u);
            });
        } catch (Exception e) {
            log.warn("Could not update last seen for {}: {}", email, e.getMessage());
        }
    }

    /** Signed out: shown as offline straight away, keeping the time they were last seen. */
    public void signedOut(String email) {
        if (email == null || email.isBlank()) return;
        try {
            users.findByEmailIgnoreCase(email).ifPresent(u -> {
                u.setLastSeen(nowUtc());
                u.setIsOnline(false);
                users.save(u);
            });
        } catch (Exception e) {
            log.warn("Could not mark {} offline: {}", email, e.getMessage());
        }
    }

    /** Online means seen within the window and not signed out since. */
    public static boolean isOnline(User u) {
        return Boolean.TRUE.equals(u.getIsOnline()) && u.getLastSeen() != null
            && Duration.between(u.getLastSeen(), nowUtc()).compareTo(ONLINE_WINDOW) <= 0;
    }

    /** Fills in the live online flag (not saved) before the accounts are returned to the app. */
    public List<User> withLiveStatus(List<User> list) {
        list.forEach(u -> u.setIsOnline(isOnline(u)));
        return list;
    }
}
