package com.carrental.backend.ota;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

public interface ConnectorSendRepository extends JpaRepository<ConnectorSend, Long> {
    List<ConnectorSend> findByStatusAndNextAttemptAtBeforeOrderByIdAsc(ConnectorSend.Status status, Instant now, Pageable page);
    List<ConnectorSend> findByConnectorIdOrderByIdDesc(Long connectorId, Pageable page);
    boolean existsByConnectorIdAndReservationNumberAndStatusAndIdLessThan(Long connectorId, String reservationNumber, ConnectorSend.Status status, Long id);

    @Modifying @Transactional
    @Query("delete from ConnectorSend s where s.status <> :pending and s.createdAt < :before")
    int purge(@Param("pending") ConnectorSend.Status pending, @Param("before") Instant before);
}
