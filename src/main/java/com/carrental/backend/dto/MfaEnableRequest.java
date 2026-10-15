package com.carrental.backend.dto;

import lombok.Data;

@Data
public class MfaEnableRequest {
    private String secretKey;
    private String code;
    private String type; // TOTP, SMS, EMAIL
}
