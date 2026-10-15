package com.carrental.backend.controller;

import com.carrental.backend.service.FleetBalanceService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;

/**
 * Fleet Balance Management Controller
 * Provides comprehensive fleet utilization and balance analytics
 */
@RestController
@RequestMapping("/api/fleet-balance")
public class FleetBalanceController {

    private static final Logger logger = LoggerFactory.getLogger(FleetBalanceController.class);

    @Autowired
    private FleetBalanceService fleetBalanceService;

    /**
     * Get comprehensive fleet balance dashboard
     *
     * GET /api/fleet-balance/dashboard?startDate=2025-01-01&endDate=2025-01-31
     */
    @GetMapping("/dashboard")
    public ResponseEntity<Map<String, Object>> getFleetBalanceDashboard(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {

        logger.info("Fleet balance dashboard requested for {} to {}", startDate, endDate);

        try {
            Map<String, Object> dashboard = fleetBalanceService.getFleetBalanceDashboard(startDate, endDate);
            return ResponseEntity.ok(dashboard);
        } catch (Exception e) {
            logger.error("Error generating fleet balance dashboard", e);
            return ResponseEntity.internalServerError()
                .body(Map.of("error", "Failed to generate dashboard", "message", e.getMessage()));
        }
    }

    /**
     * Get fleet balance dashboard for current month
     */
    @GetMapping("/dashboard/current-month")
    public ResponseEntity<Map<String, Object>> getCurrentMonthDashboard() {
        LocalDate startDate = LocalDate.now().withDayOfMonth(1);
        LocalDate endDate = LocalDate.now();

        return getFleetBalanceDashboard(startDate, endDate);
    }

    /**
     * Get fleet balance dashboard for last 30 days
     */
    @GetMapping("/dashboard/last-30-days")
    public ResponseEntity<Map<String, Object>> getLast30DaysDashboard() {
        LocalDate endDate = LocalDate.now();
        LocalDate startDate = endDate.minusDays(30);

        return getFleetBalanceDashboard(startDate, endDate);
    }
}
