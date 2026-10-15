package com.carrental.backend.service;

import com.carrental.backend.model.*;
import com.carrental.backend.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

@Service
public class ChannelDistributionService {

    private static final Logger logger = LoggerFactory.getLogger(ChannelDistributionService.class);

    @Autowired
    private DistributionChannelRepository channelRepository;

    @Autowired
    private ChannelRatePlanRepository ratePlanRepository;

    @Autowired
    private ChannelInventoryRepository inventoryRepository;

    /**
     * Create or update distribution channel
     */
    @Transactional
    public DistributionChannel saveChannel(DistributionChannel channel) {
        logger.info("Saving distribution channel: {}", channel.getChannelName());
        return channelRepository.save(channel);
    }

    /**
     * Get all active channels
     */
    public List<DistributionChannel> getActiveChannels() {
        return channelRepository.findByIsActiveTrue();
    }

    /**
     * Get channel by ID
     */
    public Optional<DistributionChannel> getChannelById(String id) {
        return channelRepository.findById(id);
    }

    /**
     * Get channels by type
     */
    public List<DistributionChannel> getChannelsByType(DistributionChannel.ChannelType type) {
        return channelRepository.findByChannelType(type);
    }

    /**
     * Create rate plan for channel
     */
    @Transactional
    public ChannelRatePlan createRatePlan(ChannelRatePlan ratePlan) {
        logger.info("Creating rate plan {} for channel {}",
            ratePlan.getRatePlanName(),
            ratePlan.getChannel().getChannelName());
        return ratePlanRepository.save(ratePlan);
    }

    /**
     * Get rate plans for channel
     */
    public List<ChannelRatePlan> getRatePlansForChannel(String channelId) {
        return channelRepository.findById(channelId)
            .map(ratePlanRepository::findByChannel)
            .orElse(Collections.emptyList());
    }

    /**
     * Get best rate for channel and vehicle category
     */
    public Optional<ChannelRatePlan> getBestRate(
            String channelId,
            String vehicleCategory,
            LocalDate pickupDate,
            LocalDate returnDate
    ) {
        return channelRepository.findById(channelId)
            .flatMap(channel -> {
                List<ChannelRatePlan> plans = ratePlanRepository.findActiveRatePlansForDate(
                    channel,
                    vehicleCategory,
                    pickupDate
                );

                if (plans.isEmpty()) {
                    return Optional.empty();
                }

                // Return highest priority plan
                return Optional.of(plans.get(0));
            });
    }

    /**
     * Calculate total cost for rental
     */
    public Map<String, Object> calculateRentalCost(
            String channelId,
            String vehicleCategory,
            LocalDate pickupDate,
            LocalDate returnDate,
            Map<String, Object> options
    ) {
        Map<String, Object> result = new HashMap<>();

        int days = (int) java.time.temporal.ChronoUnit.DAYS.between(pickupDate, returnDate);

        Optional<ChannelRatePlan> ratePlanOpt = getBestRate(channelId, vehicleCategory, pickupDate, returnDate);

        if (ratePlanOpt.isEmpty()) {
            result.put("error", "No rate plan available");
            return result;
        }

        ChannelRatePlan ratePlan = ratePlanOpt.get();

        // Base rental cost
        BigDecimal dailyRate = ratePlan.getDailyRateForDuration(days);
        BigDecimal baseRentalCost = dailyRate.multiply(BigDecimal.valueOf(days));

        result.put("dailyRate", dailyRate);
        result.put("baseRentalCost", baseRentalCost);
        result.put("rentalDays", days);

        // Additional fees
        BigDecimal totalFees = BigDecimal.ZERO;

        if ((Boolean) options.getOrDefault("airportPickup", false)) {
            totalFees = totalFees.add(ratePlan.getAirportFee() != null ? ratePlan.getAirportFee() : BigDecimal.ZERO);
            result.put("airportFee", ratePlan.getAirportFee());
        }

        if ((Boolean) options.getOrDefault("youngDriver", false)) {
            BigDecimal youngDriverFee = ratePlan.getYoungDriverFee() != null ?
                ratePlan.getYoungDriverFee().multiply(BigDecimal.valueOf(days)) : BigDecimal.ZERO;
            totalFees = totalFees.add(youngDriverFee);
            result.put("youngDriverFee", youngDriverFee);
        }

        if ((Integer) options.getOrDefault("additionalDrivers", 0) > 0) {
            BigDecimal additionalDriverFee = ratePlan.getAdditionalDriverFee() != null ?
                ratePlan.getAdditionalDriverFee().multiply(BigDecimal.valueOf(days))
                    .multiply(BigDecimal.valueOf((Integer) options.get("additionalDrivers"))) : BigDecimal.ZERO;
            totalFees = totalFees.add(additionalDriverFee);
            result.put("additionalDriverFee", additionalDriverFee);
        }

        if ((Boolean) options.getOrDefault("oneWay", false)) {
            totalFees = totalFees.add(ratePlan.getOneWayFee() != null ? ratePlan.getOneWayFee() : BigDecimal.ZERO);
            result.put("oneWayFee", ratePlan.getOneWayFee());
        }

        // Subtotal
        BigDecimal subtotal = baseRentalCost.add(totalFees);
        result.put("subtotal", subtotal);
        result.put("totalFees", totalFees);

        // Tax (assume 10%)
        BigDecimal tax = subtotal.multiply(BigDecimal.valueOf(0.10));
        result.put("tax", tax);
        result.put("taxPercentage", 10.0);

        // Total
        BigDecimal total = subtotal.add(tax);
        result.put("total", total);

        // Security deposit
        result.put("securityDeposit", ratePlan.getSecurityDeposit());
        result.put("excessAmount", ratePlan.getExcessAmount());

        // Mileage
        result.put("includedMileage", ratePlan.getIncludedMileagePerDay());
        result.put("extraMileageCharge", ratePlan.getExtraMileageCharge());

        result.put("currency", ratePlan.getCurrency());
        result.put("ratePlanName", ratePlan.getRatePlanName());

        return result;
    }

    /**
     * Check availability for channel
     */
    public boolean checkAvailability(
            String channelId,
            String vehicleCategory,
            LocalDate pickupDate,
            LocalDate returnDate
    ) {
        Optional<DistributionChannel> channelOpt = channelRepository.findById(channelId);
        if (channelOpt.isEmpty()) {
            return false;
        }

        DistributionChannel channel = channelOpt.get();

        // Check inventory for all days in range
        LocalDate current = pickupDate;
        while (!current.isAfter(returnDate)) {
            Optional<ChannelInventory> inventoryOpt = inventoryRepository
                .findByChannelAndVehicleCategoryAndInventoryDate(channel, vehicleCategory, current);

            if (inventoryOpt.isEmpty() || !inventoryOpt.get().hasAvailability()) {
                return false;
            }

            current = current.plusDays(1);
        }

        return true;
    }

    /**
     * Update inventory for channel
     */
    @Transactional
    public void updateInventory(
            String channelId,
            String vehicleCategory,
            LocalDate date,
            Integer available
    ) {
        DistributionChannel channel = channelRepository.findById(channelId)
            .orElseThrow(() -> new RuntimeException("Channel not found"));

        ChannelInventory inventory = inventoryRepository
            .findByChannelAndVehicleCategoryAndInventoryDate(channel, vehicleCategory, date)
            .orElse(new ChannelInventory());

        inventory.setChannel(channel);
        inventory.setVehicleCategory(vehicleCategory);
        inventory.setInventoryDate(date);
        inventory.setTotalAvailable(available);
        inventory.setSyncedAt(LocalDateTime.now());

        inventoryRepository.save(inventory);
        logger.info("Updated inventory for {} on {} - {} units available",
            vehicleCategory, date, available);
    }

    /**
     * Sync inventory for all channels (scheduled task)
     */
    @Scheduled(fixedRate = 900000) // Every 15 minutes
    @Transactional
    public void syncAllChannelInventory() {
        logger.info("Starting inventory sync for all channels");

        List<DistributionChannel> channels = channelRepository.findActiveWithAutoSync();

        for (DistributionChannel channel : channels) {
            try {
                syncChannelInventory(channel);
                channel.setSyncStatus(DistributionChannel.SyncStatus.SUCCESS);
                channel.setLastSyncAt(LocalDateTime.now());
            } catch (Exception e) {
                logger.error("Failed to sync inventory for channel: {}", channel.getChannelName(), e);
                channel.setSyncStatus(DistributionChannel.SyncStatus.FAILED);
            }
            channelRepository.save(channel);
        }

        logger.info("Completed inventory sync for {} channels", channels.size());
    }

    /**
     * Sync inventory for specific channel
     */
    private void syncChannelInventory(DistributionChannel channel) {
        // This would integrate with external channel APIs
        // For now, we'll just log it
        logger.info("Syncing inventory for channel: {}", channel.getChannelName());

        // TODO: Implement actual API integration based on channel type
        switch (channel.getChannelType()) {
            case METASEARCH:
                syncMetasearchChannel(channel);
                break;
            case AGGREGATOR:
                syncAggregatorChannel(channel);
                break;
            case OTA:
                syncOTAChannel(channel);
                break;
            default:
                logger.info("No sync implementation for channel type: {}", channel.getChannelType());
        }
    }

    private void syncMetasearchChannel(DistributionChannel channel) {
        // Skyscanner, Kayak integration
        logger.info("Syncing metasearch channel: {}", channel.getChannelName());
    }

    private void syncAggregatorChannel(DistributionChannel channel) {
        // DiscoverCars, Rentalcars.com integration
        logger.info("Syncing aggregator channel: {}", channel.getChannelName());
    }

    private void syncOTAChannel(DistributionChannel channel) {
        // Booking.com, Expedia integration
        logger.info("Syncing OTA channel: {}", channel.getChannelName());
    }

    /**
     * Get channel performance statistics
     */
    public Map<String, Object> getChannelStatistics(String channelId) {
        Optional<DistributionChannel> channelOpt = channelRepository.findById(channelId);
        if (channelOpt.isEmpty()) {
            return Collections.emptyMap();
        }

        DistributionChannel channel = channelOpt.get();
        Map<String, Object> stats = new HashMap<>();

        stats.put("channelName", channel.getChannelName());
        stats.put("channelType", channel.getChannelType());
        stats.put("totalBookings", channel.getTotalBookings());
        stats.put("totalRevenue", channel.getTotalRevenue());
        stats.put("averageBookingValue", channel.getAverageBookingValue());
        stats.put("commissionType", channel.getCommissionType());
        stats.put("commissionValue", channel.getCommissionValue());
        stats.put("isActive", channel.isActive());
        stats.put("lastSyncAt", channel.getLastSyncAt());
        stats.put("syncStatus", channel.getSyncStatus());

        return stats;
    }
}
