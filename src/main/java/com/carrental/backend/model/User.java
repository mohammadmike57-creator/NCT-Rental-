package com.carrental.backend.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.List;

@Entity
@Table(name = "users")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(unique = true, nullable = false)
    private String email;

    private String fullName;
    private String username;
    private String password;

    @ElementCollection(fetch = FetchType.EAGER)
    @Enumerated(EnumType.STRING)
    private List<UserPermission> permissions;

    private String nationalId;
    private String sscNumber;
    private String hireDate;
    private String position;
    private Double baseSalaryJOD;

    @Enumerated(EnumType.STRING)
    private UserStatus status;

    private Boolean isOnline;
    private LocalDateTime lastSeen;
    private String deviceType;
    private Boolean webAppAccess;
    private LocalDateTime passwordLastChanged;

    // Getters and Setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public List<UserPermission> getPermissions() { return permissions; }
    public void setPermissions(List<UserPermission> permissions) { this.permissions = permissions; }

    public String getNationalId() { return nationalId; }
    public void setNationalId(String nationalId) { this.nationalId = nationalId; }

    public String getSscNumber() { return sscNumber; }
    public void setSscNumber(String sscNumber) { this.sscNumber = sscNumber; }

    public String getHireDate() { return hireDate; }
    public void setHireDate(String hireDate) { this.hireDate = hireDate; }

    public String getPosition() { return position; }
    public void setPosition(String position) { this.position = position; }

    public Double getBaseSalaryJOD() { return baseSalaryJOD; }
    public void setBaseSalaryJOD(Double baseSalaryJOD) { this.baseSalaryJOD = baseSalaryJOD; }

    public UserStatus getStatus() { return status; }
    public void setStatus(UserStatus status) { this.status = status; }

    public Boolean getIsOnline() { return isOnline; }
    public void setIsOnline(Boolean isOnline) { this.isOnline = isOnline; }

    public LocalDateTime getLastSeen() { return lastSeen; }
    public void setLastSeen(LocalDateTime lastSeen) { this.lastSeen = lastSeen; }

    public String getDeviceType() { return deviceType; }
    public void setDeviceType(String deviceType) { this.deviceType = deviceType; }

    public Boolean getWebAppAccess() { return webAppAccess; }
    public void setWebAppAccess(Boolean webAppAccess) { this.webAppAccess = webAppAccess; }

    public LocalDateTime getPasswordLastChanged() { return passwordLastChanged; }
    public void setPasswordLastChanged(LocalDateTime passwordLastChanged) { this.passwordLastChanged = passwordLastChanged; }
}
