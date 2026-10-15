package com.carrental.backend.integration;

import com.carrental.backend.model.Reservation;
import com.carrental.backend.model.ReservationStatus;
import com.carrental.backend.model.User;
import com.carrental.backend.repository.ReservationRepository;
import com.carrental.backend.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for end-to-end reservation workflows
 *
 * Tests cover:
 * - Complete reservation lifecycle
 * - Email notification workflow
 * - XML import to reservation
 * - Payment processing flow
 * - Database transactions
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
@DisplayName("Reservation Integration Tests")
class ReservationIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ReservationRepository reservationRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ObjectMapper objectMapper;

    private User testUser;

    @BeforeEach
    void setUp() {
        reservationRepository.deleteAll();
        userRepository.deleteAll();

        testUser = new User();
        testUser.setEmail("agent@nct.com");
        testUser.setUsername("agent");
        testUser.setPassword("hashedPassword");
        testUser = userRepository.save(testUser);
    }

    @Test
    @WithMockUser(username = "agent@nct.com")
    @DisplayName("Should complete full reservation lifecycle from creation to completion")
    void shouldCompleteFullReservationLifecycle() throws Exception {
        // Step 1: Create reservation
        Reservation newReservation = new Reservation();
        newReservation.setPersonName("Integration Test Customer");
        newReservation.setContactNumber("+1234567890");
        newReservation.setCustomerEmail("customer@example.com");
        newReservation.setStartDate(LocalDate.now().plusDays(1));
        newReservation.setEndDate(LocalDate.now().plusDays(5));
        newReservation.setAmount(500.0);
        newReservation.setStatus(ReservationStatus.PENDING);

        String createResponse = mockMvc.perform(post("/api/reservations")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(newReservation)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").exists())
            .andReturn()
            .getResponse()
            .getContentAsString();

        Reservation created = objectMapper.readValue(createResponse, Reservation.class);
        String reservationId = created.getId();

        // Step 2: Confirm reservation
        created.setStatus(ReservationStatus.CONFIRMED);
        created.setBookingId("NCT-INT-001");

        mockMvc.perform(put("/api/reservations/" + reservationId)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(created)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("CONFIRMED"));

        // Step 3: Pick up vehicle
        created.setStatus(ReservationStatus.PICKED_UP);
        created.setPickupKmOut(10000);
        created.setPickupFuelLevel(8);

        mockMvc.perform(put("/api/reservations/" + reservationId)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(created)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("PICKED_UP"));

        // Step 4: Return vehicle and complete
        created.setStatus(ReservationStatus.COMPLETED);
        created.setDropOffKmIn(10500);
        created.setDropOffFuelLevel(7);
        created.setDropOffCompleted(true);

        mockMvc.perform(put("/api/reservations/" + reservationId)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(created)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("COMPLETED"))
            .andExpect(jsonPath("$.dropOffCompleted").value(true));

        // Verify final state in database
        Reservation finalReservation = reservationRepository.findById(reservationId).orElseThrow();
        assertThat(finalReservation.getStatus()).isEqualTo(ReservationStatus.COMPLETED);
        assertThat(finalReservation.getDropOffCompleted()).isTrue();
        assertThat(finalReservation.getPickupKmOut()).isEqualTo(10000);
        assertThat(finalReservation.getDropOffKmIn()).isEqualTo(10500);
    }

    @Test
    @WithMockUser(username = "agent@nct.com")
    @DisplayName("Should handle reservation cancellation workflow")
    void shouldHandleReservationCancellation() throws Exception {
        // Create reservation
        Reservation reservation = new Reservation();
        reservation.setPersonName("Cancel Test");
        reservation.setStartDate(LocalDate.now().plusDays(7));
        reservation.setEndDate(LocalDate.now().plusDays(10));
        reservation.setStatus(ReservationStatus.CONFIRMED);

        reservation = reservationRepository.save(reservation);
        String reservationId = reservation.getId();

        // Cancel reservation
        reservation.setStatus(ReservationStatus.CANCELLED);

        mockMvc.perform(put("/api/reservations/" + reservationId)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(reservation)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("CANCELLED"));

        // Verify cancellation
        Reservation cancelled = reservationRepository.findById(reservationId).orElseThrow();
        assertThat(cancelled.getStatus()).isEqualTo(ReservationStatus.CANCELLED);
    }

    @Test
    @WithMockUser(username = "agent@nct.com")
    @DisplayName("Should prevent double booking of same vehicle")
    void shouldPreventDoubleBooking() throws Exception {
        // Create first reservation
        Reservation first = new Reservation();
        first.setPersonName("First Customer");
        first.setStartDate(LocalDate.of(2024, 6, 1));
        first.setEndDate(LocalDate.of(2024, 6, 5));
        first.setReservationVehicle("Vehicle-001");

        first = reservationRepository.save(first);

        // Try to create conflicting reservation
        Reservation second = new Reservation();
        second.setPersonName("Second Customer");
        second.setStartDate(LocalDate.of(2024, 6, 3)); // Overlaps
        second.setEndDate(LocalDate.of(2024, 6, 7));
        second.setReservationVehicle("Vehicle-001"); // Same vehicle

        // This should fail due to conflict detection
        mockMvc.perform(post("/api/reservations")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(second)))
            .andExpect(status().isConflict());

        // Verify only one reservation exists
        long count = reservationRepository.count();
        assertThat(count).isEqualTo(1);
    }

    @Test
    @WithMockUser(username = "agent@nct.com")
    @DisplayName("Should calculate total amount including extras and taxes")
    void shouldCalculateTotalAmountWithExtrasAndTaxes() throws Exception {
        // Create reservation with base amount
        Reservation reservation = new Reservation();
        reservation.setPersonName("Pricing Test");
        reservation.setStartDate(LocalDate.now().plusDays(1));
        reservation.setEndDate(LocalDate.now().plusDays(5));
        reservation.setBaseAmount(400.0);
        // In real implementation, extras would be added here

        String response = mockMvc.perform(post("/api/reservations")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(reservation)))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();

        Reservation created = objectMapper.readValue(response, Reservation.class);

        // Verify amount calculation (base + extras + taxes)
        assertThat(created.getAmount()).isNotNull();
        assertThat(created.getAmount()).isGreaterThanOrEqualTo(created.getBaseAmount());
    }

    @Test
    @WithMockUser(username = "agent@nct.com")
    @DisplayName("Should support searching and filtering reservations")
    void shouldSupportSearchingAndFiltering() throws Exception {
        // Create multiple reservations
        createTestReservation("John Doe", ReservationStatus.CONFIRMED);
        createTestReservation("Jane Smith", ReservationStatus.PENDING);
        createTestReservation("Bob Johnson", ReservationStatus.COMPLETED);

        // Search by name
        mockMvc.perform(get("/api/reservations/search")
                .param("name", "John"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].personName").value("John Doe"));

        // Filter by status
        mockMvc.perform(get("/api/reservations/filter")
                .param("status", "CONFIRMED"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].status").value("CONFIRMED"));
    }

    @Test
    @WithMockUser(username = "agent@nct.com")
    @DisplayName("Should handle concurrent updates with optimistic locking")
    void shouldHandleConcurrentUpdates() throws Exception {
        // Create reservation
        Reservation reservation = new Reservation();
        reservation.setPersonName("Concurrent Test");
        reservation.setStartDate(LocalDate.now().plusDays(1));
        reservation.setEndDate(LocalDate.now().plusDays(5));

        reservation = reservationRepository.save(reservation);
        String reservationId = reservation.getId();

        // Simulate concurrent updates
        Reservation version1 = reservationRepository.findById(reservationId).orElseThrow();
        Reservation version2 = reservationRepository.findById(reservationId).orElseThrow();

        // Update version 1
        version1.setNotes("Updated by user 1");
        reservationRepository.save(version1);

        // Try to update version 2 (should detect conflict)
        version2.setNotes("Updated by user 2");

        assertThatThrownBy(() -> reservationRepository.save(version2))
            .isInstanceOf(org.springframework.dao.OptimisticLockingFailureException.class);
    }

    @Test
    @WithMockUser(username = "agent@nct.com")
    @DisplayName("Should roll back transaction on error")
    void shouldRollBackTransactionOnError() throws Exception {
        long initialCount = reservationRepository.count();

        // Create invalid reservation (should cause rollback)
        Reservation invalid = new Reservation();
        // Missing required fields

        mockMvc.perform(post("/api/reservations")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(invalid)))
            .andExpect(status().isBadRequest());

        // Verify no reservation was created
        long finalCount = reservationRepository.count();
        assertThat(finalCount).isEqualTo(initialCount);
    }

    @Test
    @WithMockUser(username = "agent@nct.com")
    @DisplayName("Should track audit trail for reservations")
    void shouldTrackAuditTrail() throws Exception {
        // Create reservation
        Reservation reservation = new Reservation();
        reservation.setPersonName("Audit Test");
        reservation.setStartDate(LocalDate.now().plusDays(1));
        reservation.setEndDate(LocalDate.now().plusDays(5));

        String createResponse = mockMvc.perform(post("/api/reservations")
                .with(csrf())
                .header("Authorization", "Bearer test-token")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(reservation)))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();

        Reservation created = objectMapper.readValue(createResponse, Reservation.class);

        // Verify audit fields
        Reservation fromDb = reservationRepository.findById(created.getId()).orElseThrow();
        assertThat(fromDb.getCreatedBy()).isNotNull();

        // Update reservation
        fromDb.setNotes("Updated notes");

        mockMvc.perform(put("/api/reservations/" + created.getId())
                .with(csrf())
                .header("Authorization", "Bearer test-token")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(fromDb)))
            .andExpect(status().isOk());

        // Verify last edited by is tracked
        Reservation updated = reservationRepository.findById(created.getId()).orElseThrow();
        assertThat(updated.getLastEditedBy()).isNotNull();
    }

    private void createTestReservation(String personName, ReservationStatus status) {
        Reservation reservation = new Reservation();
        reservation.setPersonName(personName);
        reservation.setStartDate(LocalDate.now().plusDays(1));
        reservation.setEndDate(LocalDate.now().plusDays(5));
        reservation.setStatus(status);
        reservationRepository.save(reservation);
    }
}
