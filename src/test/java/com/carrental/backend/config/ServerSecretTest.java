package com.carrental.backend.config;

import com.carrental.backend.ota.SecretBox;
import com.carrental.backend.security.JwtUtil;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;

class ServerSecretTest {

    static final String OLD = "old-secret-value-that-is-long-enough-1234567890";
    static final String NEW = "new-secret-value-that-is-long-enough-0987654321";

    @Test
    void refusesToStartWithoutASecretOrWithAShortOne() {
        IllegalStateException missing = assertThrows(IllegalStateException.class, () -> new ServerSecret("", ""));
        assertTrue(missing.getMessage().contains("JWT_SECRET is not set"));
        assertTrue(missing.getMessage().contains("What the server received: JWT_SECRET"), "says what reached the server");
        assertThrows(IllegalStateException.class, () -> new ServerSecret("short", ""));
    }

    @Test
    void currentFirstThenPrevious() {
        ServerSecret s = new ServerSecret(NEW, OLD + ", " + NEW);
        assertEquals(NEW, s.current());
        assertEquals(java.util.List.of(NEW, OLD), s.all());
        assertFalse(s.isPublishedValue());
    }

    @Test
    void storedSecretsStayReadableAfterTheSecretChanges() {
        String sealed = new SecretBox(new ServerSecret(OLD, "")).seal("smtp-password");
        assertEquals("smtp-password", new SecretBox(new ServerSecret(NEW, OLD)).open(sealed), "readable with JWT_SECRET_PREVIOUS");
        assertThrows(IllegalStateException.class, () -> new SecretBox(new ServerSecret(NEW, "")).open(sealed), "not readable without it");
    }

    @Test
    void loginsStayValidAfterTheSecretChanges() {
        JwtUtil before = jwt(new ServerSecret(OLD, ""));
        String token = before.generateToken("staff@example.com");
        assertEquals("staff@example.com", jwt(new ServerSecret(NEW, OLD)).extractEmail(token));
        assertThrows(io.jsonwebtoken.security.SignatureException.class, () -> jwt(new ServerSecret(NEW, "")).extractEmail(token));
        // New logins are signed with the new secret only.
        String fresh = jwt(new ServerSecret(NEW, OLD)).generateToken("staff@example.com");
        assertThrows(io.jsonwebtoken.security.SignatureException.class, () -> jwt(new ServerSecret(OLD, "")).extractEmail(fresh));
    }

    private static JwtUtil jwt(ServerSecret s) {
        JwtUtil u = new JwtUtil(s);
        ReflectionTestUtils.setField(u, "expiration", 3_600_000L);
        return u;
    }
}
