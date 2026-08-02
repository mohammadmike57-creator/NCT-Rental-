package com.carrental.backend.controller;

import com.carrental.backend.model.Reservation;
import com.carrental.backend.model.User;
import com.carrental.backend.repository.ReservationRepository;
import com.carrental.backend.repository.UserRepository;
import com.carrental.backend.security.JwtUtil;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/reservations")
@RequiredArgsConstructor
public class ReservationController {

    private final ReservationRepository reservationRepository;
    private final UserRepository userRepository;
    private final JwtUtil jwtUtil;

    private User getCurrentUser(HttpServletRequest request) {
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);
            String email = jwtUtil.extractUsername(token);
            return userRepository.findByEmail(email).orElse(null);
        }
        return null;
    }

    @GetMapping
    public ResponseEntity<List<Reservation>> getAllReservations() {
        return ResponseEntity.ok(reservationRepository.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Reservation> getReservation(@PathVariable String id) {
        return reservationRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<?> createReservation(@RequestBody Reservation reservation, HttpServletRequest request) {
        try {
            User currentUser = getCurrentUser(request);
            if (currentUser != null) {
                reservation.setCreatedBy(currentUser);
            }
            if (reservation.getPersonName() == null || reservation.getStartDate() == null || reservation.getEndDate() == null) {
                return ResponseEntity.badRequest().body("Missing required fields: personName, startDate, endDate");
            }
            Reservation saved = reservationRepository.save(reservation);
            return ResponseEntity.ok(saved);
        } catch (Exception e) {
            e.printStackTrace();
            Map<String, String> error = new HashMap<>();
            error.put("error", "Error creating reservation: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateReservation(@PathVariable String id, @RequestBody Reservation reservation, HttpServletRequest request) {
        try {
            if (!reservationRepository.existsById(id)) {
                return ResponseEntity.notFound().build();
            }
            // Ensure ID is set
            reservation.setId(id);
            
            // Set current user as last editor
            User currentUser = getCurrentUser(request);
            if (currentUser != null) {
                reservation.setLastEditedBy(currentUser);
            }

            // Preserve existing values for fields that are null in the incoming object
            Reservation existing = reservationRepository.findById(id).get();
            if (reservation.getPersonName() == null) reservation.setPersonName(existing.getPersonName());
            if (reservation.getStartDate() == null) reservation.setStartDate(existing.getStartDate());
            if (reservation.getEndDate() == null) reservation.setEndDate(existing.getEndDate());
            if (reservation.getBookingId() == null) reservation.setBookingId(existing.getBookingId());
            if (reservation.getStatus() == null) reservation.setStatus(existing.getStatus());
            if (reservation.getAmount() == null) reservation.setAmount(existing.getAmount());

            Reservation saved = reservationRepository.save(reservation);
            return ResponseEntity.ok(saved);
        } catch (Exception e) {
            e.printStackTrace();
            Map<String, String> error = new HashMap<>();
            error.put("error", "Error updating reservation: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteReservation(@PathVariable String id) {
        if (!reservationRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        reservationRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
