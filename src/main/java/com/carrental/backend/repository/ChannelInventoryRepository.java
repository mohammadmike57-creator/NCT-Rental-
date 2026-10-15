package com.carrental.backend.repository;

import com.carrental.backend.model.ChannelInventory;
import com.carrental.backend.model.DistributionChannel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface ChannelInventoryRepository extends JpaRepository<ChannelInventory, String> {

    Optional<ChannelInventory> findByChannelAndVehicleCategoryAndInventoryDate(
        DistributionChannel channel,
        String vehicleCategory,
        LocalDate inventoryDate
    );

    List<ChannelInventory> findByChannelAndInventoryDateBetween(
        DistributionChannel channel,
        LocalDate startDate,
        LocalDate endDate
    );

    @Query("SELECT i FROM ChannelInventory i WHERE i.channel = :channel AND i.inventoryDate >= :date AND i.stopSale = false")
    List<ChannelInventory> findFutureAvailableInventory(DistributionChannel channel, LocalDate date);

    @Query("SELECT i FROM ChannelInventory i WHERE i.inventoryDate = :date AND i.stopSale = false AND i.remainingAvailable > 0")
    List<ChannelInventory> findAvailableInventoryForDate(LocalDate date);
}
