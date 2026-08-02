package com.carrental.backend.controller;

import com.carrental.backend.model.CompanyDetails;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/company")
public class CompanyDetailsController {

    @GetMapping
    public ResponseEntity<CompanyDetails> getCompanyDetails() {
        CompanyDetails dummy = new CompanyDetails();
        dummy.setName("NCT Car Rental");
        dummy.setSubName("Rental Solutions");
        dummy.setAddress("Amman, Jordan");
        dummy.setPhone("+962 7 9999 9999");
        dummy.setEmail("info@nctrental.com");
        dummy.setTaxNumber("123456789");
        dummy.setRequirePaymentApproval(false);
        return ResponseEntity.ok(dummy);
    }
}
