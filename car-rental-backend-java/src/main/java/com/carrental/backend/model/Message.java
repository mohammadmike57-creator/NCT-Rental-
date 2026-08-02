package com.carrental.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Entity
@Table(name = "messages")
@Data
public class Message {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @ManyToOne
    private User sender;
    private String senderName;

    @ManyToOne
    private User recipient;

    private String subject;
    @Lob
    private String body;

    private LocalDateTime timestamp;
    private Boolean isRead;
}
