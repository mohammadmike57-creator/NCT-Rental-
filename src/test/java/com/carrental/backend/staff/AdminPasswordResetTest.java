package com.carrental.backend.staff;

import com.carrental.backend.audit.ActivityService;
import com.carrental.backend.model.User;
import com.carrental.backend.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** ADMIN_PASSWORD_RESET: the server-side way back in when the only administrator forgot the password. */
class AdminPasswordResetTest {

    final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    final UserRepository users = mock(UserRepository.class);
    final ActivityService activity = mock(ActivityService.class);

    User admin() {
        User u = new User();
        u.setEmail("admin@example.test"); u.setUsername("admin"); u.setPassword(encoder.encode("Old-Pass-1234"));
        return u;
    }

    AdminPasswordReset reset(String setting) { return new AdminPasswordReset(setting, users, encoder, activity); }

    @Test
    void resetsTheAccountFoundByUsername() {
        User u = admin();
        when(users.findByEmail(any())).thenReturn(Optional.empty());
        when(users.findByEmailIgnoreCase(any())).thenReturn(Optional.empty());
        when(users.findFirstByUsernameIgnoreCase("admin")).thenReturn(Optional.of(u));
        String r = reset("admin:New-Pass:with-colon-99").apply();
        assertTrue(r.contains("was reset"), r);
        assertFalse(r.contains("New-Pass"), "the password never reaches the log");
        assertTrue(encoder.matches("New-Pass:with-colon-99", u.getPassword()));
        verify(users).save(u);
        // A restart with the setting still there changes nothing more.
        String again = reset("admin:New-Pass:with-colon-99").apply();
        assertTrue(again.contains("already set"), again);
        verify(users, times(1)).save(u);
    }

    @Test
    void doesNothingWhenUnsetMalformedWeakOrUnknown() {
        assertNull(reset("").apply());
        assertTrue(reset("admin").apply().startsWith("ignored"));
        assertTrue(reset("admin:short").apply().startsWith("ignored"));
        when(users.findByEmail(any())).thenReturn(Optional.empty());
        when(users.findByEmailIgnoreCase(any())).thenReturn(Optional.empty());
        when(users.findFirstByUsernameIgnoreCase(any())).thenReturn(Optional.empty());
        assertTrue(reset("nobody:Good-Pass-1234").apply().contains("no account"));
        verify(users, never()).save(any());
    }
}
