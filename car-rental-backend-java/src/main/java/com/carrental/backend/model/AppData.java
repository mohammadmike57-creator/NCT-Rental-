package com.carrental.backend.model;

import jakarta.persistence.*;

@Entity
@Table(name = "app_data")
public class AppData {
    @Id
    private String id = "main";

    @Column(columnDefinition = "TEXT", nullable = false)
    private String data;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getData() { return data; }
    public void setData(String data) { this.data = data; }
}
