package com.carrental.backend.staff;

import java.util.List;

/** Create/update payload for a staff login account. Null fields are left unchanged on update. */
public record StaffAccountRequest(
        String email,
        String fullName,
        String username,
        String password,
        List<String> permissions,
        String status,
        Boolean webAppAccess,
        String position,
        String nationalId,
        String sscNumber,
        String hireDate,
        Double baseSalaryJOD
) {}
