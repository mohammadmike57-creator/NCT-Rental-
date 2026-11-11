package com.carrental.backend;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

public class PasswordHashTest {

    @Test
    public void generateHashes() {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(10);
        System.out.println("tia123: " + encoder.encode("tia123"));
        System.out.println("airport123: " + encoder.encode("airport123"));
        System.out.println("rami123: " + encoder.encode("rami123"));
    }
}
