package com.carrental.backend.dto;

public class SignupRequest {
    private String email;
    private String password;
    private String fullName;
    private String nationalId;
    private String hireDate;
    private String position;
    private Double baseSalaryJOD;

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }

    public String getNationalId() { return nationalId; }
    public void setNationalId(String nationalId) { this.nationalId = nationalId; }

    public String getHireDate() { return hireDate; }
    public void setHireDate(String hireDate) { this.hireDate = hireDate; }

    public String getPosition() { return position; }
    public void setPosition(String position) { this.position = position; }

    public Double getBaseSalaryJOD() { return baseSalaryJOD; }
    public void setBaseSalaryJOD(Double baseSalaryJOD) { this.baseSalaryJOD = baseSalaryJOD; }
}
