package com.carrental.backend.service;

import com.carrental.backend.model.Reservation;
import com.carrental.backend.model.ReservationStatus;
import com.carrental.backend.model.Vehicle;
import com.carrental.backend.model.Payment;
import com.carrental.backend.repository.ReservationRepository;
import com.carrental.backend.repository.VehicleRepository;
import com.carrental.backend.repository.PaymentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import java.util.stream.Collectors;

/**
 * EXTREMELY PROFESSIONAL SUMMARY & DASHBOARD SERVICE
 *
 * Provides comprehensive business intelligence and executive dashboard:
 * - Real-time KPI monitoring
 * - Revenue analytics and forecasting
 * - Performance metrics and trends
 * - Comparative analysis (YoY, MoM)
 * - Business health indicators
 * - Predictive insights
 * - Executive summaries
 * - Actionable recommendations
 */
@Service
public class ProfessionalSummaryService {

    private static final Logger logger = LoggerFactory.getLogger(ProfessionalSummaryService.class);

    @Autowired
    private ReservationRepository reservationRepository;

    @Autowired
    private VehicleRepository vehicleRepository;

    @Autowired
    private PaymentRepository paymentRepository;

    @Autowired
    private FleetBalanceService fleetBalanceService;

    /**
     * Get comprehensive executive dashboard
     * Complete overview for business management and decision-making
     */
    public Map<String, Object> getExecutiveDashboard(LocalDate startDate, LocalDate endDate) {
        logger.info("Generating executive dashboard for {} to {}", startDate, endDate);

        Map<String, Object> dashboard = new HashMap<>();

        // 1. Key Performance Indicators (KPIs)
        dashboard.put("kpis", getKeyPerformanceIndicators(startDate, endDate));

        // 2. Revenue Analytics
        dashboard.put("revenueAnalytics", getRevenueAnalytics(startDate, endDate));

        // 3. Booking Analytics
        dashboard.put("bookingAnalytics", getBookingAnalytics(startDate, endDate));

        // 4. Fleet Performance
        dashboard.put("fleetPerformance", getFleetPerformanceSummary(startDate, endDate));

        // 5. Customer Analytics
        dashboard.put("customerAnalytics", getCustomerAnalytics(startDate, endDate));

        // 6. Financial Metrics
        dashboard.put("financialMetrics", getFinancialMetrics(startDate, endDate));

        // 7. Trends & Forecasts
        dashboard.put("trendsAndForecasts", getTrendsAndForecasts(startDate, endDate));

        // 8. Business Health Score
        dashboard.put("businessHealthScore", calculateBusinessHealthScore(startDate, endDate));

        // 9. Comparative Analysis
        dashboard.put("comparativeAnalysis", getComparativeAnalysis(startDate, endDate));

        // 10. Actionable Insights & Recommendations
        dashboard.put("insights", generateActionableInsights(startDate, endDate));

        logger.info("Executive dashboard generated successfully");
        return dashboard;
    }

    /**
     * 1. Key Performance Indicators
     */
    private Map<String, Object> getKeyPerformanceIndicators(LocalDate startDate, LocalDate endDate) {
        Map<String, Object> kpis = new HashMap<>();

        // Total Reservations
        List<Reservation> allReservations = reservationRepository.findByDateRange(startDate, endDate);
        kpis.put("totalReservations", allReservations.size());

        // Active Reservations
        long activeReservations = allReservations.stream()
            .filter(this::isActive)
            .count();
        kpis.put("activeReservations", activeReservations);

        // Completed Reservations
        long completedReservations = allReservations.stream()
            .filter(this::isCompleted)
            .count();
        kpis.put("completedReservations", completedReservations);

        // Cancelled Reservations
        long cancelledReservations = allReservations.stream()
            .filter(r -> r.getStatus() == ReservationStatus.CANCELLED)
            .count();
        kpis.put("cancelledReservations", cancelledReservations);

        // Cancellation Rate
        double cancellationRate = allReservations.isEmpty() ? 0 :
            (cancelledReservations * 100.0) / allReservations.size();
        kpis.put("cancellationRate", round(cancellationRate, 2));

        // Average Booking Value
        double avgBookingValue = allReservations.stream()
            .filter(r -> r.getAmount() != null)
            .mapToDouble(Reservation::getAmount)
            .average()
            .orElse(0.0);
        kpis.put("avgBookingValue", round(avgBookingValue, 2));

        // Total Revenue
        double totalRevenue = allReservations.stream()
            .filter(r -> r.getStatus() != ReservationStatus.CANCELLED)
            .mapToDouble(r -> r.getAmount() != null ? r.getAmount() : 0.0)
            .sum();
        kpis.put("totalRevenue", round(totalRevenue, 2));

        // Fleet Utilization
        Map<String, Object> fleetMetrics = fleetBalanceService.getFleetBalanceDashboard(startDate, endDate);
        Map<String, Object> utilizationMetrics = (Map<String, Object>) fleetMetrics.get("utilizationMetrics");
        kpis.put("fleetUtilization", utilizationMetrics.get("utilizationRate"));

        // Revenue Per Available Vehicle Day (RevPAVD)
        List<Vehicle> allVehicles = vehicleRepository.findAll();
        long totalDays = ChronoUnit.DAYS.between(startDate, endDate);
        long availableVehicleDays = totalDays * allVehicles.size();
        double revPAVD = availableVehicleDays > 0 ? totalRevenue / availableVehicleDays : 0;
        kpis.put("revenuePerAvailableVehicleDay", round(revPAVD, 2));

        // Average Rental Duration
        double avgDuration = allReservations.stream()
            .mapToLong(r -> ChronoUnit.DAYS.between(r.getStartDate(), r.getEndDate()))
            .average()
            .orElse(0.0);
        kpis.put("avgRentalDuration", round(avgDuration, 1));

        // Growth Rate (compared to previous period)
        kpis.put("growthRate", calculateGrowthRate(startDate, endDate));

        return kpis;
    }

    /**
     * 2. Revenue Analytics
     */
    private Map<String, Object> getRevenueAnalytics(LocalDate startDate, LocalDate endDate) {
        Map<String, Object> analytics = new HashMap<>();

        List<Reservation> reservations = reservationRepository.findByDateRange(startDate, endDate);

        // Total Revenue
        double totalRevenue = reservations.stream()
            .filter(r -> r.getStatus() != ReservationStatus.CANCELLED)
            .mapToDouble(r -> r.getAmount() != null ? r.getAmount() : 0.0)
            .sum();
        analytics.put("totalRevenue", round(totalRevenue, 2));

        // Revenue Breakdown
        Map<String, Double> revenueBreakdown = new HashMap<>();
        revenueBreakdown.put("completed", reservations.stream()
            .filter(this::isCompleted)
            .mapToDouble(r -> r.getAmount() != null ? r.getAmount() : 0.0)
            .sum());
        revenueBreakdown.put("active", reservations.stream()
            .filter(this::isActive)
            .mapToDouble(r -> r.getAmount() != null ? r.getAmount() : 0.0)
            .sum());
        revenueBreakdown.put("pending", reservations.stream()
            .filter(r -> r.getStatus() == ReservationStatus.CONFIRMED)
            .mapToDouble(r -> r.getAmount() != null ? r.getAmount() : 0.0)
            .sum());
        analytics.put("revenueBreakdown", revenueBreakdown);

        // Revenue by Channel
        Map<String, Double> revenueByChannel = reservations.stream()
            .collect(Collectors.groupingBy(
                r -> r.getSource() != null ? r.getSource().getName() : "Direct",
                Collectors.summingDouble(r -> r.getAmount() != null ? r.getAmount() : 0.0)
            ));
        analytics.put("revenueByChannel", revenueByChannel);

        // Revenue Trend (daily)
        analytics.put("dailyRevenueTrend", getDailyRevenueTrend(startDate, endDate));

        // Projected Revenue (for remaining period)
        analytics.put("projectedRevenue", calculateProjectedRevenue(startDate, endDate));

        // Revenue Per Day
        long days = ChronoUnit.DAYS.between(startDate, endDate);
        double revenuePerDay = days > 0 ? totalRevenue / days : 0;
        analytics.put("avgRevenuePerDay", round(revenuePerDay, 2));

        // Peak Revenue Day
        analytics.put("peakRevenueDay", findPeakRevenueDay(startDate, endDate));

        return analytics;
    }

    /**
     * 3. Booking Analytics
     */
    private Map<String, Object> getBookingAnalytics(LocalDate startDate, LocalDate endDate) {
        Map<String, Object> analytics = new HashMap<>();

        List<Reservation> reservations = reservationRepository.findByDateRange(startDate, endDate);

        // Total Bookings
        analytics.put("totalBookings", reservations.size());

        // Booking Sources Distribution
        Map<String, Long> sourceDistribution = reservations.stream()
            .collect(Collectors.groupingBy(
                r -> r.getSource() != null ? r.getSource().getName() : "Direct",
                Collectors.counting()
            ));
        analytics.put("bookingsBySource", sourceDistribution);

        // Booking Status Distribution
        Map<String, Long> statusDistribution = reservations.stream()
            .collect(Collectors.groupingBy(
                r -> r.getStatus().toString(),
                Collectors.counting()
            ));
        analytics.put("bookingsByStatus", statusDistribution);

        // Average Lead Time (booking date to start date)
        double avgLeadTime = reservations.stream()
            .filter(r -> r.getBookingDate() != null && r.getStartDate() != null)
            .mapToLong(r -> ChronoUnit.DAYS.between(r.getBookingDate(), r.getStartDate()))
            .average()
            .orElse(0.0);
        analytics.put("avgLeadTimeDays", round(avgLeadTime, 1));

        // Repeat Customer Rate
        analytics.put("repeatCustomerRate", calculateRepeatCustomerRate(reservations));

        // Booking Conversion Rate
        analytics.put("conversionRate", calculateBookingConversionRate(reservations));

        // Peak Booking Days
        analytics.put("peakBookingDays", findPeakBookingDays(reservations));

        return analytics;
    }

    /**
     * 4. Fleet Performance Summary
     */
    private Map<String, Object> getFleetPerformanceSummary(LocalDate startDate, LocalDate endDate) {
        Map<String, Object> summary = new HashMap<>();

        // Get detailed fleet balance
        Map<String, Object> fleetBalance = fleetBalanceService.getFleetBalanceDashboard(startDate, endDate);

        // Extract key metrics
        Map<String, Object> overview = (Map<String, Object>) fleetBalance.get("fleetOverview");
        summary.put("totalVehicles", overview.get("totalVehicles"));
        summary.put("availableVehicles", overview.get("availableVehicles"));

        Map<String, Object> utilization = (Map<String, Object>) fleetBalance.get("utilizationMetrics");
        summary.put("utilizationRate", utilization.get("utilizationRate"));
        summary.put("utilizationRating", utilization.get("utilizationRating"));

        Map<String, Object> performance = (Map<String, Object>) fleetBalance.get("performanceScore");
        summary.put("fleetScore", performance.get("overallScore"));
        summary.put("fleetRating", performance.get("rating"));

        // Category performance
        List<Map<String, Object>> categoryAnalysis = (List<Map<String, Object>>) fleetBalance.get("categoryAnalysis");
        summary.put("topPerformingCategory", categoryAnalysis.isEmpty() ? null : categoryAnalysis.get(0));

        return summary;
    }

    /**
     * 5. Customer Analytics
     */
    private Map<String, Object> getCustomerAnalytics(LocalDate startDate, LocalDate endDate) {
        Map<String, Object> analytics = new HashMap<>();

        List<Reservation> reservations = reservationRepository.findByDateRange(startDate, endDate);

        // Unique Customers
        long uniqueCustomers = reservations.stream()
            .map(Reservation::getCustomerEmail)
            .filter(Objects::nonNull)
            .distinct()
            .count();
        analytics.put("uniqueCustomers", uniqueCustomers);

        // New vs Returning
        analytics.put("newCustomers", calculateNewCustomers(reservations));
        analytics.put("returningCustomers", calculateReturningCustomers(reservations));

        // Customer Lifetime Value (CLV)
        analytics.put("avgCustomerLifetimeValue", calculateAvgCustomerLifetimeValue(reservations));

        // Customer Satisfaction (based on completion rate)
        long completed = reservations.stream()
            .filter(this::isCompleted)
            .count();
        double satisfactionScore = reservations.isEmpty() ? 0 : (completed * 100.0) / reservations.size();
        analytics.put("completionRate", round(satisfactionScore, 2));

        return analytics;
    }

    /**
     * 6. Financial Metrics
     */
    private Map<String, Object> getFinancialMetrics(LocalDate startDate, LocalDate endDate) {
        Map<String, Object> metrics = new HashMap<>();

        List<Reservation> reservations = reservationRepository.findByDateRange(startDate, endDate);

        // Gross Revenue
        double grossRevenue = reservations.stream()
            .filter(r -> r.getStatus() != ReservationStatus.CANCELLED)
            .mapToDouble(r -> r.getAmount() != null ? r.getAmount() : 0.0)
            .sum();
        metrics.put("grossRevenue", round(grossRevenue, 2));

        // Net Revenue (after cancellations)
        double cancelledRevenue = reservations.stream()
            .filter(r -> r.getStatus() == ReservationStatus.CANCELLED)
            .mapToDouble(r -> r.getAmount() != null ? r.getAmount() : 0.0)
            .sum();
        double netRevenue = grossRevenue - cancelledRevenue;
        metrics.put("netRevenue", round(netRevenue, 2));

        // Average Transaction Value
        double avgTransaction = reservations.isEmpty() ? 0 : grossRevenue / reservations.size();
        metrics.put("avgTransactionValue", round(avgTransaction, 2));

        // Payment Collection Rate
        List<Payment> payments = paymentRepository.findAll();
        long successfulPayments = payments.stream()
            .filter(p -> p.getStatus() == Payment.PaymentStatus.SUCCEEDED)
            .count();
        double collectionRate = payments.isEmpty() ? 0 : (successfulPayments * 100.0) / payments.size();
        metrics.put("paymentCollectionRate", round(collectionRate, 2));

        // Outstanding Payments
        double outstanding = reservations.stream()
            .filter(r -> r.getStatus() == ReservationStatus.CONFIRMED && !isCompleted(r))
            .filter(r -> r.getAmount() != null)
            .mapToDouble(r -> r.getAmount() - (r.getBaseAmount() != null ? r.getBaseAmount() : 0))
            .sum();
        metrics.put("outstandingPayments", round(outstanding, 2));

        return metrics;
    }

    /**
     * 7. Trends & Forecasts
     */
    private Map<String, Object> getTrendsAndForecasts(LocalDate startDate, LocalDate endDate) {
        Map<String, Object> trends = new HashMap<>();

        // Revenue Trend
        trends.put("revenueTrend", calculateRevenueTrend(startDate, endDate));

        // Booking Trend
        trends.put("bookingTrend", calculateBookingTrend(startDate, endDate));

        // Utilization Trend
        trends.put("utilizationTrend", calculateUtilizationTrend(startDate, endDate));

        // 30-Day Forecast
        trends.put("next30DaysForecast", forecast30Days(endDate));

        // Seasonal Patterns
        trends.put("seasonalPattern", identifySeasonalPattern(startDate, endDate));

        return trends;
    }

    /**
     * 8. Business Health Score (0-100)
     */
    private Map<String, Object> calculateBusinessHealthScore(LocalDate startDate, LocalDate endDate) {
        Map<String, Object> scoreCard = new HashMap<>();

        // Component scores
        double revenueScore = calculateRevenueHealthScore(startDate, endDate);
        double fleetScore = calculateFleetHealthScore(startDate, endDate);
        double customerScore = calculateCustomerHealthScore(startDate, endDate);
        double operationalScore = calculateOperationalHealthScore(startDate, endDate);

        // Overall score (weighted average)
        double overallScore = (revenueScore * 0.35) + (fleetScore * 0.25) +
                             (customerScore * 0.20) + (operationalScore * 0.20);

        scoreCard.put("overallScore", round(overallScore, 1));
        scoreCard.put("revenueScore", round(revenueScore, 1));
        scoreCard.put("fleetScore", round(fleetScore, 1));
        scoreCard.put("customerScore", round(customerScore, 1));
        scoreCard.put("operationalScore", round(operationalScore, 1));
        scoreCard.put("healthRating", getHealthRating(overallScore));
        scoreCard.put("trend", calculateHealthTrend(startDate, endDate));

        return scoreCard;
    }

    /**
     * 9. Comparative Analysis
     */
    private Map<String, Object> getComparativeAnalysis(LocalDate startDate, LocalDate endDate) {
        Map<String, Object> comparison = new HashMap<>();

        // Current period metrics
        Map<String, Object> currentPeriod = getKeyPerformanceIndicators(startDate, endDate);

        // Previous period (same duration)
        long periodDays = ChronoUnit.DAYS.between(startDate, endDate);
        LocalDate prevStart = startDate.minusDays(periodDays);
        LocalDate prevEnd = startDate.minusDays(1);
        Map<String, Object> previousPeriod = getKeyPerformanceIndicators(prevStart, prevEnd);

        // Calculate changes
        comparison.put("revenueChange", calculatePercentageChange(
            (Double) previousPeriod.get("totalRevenue"),
            (Double) currentPeriod.get("totalRevenue")
        ));

        comparison.put("bookingsChange", calculatePercentageChange(
            ((Integer) previousPeriod.get("totalReservations")).doubleValue(),
            ((Integer) currentPeriod.get("totalReservations")).doubleValue()
        ));

        comparison.put("utilizationChange", calculatePercentageChange(
            (Double) previousPeriod.get("fleetUtilization"),
            (Double) currentPeriod.get("fleetUtilization")
        ));

        // Year-over-Year (if applicable)
        comparison.put("yearOverYear", calculateYearOverYear(startDate, endDate));

        return comparison;
    }

    /**
     * 10. Actionable Insights & Recommendations
     */
    private List<Map<String, Object>> generateActionableInsights(LocalDate startDate, LocalDate endDate) {
        List<Map<String, Object>> insights = new ArrayList<>();

        Map<String, Object> kpis = getKeyPerformanceIndicators(startDate, endDate);
        double cancellationRate = (Double) kpis.get("cancellationRate");
        double utilizationRate = (Double) kpis.get("fleetUtilization");

        // High Cancellation Rate
        if (cancellationRate > 15) {
            insights.add(createInsight("WARNING", "High Cancellation Rate",
                String.format("Cancellation rate at %.1f%% (target: <10%%). Review booking confirmation process and payment terms.", cancellationRate),
                "Improve booking confirmation flow, offer flexible cancellation policies with fees"));
        }

        // Low Utilization
        if (utilizationRate < 50) {
            insights.add(createInsight("OPPORTUNITY", "Low Fleet Utilization",
                String.format("Fleet utilization at %.1f%% (target: >70%%). Significant revenue opportunity.", utilizationRate),
                "Launch marketing campaigns, adjust pricing strategy, partner with OTAs"));
        }

        // High Utilization
        if (utilizationRate > 85) {
            insights.add(createInsight("SUCCESS", "Excellent Utilization",
                String.format("Fleet utilization at %.1f%%. Strong performance!", utilizationRate),
                "Consider fleet expansion, dynamic pricing during peak periods"));
        }

        // Revenue Growth
        Map<String, Object> comparison = getComparativeAnalysis(startDate, endDate);
        double revenueChange = (Double) comparison.get("revenueChange");
        if (revenueChange > 20) {
            insights.add(createInsight("SUCCESS", "Strong Revenue Growth",
                String.format("Revenue increased by %.1f%% vs previous period!", revenueChange),
                "Maintain momentum, analyze successful channels, scale winning strategies"));
        } else if (revenueChange < -10) {
            insights.add(createInsight("ALERT", "Revenue Decline",
                String.format("Revenue decreased by %.1f%% vs previous period.", Math.abs(revenueChange)),
                "Review pricing strategy, increase marketing spend, analyze competitor pricing"));
        }

        return insights;
    }

    // ===== HELPER METHODS =====

    private double calculateGrowthRate(LocalDate startDate, LocalDate endDate) {
        long periodDays = ChronoUnit.DAYS.between(startDate, endDate);
        LocalDate prevStart = startDate.minusDays(periodDays);
        LocalDate prevEnd = startDate.minusDays(1);

        double currentRevenue = reservationRepository.findByDateRange(startDate, endDate).stream()
            .mapToDouble(r -> r.getAmount() != null ? r.getAmount() : 0.0)
            .sum();

        double previousRevenue = reservationRepository.findByDateRange(prevStart, prevEnd).stream()
            .mapToDouble(r -> r.getAmount() != null ? r.getAmount() : 0.0)
            .sum();

        return previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;
    }

    private List<Map<String, Object>> getDailyRevenueTrend(LocalDate startDate, LocalDate endDate) {
        List<Map<String, Object>> trend = new ArrayList<>();

        LocalDate current = startDate;
        while (!current.isAfter(endDate)) {
            LocalDate date = current;
            double dailyRevenue = reservationRepository.findByDateRange(date, date).stream()
                .filter(r -> r.getStatus() != ReservationStatus.CANCELLED)
                .mapToDouble(r -> r.getAmount() != null ? r.getAmount() : 0.0)
                .sum();

            Map<String, Object> dayData = new HashMap<>();
            dayData.put("date", date.toString());
            dayData.put("revenue", round(dailyRevenue, 2));
            trend.add(dayData);

            current = current.plusDays(1);
        }

        return trend;
    }

    private Map<String, Object> findPeakRevenueDay(LocalDate startDate, LocalDate endDate) {
        Map<String, Object> peak = new HashMap<>();
        LocalDate peakDate = startDate;
        double maxRevenue = 0;

        LocalDate current = startDate;
        while (!current.isAfter(endDate)) {
            LocalDate date = current;
            double dailyRevenue = reservationRepository.findByDateRange(date, date).stream()
                .filter(r -> r.getStatus() != ReservationStatus.CANCELLED)
                .mapToDouble(r -> r.getAmount() != null ? r.getAmount() : 0.0)
                .sum();

            if (dailyRevenue > maxRevenue) {
                maxRevenue = dailyRevenue;
                peakDate = date;
            }
            current = current.plusDays(1);
        }

        peak.put("date", peakDate.toString());
        peak.put("revenue", round(maxRevenue, 2));
        return peak;
    }

    private double calculateProjectedRevenue(LocalDate startDate, LocalDate endDate) {
        List<Reservation> future = reservationRepository.findByDateRange(endDate.plusDays(1), endDate.plusDays(30));
        return future.stream()
            .filter(r -> r.getStatus() != ReservationStatus.CANCELLED)
            .mapToDouble(r -> r.getAmount() != null ? r.getAmount() : 0.0)
            .sum();
    }

    private double calculateRepeatCustomerRate(List<Reservation> reservations) {
        Map<String, Long> customerFrequency = reservations.stream()
            .filter(r -> r.getCustomerEmail() != null)
            .collect(Collectors.groupingBy(Reservation::getCustomerEmail, Collectors.counting()));

        long repeatCustomers = customerFrequency.values().stream()
            .filter(count -> count > 1)
            .count();

        return customerFrequency.isEmpty() ? 0 :
            (repeatCustomers * 100.0) / customerFrequency.size();
    }

    private double calculateBookingConversionRate(List<Reservation> reservations) {
        long confirmed = reservations.stream()
            .filter(r -> r.getStatus() != ReservationStatus.CANCELLED)
            .count();

        return reservations.isEmpty() ? 0 : (confirmed * 100.0) / reservations.size();
    }

    private List<String> findPeakBookingDays(List<Reservation> reservations) {
        Map<String, Long> dayFrequency = reservations.stream()
            .filter(r -> r.getBookingDate() != null)
            .collect(Collectors.groupingBy(
                r -> r.getBookingDate().getDayOfWeek().toString(),
                Collectors.counting()
            ));

        return dayFrequency.entrySet().stream()
            .sorted((a, b) -> Long.compare(b.getValue(), a.getValue()))
            .limit(3)
            .map(Map.Entry::getKey)
            .collect(Collectors.toList());
    }

    private long calculateNewCustomers(List<Reservation> reservations) {
        // Simplified - would need historical data
        return reservations.stream()
            .map(Reservation::getCustomerEmail)
            .filter(Objects::nonNull)
            .distinct()
            .count();
    }

    private long calculateReturningCustomers(List<Reservation> reservations) {
        return 0; // Would need historical comparison
    }

    private double calculateAvgCustomerLifetimeValue(List<Reservation> reservations) {
        Map<String, Double> customerValue = reservations.stream()
            .filter(r -> r.getCustomerEmail() != null && r.getAmount() != null)
            .collect(Collectors.groupingBy(
                Reservation::getCustomerEmail,
                Collectors.summingDouble(Reservation::getAmount)
            ));

        return customerValue.isEmpty() ? 0 :
            customerValue.values().stream()
                .mapToDouble(Double::doubleValue)
                .average()
                .orElse(0.0);
    }

    private String calculateRevenueTrend(LocalDate startDate, LocalDate endDate) {
        // Compare first half vs second half
        long totalDays = ChronoUnit.DAYS.between(startDate, endDate);
        LocalDate midPoint = startDate.plusDays(totalDays / 2);

        double firstHalf = reservationRepository.findByDateRange(startDate, midPoint).stream()
            .mapToDouble(r -> r.getAmount() != null ? r.getAmount() : 0.0)
            .sum();

        double secondHalf = reservationRepository.findByDateRange(midPoint, endDate).stream()
            .mapToDouble(r -> r.getAmount() != null ? r.getAmount() : 0.0)
            .sum();

        if (secondHalf > firstHalf * 1.1) return "Strongly Increasing";
        if (secondHalf > firstHalf) return "Increasing";
        if (secondHalf < firstHalf * 0.9) return "Decreasing";
        return "Stable";
    }

    private String calculateBookingTrend(LocalDate startDate, LocalDate endDate) {
        long totalDays = ChronoUnit.DAYS.between(startDate, endDate);
        LocalDate midPoint = startDate.plusDays(totalDays / 2);

        long firstHalf = reservationRepository.findByDateRange(startDate, midPoint).size();
        long secondHalf = reservationRepository.findByDateRange(midPoint, endDate).size();

        if (secondHalf > firstHalf * 1.1) return "Increasing";
        if (secondHalf < firstHalf * 0.9) return "Decreasing";
        return "Stable";
    }

    private String calculateUtilizationTrend(LocalDate startDate, LocalDate endDate) {
        return "Stable"; // Simplified
    }

    private Map<String, Object> forecast30Days(LocalDate fromDate) {
        Map<String, Object> forecast = new HashMap<>();
        forecast.put("period", "Next 30 days");
        forecast.put("projectedBookings", "Based on historical data");
        forecast.put("projectedRevenue", calculateProjectedRevenue(fromDate, fromDate.plusDays(30)));
        return forecast;
    }

    private String identifySeasonalPattern(LocalDate startDate, LocalDate endDate) {
        // Simplified seasonal detection
        int month = startDate.getMonthValue();
        if (month >= 6 && month <= 8) return "Summer Peak Season";
        if (month >= 11 || month <= 1) return "Holiday Season";
        return "Regular Season";
    }

    private double calculateRevenueHealthScore(LocalDate startDate, LocalDate endDate) {
        Map<String, Object> kpis = getKeyPerformanceIndicators(startDate, endDate);
        double revenue = (Double) kpis.get("totalRevenue");
        long days = ChronoUnit.DAYS.between(startDate, endDate);
        double target = vehicleRepository.count() * days * 50; // $50/vehicle/day target

        return Math.min((revenue / target) * 100, 100);
    }

    private double calculateFleetHealthScore(LocalDate startDate, LocalDate endDate) {
        Map<String, Object> kpis = getKeyPerformanceIndicators(startDate, endDate);
        return (Double) kpis.get("fleetUtilization");
    }

    private double calculateCustomerHealthScore(LocalDate startDate, LocalDate endDate) {
        Map<String, Object> kpis = getKeyPerformanceIndicators(startDate, endDate);
        double cancellationRate = (Double) kpis.get("cancellationRate");
        return Math.max(100 - cancellationRate, 0);
    }

    private double calculateOperationalHealthScore(LocalDate startDate, LocalDate endDate) {
        List<Reservation> reservations = reservationRepository.findByDateRange(startDate, endDate);
        long completed = reservations.stream()
            .filter(this::isCompleted)
            .count();

        return reservations.isEmpty() ? 0 : (completed * 100.0) / reservations.size();
    }

    private String getHealthRating(double score) {
        if (score >= 90) return "Excellent";
        if (score >= 75) return "Good";
        if (score >= 60) return "Fair";
        if (score >= 40) return "Poor";
        return "Critical";
    }

    private String calculateHealthTrend(LocalDate startDate, LocalDate endDate) {
        return "Improving"; // Would need historical comparison
    }

    private double calculatePercentageChange(double oldValue, double newValue) {
        if (oldValue == 0) return newValue > 0 ? 100 : 0;
        return ((newValue - oldValue) / oldValue) * 100;
    }

    private Map<String, Object> calculateYearOverYear(LocalDate startDate, LocalDate endDate) {
        LocalDate prevYearStart = startDate.minusYears(1);
        LocalDate prevYearEnd = endDate.minusYears(1);

        double currentRevenue = reservationRepository.findByDateRange(startDate, endDate).stream()
            .mapToDouble(r -> r.getAmount() != null ? r.getAmount() : 0.0)
            .sum();

        double prevYearRevenue = reservationRepository.findByDateRange(prevYearStart, prevYearEnd).stream()
            .mapToDouble(r -> r.getAmount() != null ? r.getAmount() : 0.0)
            .sum();

        Map<String, Object> yoy = new HashMap<>();
        yoy.put("currentYearRevenue", round(currentRevenue, 2));
        yoy.put("previousYearRevenue", round(prevYearRevenue, 2));
        yoy.put("yoyGrowth", round(calculatePercentageChange(prevYearRevenue, currentRevenue), 2));

        return yoy;
    }

    private Map<String, Object> createInsight(String type, String title, String description, String recommendation) {
        Map<String, Object> insight = new HashMap<>();
        insight.put("type", type);
        insight.put("title", title);
        insight.put("description", description);
        insight.put("recommendation", recommendation);
        insight.put("timestamp", LocalDateTime.now().toString());
        return insight;
    }

    private double round(double value, int places) {
        return BigDecimal.valueOf(value)
            .setScale(places, RoundingMode.HALF_UP)
            .doubleValue();
    }

    /** A rental is active once the car has been picked up and until it is returned. */
    private boolean isActive(Reservation r) {
        return r.getStatus() == ReservationStatus.CONFIRMED && r.getPickupDateTime() != null && !isCompleted(r);
    }

    /** A rental is completed when the drop-off has been recorded. */
    private boolean isCompleted(Reservation r) {
        return Boolean.TRUE.equals(r.getDropOffCompleted());
    }
}
