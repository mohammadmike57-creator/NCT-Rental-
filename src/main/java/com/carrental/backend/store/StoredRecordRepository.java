package com.carrental.backend.store;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StoredRecordRepository extends JpaRepository<StoredRecord, StoredRecord.Key> {
    List<StoredRecord> findBySectionOrderByPositionAsc(String section);
    List<StoredRecord> findBySection(String section);
}
