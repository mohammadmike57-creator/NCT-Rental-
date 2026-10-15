package com.carrental.backend.service;

import com.carrental.backend.model.Reservation;
import com.carrental.backend.model.ReservationStatus;
import com.carrental.backend.model.Vehicle;
import com.carrental.backend.repository.ReservationRepository;
import com.carrental.backend.repository.VehicleRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * EXTREMELY PROFESSIONAL FLEET BALANCE SERVICE
 *
 * Provides comprehensive fleet utilization analytics and balance management:
 * - Real-time fleet utilization tracking
 * - Category-wise availability analysis
 * - Revenue per vehicle calculations
 * - Utilization rate metrics
 * - Overbooking detection and alerts
 * - Fleet efficiency scoring
 * - Predictive availability forecasting
 * - Performance benchmarking
 */
@Service
public class FleetBalanceService {

    private static final Logger logger = LoggerFactory.getLogger(FleetBalanceService.class);

    @Autowired
    private VehicleRepository vehicleRepository;

    @Autowired
    private ReservationRepository reservationRepository;

    /**
     * Get comprehensive fleet balance dashboard
     * Returns complete overview of fleet status, utilization, and performance
     */
    public Map<String, Object> getFleetBalanceDashboard(LocalDate startDate, LocalDate endDate) {
        logger.info("Generating fleet balance dashboard for {} to {}", startDate, endDate);

        Map<String, Object> dashboard = new HashMap<>();

        // 1. Overall Fleet Statistics
        dashboard.put("fleetOverview", getFleetOverview());

        // 2. Utilization Metrics
        dashboard.put("utilizationMetrics", getUtilizationMetrics(startDate, endDate));

        // 3. Category-wise Analysis
        dashboard.put("categoryAnalysis", getCategoryWiseAnalysis(startDate, endDate));

        // 4. Revenue Analysis
        dashboard.put("revenueAnalysis", getRevenueAnalysis(startDate, endDate));

        // 5. Availability Forecast
        dashboard.put("availabilityForecast", getAvailabilityForecast(startDate, endDate));

        // 6. Performance Score
        dashboard.put("performanceScore", calculateFleetPerformanceScore(startDate, endDate));

        // 7. Alerts and Warnings
        dashboard.put("alerts", generateFleetAlerts(startDate, endDate));

        // 8. Daily Utilization Timeline
        dashboard.put("dailyUtilization", getDailyUtilizationTimeline(startDate, endDate));

        logger.info("Fleet balance dashboard generated successfully");
        return dashboard;
    }

    /**
     * 1. Fleet Overview Statistics
     */
    private Map<String, Object> getFleetOverview() {
        List<Vehicle> allVehicles = vehicleRepository.findAll();

        Map<String, Object> overview = new HashMap<>();
        overview.put("totalVehicles", allVehicles.size());
        overview.put("availableVehicles", allVehicles.stream()
            .filter(v -> v.getStatus() == Vehicle.VehicleStatus.AVAILABLE)
            .count());
        overview.put("rentedVehicles", allVehicles.stream()
            .filter(v -> v.getStatus() == Vehicle.VehicleStatus.RENTED)
            .count());
        overview.put("maintenanceVehicles", allVehicles.stream()
            .filter(v -> v.getStatus() == Vehicle.VehicleStatus.MAINTENANCE)
            .count());
        overview.put("reservedVehicles", allVehicles.stream()
            .filter(v -> v.getStatus() == Vehicle.VehicleStatus.RESERVED)
            .count());

        // Vehicle age distribution
        Map<String, Long> ageDistribution = allVehicles.stream()
            .collect(Collectors.groupingBy(v -> getVehicleAgeCategory(v.getYear()), Collectors.counting()));
        overview.put("ageDistribution", ageDistribution);

        return overview;
    }

    /**
     * 2. Utilization Metrics
     */
    private Map<String, Object> getUtilizationMetrics(LocalDate startDate, LocalDate endDate) {
        List<Reservation> reservations = reservationRepository.findByDateRange(startDate, endDate);
        List<Vehicle> allVehicles = vehicleRepository.findAll();

        long totalDays = ChronoUnit.DAYS.between(startDate, endDate);
        long totalFleetDays = totalDays * allVehicles.size();

        // Calculate total rental days
        long totalRentalDays = reservations.stream()
            .filter(r -> r.getStatus() == ReservationStatus.CONFIRMED ||
                        r.getStatus() == ReservationStatus.ACTIVE ||
                        r.getStatus() == ReservationStatus.COMPLETED)
            .mapToLong(r -> ChronoUnit.DAYS.between(r.getStartDate(), r.getEndDate()))
            .sum();

        // Calculate utilization rate
        double utilizationRate = totalFleetDays > 0 ?
            (totalRentalDays * 100.0) / totalFleetDays : 0.0;

        Map<String, Object> metrics = new HashMap<>();
        metrics.put("totalFleetDays", totalFleetDays);
        metrics.put("totalRentalDays", totalRentalDays);
        metrics.put("totalIdleDays", totalFleetDays - totalRentalDays);
        metrics.put("utilizationRate", round(utilizationRate, 2));
        metrics.put("utilizationRating", getUtilizationRating(utilizationRate));

        // Average rental duration
        double avgRentalDuration = reservations.isEmpty() ? 0 :
            reservations.stream()
                .mapToLong(r -> ChronoUnit.DAYS.between(r.getStartDate(), r.getEndDate()))
                .average()
                .orElse(0.0);
        metrics.put("avgRentalDuration", round(avgRentalDuration, 1));

        // Peak utilization day
        metrics.put("peakUtilizationDay", findPeakUtilizationDay(startDate, endDate));

        // Utilization trend
        metrics.put("utilizationTrend", calculateUtilizationTrend(startDate, endDate));

        return metrics;
    }

    /**
     * 3. Category-wise Analysis
     */
    private List<Map<String, Object>> getCategoryWiseAnalysis(LocalDate startDate, LocalDate endDate) {
        List<Vehicle> allVehicles = vehicleRepository.findAll();
        List<Reservation> reservations = reservationRepository.findByDateRange(startDate, endDate);

        // Group vehicles by category
        Map<String, List<Vehicle>> vehiclesByCategory = allVehicles.stream()
            .collect(Collectors.groupingBy(v -> v.getCategory() != null ? v.getCategory() : "Uncategorized"));

        List<Map<String, Object>> categoryAnalysis = new ArrayList<>();

        for (Map.Entry<String, List<Vehicle>> entry : vehiclesByCategory.entrySet()) {
            String category = entry.getKey();
            List<Vehicle> categoryVehicles = entry.getValue();

            Map<String, Object> analysis = new HashMap<>();
            analysis.put("category", category);
            analysis.put("totalVehicles", categoryVehicles.size());

            // Count available vehicles in category
            long available = categoryVehicles.stream()
                .filter(v -> v.getStatus() == Vehicle.VehicleStatus.AVAILABLE)
                .count();
            analysis.put("availableVehicles", available);

            // Calculate utilization for this category
            long totalDays = ChronoUnit.DAYS.between(startDate, endDate) * categoryVehicles.size();

            Set<String> categoryVehicleIds = categoryVehicles.stream()
                .map(Vehicle::getId)
                .collect(Collectors.toSet());

            long rentalDays = reservations.stream()
                .filter(r -> r.getAssignedVehicle() != null &&
                            categoryVehicleIds.contains(r.getAssignedVehicle().getId()))
                .mapToLong(r -> ChronoUnit.DAYS.between(r.getStartDate(), r.getEndDate()))
                .sum();

            double categoryUtilization = totalDays > 0 ? (rentalDays * 100.0) / totalDays : 0.0;
            analysis.put("utilizationRate", round(categoryUtilization, 2));

            // Revenue for category
            double categoryRevenue = reservations.stream()
                .filter(r -> r.getAssignedVehicle() != null &&
                            categoryVehicleIds.contains(r.getAssignedVehicle().getId()))
                .mapToDouble(r -> r.getAmount() != null ? r.getAmount() : 0.0)
                .sum();
            analysis.put("totalRevenue", round(categoryRevenue, 2));

            // Revenue per vehicle
            double revenuePerVehicle = categoryVehicles.isEmpty() ? 0 : categoryRevenue / categoryVehicles.size();
            analysis.put("revenuePerVehicle", round(revenuePerVehicle, 2));

            // Performance rating
            analysis.put("performanceRating", getCategoryPerformanceRating(categoryUtilization, revenuePerVehicle));

            categoryAnalysis.add(analysis);
        }

        // Sort by utilization rate (highest first)
        categoryAnalysis.sort((a, b) ->
            Double.compare((Double)b.get("utilizationRate"), (Double)a.get("utilizationRate")));

        return categoryAnalysis;
    }

    /**
     * 4. Revenue Analysis
     */
    private Map<String, Object> getRevenueAnalysis(LocalDate startDate, LocalDate endDate) {
        List<Reservation> reservations = reservationRepository.findByDateRange(startDate, endDate);
        List<Vehicle> allVehicles = vehicleRepository.findAll();

        Map<String, Object> revenue = new HashMap<>();

        // Total revenue
        double totalRevenue = reservations.stream()
            .filter(r -> r.getStatus() == ReservationStatus.CONFIRMED ||
                        r.getStatus() == ReservationStatus.COMPLETED)
            .mapToDouble(r -> r.getAmount() != null ? r.getAmount() : 0.0)
            .sum();
        revenue.put("totalRevenue", round(totalRevenue, 2));

        // Average revenue per reservation
        double avgRevenuePerReservation = reservations.isEmpty() ? 0 : totalRevenue / reservations.size();
        revenue.put("avgRevenuePerReservation", round(avgRevenuePerReservation, 2));

        // Revenue per vehicle
        double revenuePerVehicle = allVehicles.isEmpty() ? 0 : totalRevenue / allVehicles.size();
        revenue.put("revenuePerVehicle", round(revenuePerVehicle, 2));

        // Revenue per day
        long days = ChronoUnit.DAYS.between(startDate, endDate);
        double revenuePerDay = days > 0 ? totalRevenue / days : 0;
        revenue.put("revenuePerDay", round(revenuePerDay, 2));

        // Top performing vehicles
        revenue.put("topPerformers", getTopPerformingVehicles(reservations, 5));

        // Revenue growth
        revenue.put("revenueGrowth", calculateRevenueGrowth(startDate, endDate));

        return revenue;
    }

    /**
     * 5. Availability Forecast
     */
    private Map<String, Object> getAvailabilityForecast(LocalDate startDate, LocalDate endDate) {
        Map<String, Object> forecast = new HashMap<>();

        LocalDate today = LocalDate.now();
        LocalDate next7Days = today.plusDays(7);
        LocalDate next30Days = today.plusDays(30);

        forecast.put("today", getAvailabilityForDate(today));
        forecast.put("tomorrow", getAvailabilityForDate(today.plusDays(1)));
        forecast.put("next7Days", getAvailabilityForDateRange(today, next7Days));
        forecast.put("next30Days", getAvailabilityForDateRange(today, next30Days));

        // Critical dates (dates with < 20% availability)
        forecast.put("criticalDates", findCriticalAvailabilityDates(today, next30Days));

        return forecast;
    }

    /**
     * 6. Calculate Fleet Performance Score (0-100)
     */
    private Map<String, Object> calculateFleetPerformanceScore(LocalDate startDate, LocalDate endDate) {
        Map<String, Object> metrics = getUtilizationMetrics(startDate, endDate);

        double utilizationRate = (Double) metrics.get("utilizationRate");
        double avgRentalDuration = (Double) metrics.get("avgRentalDuration");

        // Scoring components
        double utilizationScore = Math.min(utilizationRate, 100); // Max 100
        double durationScore = Math.min((avgRentalDuration / 7.0) * 100, 100); // 7 days = perfect

        // Vehicle condition score (based on maintenance status)
        List<Vehicle> allVehicles = vehicleRepository.findAll();
        double maintenanceCount = allVehicles.stream()
            .filter(v -> v.getStatus() == Vehicle.VehicleStatus.MAINTENANCE)
            .count();
        double maintenanceScore = allVehicles.isEmpty() ? 100 :
            (1 - (maintenanceCount / allVehicles.size())) * 100;

        // Overall score (weighted average)
        double overallScore = (utilizationScore * 0.5) + (durationScore * 0.3) + (maintenanceScore * 0.2);

        Map<String, Object> scoreCard = new HashMap<>();
        scoreCard.put("overallScore", round(overallScore, 1));
        scoreCard.put("utilizationScore", round(utilizationScore, 1));
        scoreCard.put("durationScore", round(durationScore, 1));
        scoreCard.put("maintenanceScore", round(maintenanceScore, 1));
        scoreCard.put("rating", getPerformanceRating(overallScore));
        scoreCard.put("benchmarkComparison", compareToBenchmark(overallScore));

        return scoreCard;
    }

    /**
     * 7. Generate Fleet Alerts
     */
    private List<Map<String, Object>> generateFleetAlerts(LocalDate startDate, LocalDate endDate) {
        List<Map<String, Object>> alerts = new ArrayList<>();

        // Check low availability
        LocalDate next7Days = LocalDate.now().plusDays(7);
        Map<String, Object> availability = getAvailabilityForDateRange(LocalDate.now(), next7Days);
        double avgAvailability = (Double) availability.get("avgAvailabilityPercent");

        if (avgAvailability < 20) {
            alerts.add(createAlert("CRITICAL", "Low Availability",
                "Fleet availability below 20% for next 7 days. Consider adjusting pricing or vehicle acquisition."));
        } else if (avgAvailability < 40) {
            alerts.add(createAlert("WARNING", "Moderate Availability",
                "Fleet availability below 40% for next 7 days. Monitor closely."));
        }

        // Check overutilization
        Map<String, Object> metrics = getUtilizationMetrics(startDate, endDate);
        double utilization = (Double) metrics.get("utilizationRate");
        if (utilization > 90) {
            alerts.add(createAlert("INFO", "High Utilization",
                "Fleet utilization above 90%. Excellent performance! Consider fleet expansion."));
        } else if (utilization < 30) {
            alerts.add(createAlert("WARNING", "Low Utilization",
                "Fleet utilization below 30%. Consider marketing campaigns or pricing adjustments."));
        }

        // Check maintenance vehicles
        List<Vehicle> maintenanceVehicles = vehicleRepository.findByStatus(Vehicle.VehicleStatus.MAINTENANCE);
        if (maintenanceVehicles.size() > vehicleRepository.count() * 0.15) {
            alerts.add(createAlert("WARNING", "High Maintenance Count",
                String.format("%d vehicles in maintenance (>15%%). Impact on availability.", maintenanceVehicles.size())));
        }

        return alerts;
    }

    /**
     * 8. Daily Utilization Timeline
     */
    private List<Map<String, Object>> getDailyUtilizationTimeline(LocalDate startDate, LocalDate endDate) {
        List<Map<String, Object>> timeline = new ArrayList<>();

        LocalDate current = startDate;
        while (!current.isAfter(endDate)) {
            Map<String, Object> dayData = new HashMap<>();
            dayData.put("date", current.toString());

            Map<String, Object> availability = getAvailabilityForDate(current);
            dayData.put("availableVehicles", availability.get("availableVehicles"));
            dayData.put("rentedVehicles", availability.get("rentedVehicles"));
            dayData.put("utilizationPercent", availability.get("utilizationPercent"));

            timeline.add(dayData);
            current = current.plusDays(1);
        }

        return timeline;
    }

    // ===== HELPER METHODS =====

    private String getVehicleAgeCategory(Integer year) {
        if (year == null) return "Unknown";
        int age = LocalDate.now().getYear() - year;
        if (age <= 1) return "New (0-1 years)";
        if (age <= 3) return "Recent (2-3 years)";
        if (age <= 5) return "Mid-age (4-5 years)";
        return "Older (6+ years)";
    }

    private String getUtilizationRating(double rate) {
        if (rate >= 80) return "Excellent";
        if (rate >= 60) return "Good";
        if (rate >= 40) return "Fair";
        if (rate >= 20) return "Poor";
        return "Critical";
    }

    private Map<String, Object> findPeakUtilizationDay(LocalDate startDate, LocalDate endDate) {
        Map<String, Object> peak = new HashMap<>();
        LocalDate peakDate = startDate;
        double maxUtilization = 0;

        LocalDate current = startDate;
        while (!current.isAfter(endDate)) {
            Map<String, Object> dayAvailability = getAvailabilityForDate(current);
            double utilization = (Double) dayAvailability.get("utilizationPercent");

            if (utilization > maxUtilization) {
                maxUtilization = utilization;
                peakDate = current;
            }
            current = current.plusDays(1);
        }

        peak.put("date", peakDate.toString());
        peak.put("utilizationPercent", round(maxUtilization, 2));
        return peak;
    }

    private String calculateUtilizationTrend(LocalDate startDate, LocalDate endDate) {
        // Compare first half vs second half
        long totalDays = ChronoUnit.DAYS.between(startDate, endDate);
        LocalDate midPoint = startDate.plusDays(totalDays / 2);

        Map<String, Object> firstHalf = getUtilizationMetrics(startDate, midPoint);
        Map<String, Object> secondHalf = getUtilizationMetrics(midPoint, endDate);

        double firstRate = (Double) firstHalf.get("utilizationRate");
        double secondRate = (Double) secondHalf.get("utilizationRate");

        if (secondRate > firstRate + 5) return "Increasing";
        if (secondRate < firstRate - 5) return "Decreasing";
        return "Stable";
    }

    private String getCategoryPerformanceRating(double utilization, double revenuePerVehicle) {
        double score = (utilization * 0.6) + (Math.min(revenuePerVehicle / 100, 100) * 0.4);
        if (score >= 75) return "Excellent";
        if (score >= 60) return "Good";
        if (score >= 40) return "Fair";
        return "Poor";
    }

    private List<Map<String, Object>> getTopPerformingVehicles(List<Reservation> reservations, int limit) {
        Map<String, Double> vehicleRevenue = new HashMap<>();

        for (Reservation r : reservations) {
            if (r.getAssignedVehicle() != null && r.getAmount() != null) {
                String vehicleId = r.getAssignedVehicle().getId();
                vehicleRevenue.merge(vehicleId, r.getAmount(), Double::sum);
            }
        }

        return vehicleRevenue.entrySet().stream()
            .sorted((a, b) -> Double.compare(b.getValue(), a.getValue()))
            .limit(limit)
            .map(entry -> {
                Vehicle vehicle = vehicleRepository.findById(entry.getKey()).orElse(null);
                Map<String, Object> performer = new HashMap<>();
                if (vehicle != null) {
                    performer.put("vehicleId", vehicle.getId());
                    performer.put("vehicleName", vehicle.getMake() + " " + vehicle.getModel());
                    performer.put("revenue", round(entry.getValue(), 2));
                }
                return performer;
            })
            .filter(m -> !m.isEmpty())
            .collect(Collectors.toList());
    }

    private String calculateRevenueGrowth(LocalDate startDate, LocalDate endDate) {
        // This would compare to previous period - simplified for now
        return "N/A (requires historical data)";
    }

    private Map<String, Object> getAvailabilityForDate(LocalDate date) {
        List<Vehicle> allVehicles = vehicleRepository.findAll();
        List<Reservation> dayReservations = reservationRepository.findByDateRange(date, date);

        long rented = dayReservations.stream()
            .filter(r -> !r.getStartDate().isAfter(date) && !r.getEndDate().isBefore(date))
            .count();

        long available = allVehicles.size() - rented;
        double utilizationPercent = allVehicles.isEmpty() ? 0 : (rented * 100.0) / allVehicles.size();

        Map<String, Object> availability = new HashMap<>();
        availability.put("totalVehicles", allVehicles.size());
        availability.put("rentedVehicles", rented);
        availability.put("availableVehicles", available);
        availability.put("utilizationPercent", round(utilizationPercent, 2));

        return availability;
    }

    private Map<String, Object> getAvailabilityForDateRange(LocalDate startDate, LocalDate endDate) {
        long days = ChronoUnit.DAYS.between(startDate, endDate);
        double totalUtilization = 0;
        long minAvailable = Long.MAX_VALUE;

        LocalDate current = startDate;
        while (!current.isAfter(endDate)) {
            Map<String, Object> dayAvailability = getAvailabilityForDate(current);
            totalUtilization += (Double) dayAvailability.get("utilizationPercent");
            minAvailable = Math.min(minAvailable, (Long) dayAvailability.get("availableVehicles"));
            current = current.plusDays(1);
        }

        Map<String, Object> rangeAvailability = new HashMap<>();
        rangeAvailability.put("avgAvailabilityPercent", round(100 - (totalUtilization / (days + 1)), 2));
        rangeAvailability.put("minAvailableVehicles", minAvailable);

        return rangeAvailability;
    }

    private List<Map<String, Object>> findCriticalAvailabilityDates(LocalDate startDate, LocalDate endDate) {
        List<Map<String, Object>> criticalDates = new ArrayList<>();
        List<Vehicle> allVehicles = vehicleRepository.findAll();

        LocalDate current = startDate;
        while (!current.isAfter(endDate)) {
            Map<String, Object> availability = getAvailabilityForDate(current);
            long available = (Long) availability.get("availableVehicles");

            if (available < allVehicles.size() * 0.2) { // Less than 20% available
                Map<String, Object> critical = new HashMap<>();
                critical.put("date", current.toString());
                critical.put("availableVehicles", available);
                critical.put("utilizationPercent", availability.get("utilizationPercent"));
                criticalDates.add(critical);
            }
            current = current.plusDays(1);
        }

        return criticalDates;
    }

    private String getPerformanceRating(double score) {
        if (score >= 90) return "Outstanding";
        if (score >= 80) return "Excellent";
        if (score >= 70) return "Good";
        if (score >= 60) return "Fair";
        if (score >= 50) return "Below Average";
        return "Poor";
    }

    private String compareToBenchmark(double score) {
        double benchmark = 75.0; // Industry benchmark
        double difference = score - benchmark;

        if (difference > 10) return "Well above industry benchmark (+"+round(difference, 1)+"%)";
        if (difference > 0) return "Above industry benchmark (+"+round(difference, 1)+"%)";
        if (difference > -10) return "Below industry benchmark ("+round(difference, 1)+"%)";
        return "Significantly below industry benchmark ("+round(difference, 1)+"%)";
    }

    private Map<String, Object> createAlert(String severity, String title, String message) {
        Map<String, Object> alert = new HashMap<>();
        alert.put("severity", severity);
        alert.put("title", title);
        alert.put("message", message);
        alert.put("timestamp", LocalDateTime.now().toString());
        return alert;
    }

    private double round(double value, int places) {
        return BigDecimal.valueOf(value)
            .setScale(places, RoundingMode.HALF_UP)
            .doubleValue();
    }
}
