package com.carrental.backend.controller;

import com.carrental.backend.model.Reservation;
import com.carrental.backend.model.ReservationStatus;
import com.carrental.backend.model.User;
import com.carrental.backend.model.Vehicle;
import com.carrental.backend.repository.ReservationRepository;
import com.carrental.backend.repository.UserRepository;
import com.carrental.backend.repository.VehicleRepository;
import com.carrental.backend.security.JwtUtil;
import com.carrental.backend.service.RentalAgreementService;
import com.carrental.backend.service.NotificationService;
import com.carrental.backend.service.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Professional Manual Reservation Controller
 * Handles manual reservation creation, modification, and management by staff
 *
 * Features:
 * - Complete validation pipeline
 * - Automatic vehicle assignment
 * - Fleet availability checking
 * - Pricing calculation
 * - Rental agreement generation
 * - Email notifications
 * - Audit logging
 * - Conflict detection
 */
@RestController
@RequestMapping("/api/reservations")
@RequiredArgsConstructor
public class ReservationController {

    private static final Logger logger = LoggerFactory.getLogger(ReservationController.class);

    private final ReservationRepository reservationRepository;
    private final UserRepository userRepository;
    private final VehicleRepository vehicleRepository;
    private final JwtUtil jwtUtil;
    private final RentalAgreementService rentalAgreementService;
    private final NotificationService notificationService;
    private final AuditLogService auditLogService;

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

    /**
     * Create new manual reservation with professional validation and processing
     *
     * POST /api/reservations
     *
     * Request body:
     * {
     *   "personName": "John Doe",
     *   "customerEmail": "john@example.com",
     *   "contactNumber": "+1234567890",
     *   "startDate": "2025-01-15",
     *   "endDate": "2025-01-20",
     *   "reservationVehicle": "Toyota Camry",
     *   "locationName": "Amman Airport",
     *   "amount": 250.00,
     *   "notes": "VIP customer"
     * }
     */
    @PostMapping
    public ResponseEntity<?> createReservation(@RequestBody Reservation reservation, HttpServletRequest request) {
        String correlationId = UUID.randomUUID().toString();
        long startTime = System.currentTimeMillis();

        try {
            logger.info("[{}] Creating manual reservation for: {}", correlationId, reservation.getPersonName());

            // Get current user
            User currentUser = getCurrentUser(request);
            if (currentUser == null) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Authentication required"));
            }

            // ===== VALIDATION PIPELINE =====

            // 1. Validate required fields
            Map<String, String> validationErrors = validateReservationData(reservation);
            if (!validationErrors.isEmpty()) {
                logger.warn("[{}] Validation failed: {}", correlationId, validationErrors);
                return ResponseEntity.badRequest().body(Map.of(
                    "error", "Validation failed",
                    "details", validationErrors
                ));
            }

            // 2. Validate dates
            if (reservation.getStartDate().isAfter(reservation.getEndDate())) {
                return ResponseEntity.badRequest().body(Map.of(
                    "error", "Invalid dates",
                    "message", "Start date must be before end date"
                ));
            }

            if (reservation.getStartDate().isBefore(LocalDate.now())) {
                return ResponseEntity.badRequest().body(Map.of(
                    "error", "Invalid dates",
                    "message", "Start date cannot be in the past"
                ));
            }

            // 3. Calculate rental duration
            long rentalDays = ChronoUnit.DAYS.between(reservation.getStartDate(), reservation.getEndDate());
            if (rentalDays < 1) {
                return ResponseEntity.badRequest().body(Map.of(
                    "error", "Invalid rental period",
                    "message", "Minimum rental period is 1 day"
                ));
            }

            if (rentalDays > 90) {
                return ResponseEntity.badRequest().body(Map.of(
                    "error", "Invalid rental period",
                    "message", "Maximum rental period is 90 days"
                ));
            }

            // 4. Check fleet availability
            List<Vehicle> availableVehicles = findAvailableVehicles(
                reservation.getStartDate(),
                reservation.getEndDate(),
                reservation.getReservationVehicle()
            );

            if (availableVehicles.isEmpty()) {
                logger.warn("[{}] No vehicles available for {} to {}",
                    correlationId, reservation.getStartDate(), reservation.getEndDate());
                return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
                    "error", "No availability",
                    "message", "No vehicles available for the selected dates",
                    "suggestedAction", "Try different dates or vehicle category"
                ));
            }

            // 5. Auto-assign vehicle (pick first available)
            Vehicle assignedVehicle = availableVehicles.get(0);
            reservation.setAssignedVehicle(assignedVehicle);
            logger.info("[{}] Auto-assigned vehicle: {} ({})",
                correlationId, assignedVehicle.getMake() + " " + assignedVehicle.getModel(), assignedVehicle.getId());

            // ===== SETUP RESERVATION =====

            // Generate booking ID
            String bookingId = generateBookingId();
            reservation.setBookingId(bookingId);

            // Set booking date
            reservation.setBookingDate(LocalDate.now());

            // Set created by
            reservation.setCreatedBy(currentUser);

            // Set initial status
            if (reservation.getStatus() == null) {
                reservation.setStatus(ReservationStatus.CONFIRMED);
            }

            // Calculate pricing if not provided
            if (reservation.getAmount() == null || reservation.getAmount() == 0) {
                double calculatedAmount = calculateRentalPrice(assignedVehicle, (int)rentalDays);
                reservation.setAmount(calculatedAmount);
                reservation.setBaseAmount(calculatedAmount);
            }

            // Save reservation
            Reservation saved = reservationRepository.save(reservation);
            logger.info("[{}] Reservation created: {} - Amount: ${}", correlationId, bookingId, saved.getAmount());

            // ===== POST-CREATION ACTIONS =====

            // Create rental agreement (draft)
            try {
                Map<String, Object> agreementData = buildAgreementData(saved);
                rentalAgreementService.createAgreement(agreementData);
                logger.info("[{}] Rental agreement created for reservation {}", correlationId, bookingId);
            } catch (Exception e) {
                logger.error("[{}] Failed to create rental agreement: {}", correlationId, e.getMessage());
                // Continue - agreement can be created later
            }

            // Send confirmation email
            try {
                if (saved.getCustomerEmail() != null && !saved.getCustomerEmail().isEmpty()) {
                    Map<String, String> emailVars = new HashMap<>();
                    emailVars.put("customerName", saved.getPersonName());
                    emailVars.put("bookingId", bookingId);
                    emailVars.put("vehicleName", assignedVehicle.getMake() + " " + assignedVehicle.getModel());
                    emailVars.put("startDate", saved.getStartDate().toString());
                    emailVars.put("endDate", saved.getEndDate().toString());
                    emailVars.put("totalAmount", String.format("%.2f", saved.getAmount()));

                    notificationService.sendNotification(
                        saved.getCustomerEmail(),
                        "Reservation Confirmed - " + bookingId,
                        "Your reservation has been confirmed. Booking ID: {{bookingId}}",
                        emailVars
                    );
                    logger.info("[{}] Confirmation email sent to {}", correlationId, saved.getCustomerEmail());
                }
            } catch (Exception e) {
                logger.error("[{}] Failed to send confirmation email: {}", correlationId, e.getMessage());
                // Continue - email not critical
            }

            // Audit log
            auditLogService.logReservationCreated(saved.getId(), "MANUAL", "Manual reservation by " + currentUser.getEmail());

            long duration = System.currentTimeMillis() - startTime;
            logger.info("[{}] Reservation creation completed in {}ms", correlationId, duration);

            // Return enhanced response
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("reservation", saved);
            response.put("bookingId", bookingId);
            response.put("assignedVehicle", Map.of(
                "id", assignedVehicle.getId(),
                "name", assignedVehicle.getMake() + " " + assignedVehicle.getModel(),
                "licensePlate", assignedVehicle.getLicensePlate() != null ? assignedVehicle.getLicensePlate() : "N/A"
            ));
            response.put("rentalDays", rentalDays);
            response.put("totalAmount", saved.getAmount());
            response.put("correlationId", correlationId);

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            long duration = System.currentTimeMillis() - startTime;
            logger.error("[{}] Error creating reservation after {}ms", correlationId, duration, e);

            Map<String, Object> error = new HashMap<>();
            error.put("error", "Failed to create reservation");
            error.put("message", e.getMessage());
            error.put("correlationId", correlationId);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }

    /**
     * Validate reservation data
     */
    private Map<String, String> validateReservationData(Reservation reservation) {
        Map<String, String> errors = new HashMap<>();

        if (reservation.getPersonName() == null || reservation.getPersonName().trim().isEmpty()) {
            errors.put("personName", "Customer name is required");
        }

        if (reservation.getStartDate() == null) {
            errors.put("startDate", "Start date is required");
        }

        if (reservation.getEndDate() == null) {
            errors.put("endDate", "End date is required");
        }

        if (reservation.getContactNumber() == null || reservation.getContactNumber().trim().isEmpty()) {
            errors.put("contactNumber", "Contact number is required");
        }

        if (reservation.getCustomerEmail() != null && !reservation.getCustomerEmail().isEmpty()) {
            if (!reservation.getCustomerEmail().matches("^[A-Za-z0-9+_.-]+@(.+)$")) {
                errors.put("customerEmail", "Invalid email format");
            }
        }

        return errors;
    }

    /**
     * Find available vehicles for date range
     */
    private List<Vehicle> findAvailableVehicles(LocalDate startDate, LocalDate endDate, String vehicleCategory) {
        // Get all vehicles that are available
        List<Vehicle> allVehicles = vehicleRepository.findByStatus(Vehicle.VehicleStatus.AVAILABLE);

        // Filter by category if specified
        if (vehicleCategory != null && !vehicleCategory.isEmpty()) {
            allVehicles = allVehicles.stream()
                .filter(v -> vehicleCategory.equalsIgnoreCase(v.getMake()) ||
                            vehicleCategory.equalsIgnoreCase(v.getModel()) ||
                            vehicleCategory.equalsIgnoreCase(v.getCategory()))
                .collect(Collectors.toList());
        }

        // Check for conflicts with existing reservations
        List<Reservation> conflictingReservations = reservationRepository.findConflictingReservations(
            startDate, endDate
        );

        // Get list of vehicle IDs that are already reserved
        List<String> reservedVehicleIds = conflictingReservations.stream()
            .filter(r -> r.getAssignedVehicle() != null)
            .map(r -> r.getAssignedVehicle().getId())
            .collect(Collectors.toList());

        // Return vehicles that are not reserved
        return allVehicles.stream()
            .filter(v -> !reservedVehicleIds.contains(v.getId()))
            .collect(Collectors.toList());
    }

    /**
     * Calculate rental price
     */
    private double calculateRentalPrice(Vehicle vehicle, int days) {
        // Base daily rate (would come from rate plan in production)
        double dailyRate = 50.0; // Default rate

        // Category-based pricing
        if (vehicle.getCategory() != null) {
            switch (vehicle.getCategory().toUpperCase().charAt(0)) {
                case 'E': dailyRate = 40.0; break;  // Economy
                case 'C': dailyRate = 50.0; break;  // Compact
                case 'I': dailyRate = 65.0; break;  // Intermediate
                case 'S': dailyRate = 75.0; break;  // Standard
                case 'F': dailyRate = 90.0; break;  // Full-size
                case 'P': dailyRate = 120.0; break; // Premium
                case 'L': dailyRate = 200.0; break; // Luxury
            }
        }

        // Duration discounts
        double multiplier = 1.0;
        if (days >= 7 && days < 14) multiplier = 0.95;      // 5% off weekly
        else if (days >= 14 && days < 30) multiplier = 0.90; // 10% off bi-weekly
        else if (days >= 30) multiplier = 0.85;              // 15% off monthly

        return dailyRate * days * multiplier;
    }

    /**
     * Generate unique booking ID
     */
    private String generateBookingId() {
        String prefix = "RSV";
        String year = String.valueOf(LocalDate.now().getYear());
        long count = reservationRepository.count() + 1;
        return String.format("%s-%s-%05d", prefix, year, count);
    }

    /**
     * Build agreement data from reservation
     */
    private Map<String, Object> buildAgreementData(Reservation reservation) {
        Map<String, Object> data = new HashMap<>();

        data.put("reservationId", reservation.getId());
        data.put("customerFullName", reservation.getPersonName());
        data.put("customerEmail", reservation.getCustomerEmail());
        data.put("customerPhone", reservation.getContactNumber());
        data.put("pickupDate", reservation.getStartDate().atStartOfDay());
        data.put("returnDate", reservation.getEndDate().atStartOfDay());
        data.put("pickupLocation", reservation.getLocationName());
        data.put("returnLocation", reservation.getLocationName());
        data.put("dailyRate", BigDecimal.valueOf(reservation.getAmount() /
            ChronoUnit.DAYS.between(reservation.getStartDate(), reservation.getEndDate())));

        if (reservation.getAssignedVehicle() != null) {
            Vehicle vehicle = reservation.getAssignedVehicle();
            data.put("vehicleMake", vehicle.getMake());
            data.put("vehicleModel", vehicle.getModel());
            data.put("vehicleYear", vehicle.getYear());
            data.put("vehicleCategory", vehicle.getCategory());
            data.put("licensePlate", vehicle.getLicensePlate());
        }

        data.put("securityDeposit", BigDecimal.valueOf(300));
        data.put("excessAmount", BigDecimal.valueOf(1000));
        data.put("currency", "USD");

        return data;
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
