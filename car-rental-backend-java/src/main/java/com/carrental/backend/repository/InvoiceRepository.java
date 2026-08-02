package com.carrental.backend.repository;

import com.carrental.backend.model.InvoiceData;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InvoiceRepository extends JpaRepository<InvoiceData, String> {
}
