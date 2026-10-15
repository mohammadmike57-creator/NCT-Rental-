package com.carrental.backend.controller;

import com.carrental.backend.service.ProfessionalSummaryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;

/**
 * Executive Summary & Dashboard Controller
 * Provides comprehensive business intelligence and KPIs
 */
@RestController
@RequestMapping("/api/summary")
public class SummaryDashboardController {

    private static final Logger logger = LoggerFactory.getLogger(SummaryDashboardController.class);

    @Autowired
    private ProfessionalSummaryService summaryService;

    /**
     * Get comprehensive executive dashboard
     *
     * GET /api/summary/dashboard?startDate=2025-01-01&endDate=2025-01-31
     */
    @GetMapping("/dashboard")
    public ResponseEntity<Map<String, Object>> getExecutiveDashboard(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {

        logger.info("Executive dashboard requested for {} to {}", startDate, endDate);

        try {
            Map<String, Object> dashboard = summaryService.getExecutiveDashboard(startDate, endDate);
            return ResponseEntity.ok(dashboard);
        } catch (Exception e) {
            logger.error("Error generating executive dashboard", e);
            return ResponseEntity.internalServerError()
                .body(Map.of("error", "Failed to generate dashboard", "message", e.getMessage()));
        }
    }

    /**
     * Get today's summary
     */
    @GetMapping("/today")
    public ResponseEntity<Map<String, Object>> getTodaySummary() {
        LocalDate today = LocalDate.now();
        return getExecutiveDashboard(today, today);
    }

    /**
     * Get current week summary
     */
    @GetMapping("/current-week")
    public ResponseEntity<Map<String, Object>> getCurrentWeekSummary() {
        LocalDate today = LocalDate.now();
        LocalDate startOfWeek = today.minusDays(today.getDayOfWeek().getValue() - 1);
        return getExecutiveDashboard(startOfWeek, today);
    }

    /**
     * Get current month summary
     */
    @GetMapping("/current-month")
    public ResponseEntity<Map<String, Object>> getCurrentMonthSummary() {
        LocalDate startDate = LocalDate.now().withDayOfMonth(1);
        LocalDate endDate = LocalDate.now();
        return getExecutiveDashboard(startDate, endDate);
    }

    /**
     * Get last 30 days summary
     */
    @GetMapping("/last-30-days")
    public ResponseEntity<Map<String, Object>> getLast30DaysSummary() {
        LocalDate endDate = LocalDate.now();
        LocalDate startDate = endDate.minusDays(30);
        return getExecutiveDashboard(startDate, endDate);
    }

    /**
     * Get current quarter summary
     */
    @GetMapping("/current-quarter")
    public ResponseEntity<Map<String, Object>> getCurrentQuarterSummary() {
        LocalDate today = LocalDate.now();
        int quarter = (today.getMonthValue() - 1) / 3;
        LocalDate startOfQuarter = LocalDate.of(today.getYear(), quarter * 3 + 1, 1);
        return getExecutiveDashboard(startOfQuarter, today);
    }

    /**
     * Get current year summary
     */
    @GetMapping("/current-year")
    public ResponseEntity<Map<String, Object>> getCurrentYearSummary() {
        LocalDate startOfYear = LocalDate.of(LocalDate.now().getYear(), 1, 1);
        LocalDate endDate = LocalDate.now();
        return getExecutiveDashboard(startOfYear, endDate);
    }
}
