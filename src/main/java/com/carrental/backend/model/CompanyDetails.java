package com.carrental.backend.model;

import jakarta.persistence.*;
import lombok.Data;

@Entity
@Table(name = "company_details")
@Data
public class CompanyDetails {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    private String name;
    private String subName;
    private String address;
    private String phone;
    private String email;
    private String taxNumber;
    private Boolean requirePaymentApproval;
}
