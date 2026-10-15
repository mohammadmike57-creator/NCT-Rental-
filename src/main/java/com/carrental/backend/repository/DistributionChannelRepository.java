package com.carrental.backend.repository;

import com.carrental.backend.model.DistributionChannel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DistributionChannelRepository extends JpaRepository<DistributionChannel, String> {

    List<DistributionChannel> findByIsActiveTrue();

    Optional<DistributionChannel> findByChannelName(String channelName);

    List<DistributionChannel> findByChannelType(DistributionChannel.ChannelType channelType);

    @Query("SELECT d FROM DistributionChannel d WHERE d.isActive = true AND d.autoSyncInventory = true")
    List<DistributionChannel> findActiveWithAutoSync();

    @Query("SELECT d FROM DistributionChannel d ORDER BY d.totalRevenue DESC")
    List<DistributionChannel> findAllOrderByRevenue();
}
