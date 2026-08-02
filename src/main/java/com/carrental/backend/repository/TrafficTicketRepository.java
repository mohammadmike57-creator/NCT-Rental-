package com.carrental.backend.repository;

import com.carrental.backend.model.TrafficTicket;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TrafficTicketRepository extends JpaRepository<TrafficTicket, String> {
}
