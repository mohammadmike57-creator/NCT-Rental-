package com.carrental.backend.dto;

import lombok.Data;

@Data
public class MfaVerifyRequest {
    private String code;
}
