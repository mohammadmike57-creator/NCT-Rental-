package com.carrental.backend.repository;

import com.carrental.backend.model.FranchisePayment;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FranchisePaymentRepository extends JpaRepository<FranchisePayment, String> {
}
