package com.carrental.backend.config;

import com.carrental.backend.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class E2eSeedTest {

    private final UserRepository users = Mockito.mock(UserRepository.class);

    @Test
    void neverRunsAgainstARealDatabase() {
        E2eSeed seed = new E2eSeed(users, new BCryptPasswordEncoder(4), "jdbc:postgresql://db.example.com/nct", "a-long-test-password");
        IllegalStateException e = assertThrows(IllegalStateException.class, seed::run);
        assertTrue(e.getMessage().contains("in-memory"));
        Mockito.verifyNoInteractions(users);
    }

    @Test
    void needsAPassword() {
        E2eSeed seed = new E2eSeed(users, new BCryptPasswordEncoder(4), "jdbc:h2:mem:e2e", "");
        assertThrows(IllegalStateException.class, seed::run);
        Mockito.verifyNoInteractions(users);
    }
}
