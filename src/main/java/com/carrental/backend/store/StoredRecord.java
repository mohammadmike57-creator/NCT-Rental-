package com.carrental.backend.store;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

/** One item of a list section (a car, an invoice, a traffic ticket, a damage report, an expense...). */
@Entity
@Table(name = "store_records", indexes = @Index(name = "idx_store_records_section", columnList = "section,position"))
@IdClass(StoredRecord.Key.class)
public class StoredRecord {
    @Id
    @Column(length = 40)
    private String section;
    @Id
    @Column(length = 160)
    private String itemId;
    private int position;
    @Column(columnDefinition = "TEXT", nullable = false)
    private String data;
    private Instant updatedAt;

    public static class Key implements Serializable {
        private String section;
        private String itemId;
        public Key() {}
        public Key(String section, String itemId) { this.section = section; this.itemId = itemId; }
        @Override public boolean equals(Object o) { return o instanceof Key k && Objects.equals(section, k.section) && Objects.equals(itemId, k.itemId); }
        @Override public int hashCode() { return Objects.hash(section, itemId); }
    }

    public String getSection() { return section; }
    public void setSection(String section) { this.section = section; }
    public String getItemId() { return itemId; }
    public void setItemId(String itemId) { this.itemId = itemId; }
    public int getPosition() { return position; }
    public void setPosition(int position) { this.position = position; }
    public String getData() { return data; }
    public void setData(String data) { this.data = data; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
