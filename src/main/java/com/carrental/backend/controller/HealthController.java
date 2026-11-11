package com.carrental.backend.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.sql.DataSource;
import java.sql.Connection;

/**
 * Health check for the hosting platform (Render: Settings → Health Check Path = /health).
 * "OK" only when the server can reach its database; otherwise 503, so the platform can restart
 * the server or raise an alert. Public, and says nothing about the system beyond up or down.
 */
@RestController
public class HealthController {

    private final DataSource dataSource;

    public HealthController(DataSource dataSource) { this.dataSource = dataSource; }

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        try (Connection c = dataSource.getConnection()) {
            if (c.isValid(3)) return ResponseEntity.ok("OK");
        } catch (Exception ignored) {
            // reported below
        }
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body("DATABASE DOWN");
    }
}
