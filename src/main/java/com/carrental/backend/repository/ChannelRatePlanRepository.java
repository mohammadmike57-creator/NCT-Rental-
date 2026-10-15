package com.carrental.backend.repository;

import com.carrental.backend.model.ChannelRatePlan;
import com.carrental.backend.model.DistributionChannel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface ChannelRatePlanRepository extends JpaRepository<ChannelRatePlan, String> {

    List<ChannelRatePlan> findByChannel(DistributionChannel channel);

    List<ChannelRatePlan> findByChannelAndIsActiveTrue(DistributionChannel channel);

    @Query("SELECT r FROM ChannelRatePlan r WHERE r.channel = :channel AND r.vehicleCategory = :category " +
           "AND r.isActive = true AND r.isPublished = true AND :date BETWEEN r.startDate AND r.endDate " +
           "ORDER BY r.priority DESC")
    List<ChannelRatePlan> findActiveRatePlansForDate(
        DistributionChannel channel,
        String category,
        LocalDate date
    );

    @Query("SELECT r FROM ChannelRatePlan r WHERE r.channel = :channel AND :date BETWEEN r.startDate AND r.endDate")
    List<ChannelRatePlan> findRatePlansForDateRange(DistributionChannel channel, LocalDate date);
}
