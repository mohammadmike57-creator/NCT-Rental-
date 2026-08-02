package com.carrental.backend.service;

import com.carrental.backend.dto.AuthRequest;
import com.carrental.backend.dto.AuthResponse;
import com.carrental.backend.dto.SignupRequest;
import com.carrental.backend.model.User;
import com.carrental.backend.model.UserPermission;
import com.carrental.backend.model.UserStatus;
import com.carrental.backend.repository.UserRepository;
import com.carrental.backend.security.JwtUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final AuthenticationManager authenticationManager;

    public AuthResponse signup(SignupRequest request) {
        if (userRepository.findByEmail(request.getEmail()).isPresent()) {
            throw new RuntimeException("Email already exists");
        }

        User user = new User();
        user.setEmail(request.getEmail());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setFullName(request.getFullName());
        user.setUsername(request.getEmail().split("@")[0]);
        user.setNationalId(request.getNationalId() != null ? request.getNationalId() : "");
        user.setHireDate(request.getHireDate() != null ? request.getHireDate() : "");
        user.setPosition(request.getPosition() != null ? request.getPosition() : "Agent");
        user.setBaseSalaryJOD(request.getBaseSalaryJOD() != null ? request.getBaseSalaryJOD() : 0.0);
        user.setStatus(UserStatus.ACTIVE);
        user.setWebAppAccess(true);
        user.setPermissions(Arrays.asList(
            UserPermission.VIEW_HOME_DASHBOARD,
            UserPermission.VIEW_MY_PROFILE
        ));

        user = userRepository.save(user);

        String token = jwtUtil.generateToken(user.getEmail());
        return new AuthResponse(token, user);
    }

    public AuthResponse login(AuthRequest request) {
        authenticationManager.authenticate(
            new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword())
        );

        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new RuntimeException("User not found"));

        String token = jwtUtil.generateToken(user.getEmail());
        return new AuthResponse(token, user);
    }

    public void sendPasswordReset(String email) {
        // Implement password reset logic if needed
        throw new UnsupportedOperationException("Not implemented");
    }
}
