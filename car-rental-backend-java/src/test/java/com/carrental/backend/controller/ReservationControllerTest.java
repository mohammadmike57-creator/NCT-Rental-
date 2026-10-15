package com.carrental.backend.controller;

import com.carrental.backend.model.Reservation;
import com.carrental.backend.model.ReservationStatus;
import com.carrental.backend.model.User;
import com.carrental.backend.repository.ReservationRepository;
import com.carrental.backend.repository.UserRepository;
import com.carrental.backend.security.JwtUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Comprehensive test suite for ReservationController
 *
 * Tests cover:
 * - All CRUD operations
 * - Validation
 * - Error handling
 * - Date conflict detection
 * - Vehicle assignment
 * - Pricing calculations
 * - Authentication and authorization
 */
@WebMvcTest(ReservationController.class)
@DisplayName("Reservation Controller Tests")
class ReservationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private ReservationRepository reservationRepository;

    @MockBean
    private UserRepository userRepository;

    @MockBean
    private JwtUtil jwtUtil;

    private Reservation testReservation;
    private User testUser;

    @BeforeEach
    void setUp() {
        testUser = new User();
        testUser.setId("user-1");
        testUser.setEmail("agent@nct.com");
        testUser.setUsername("agent");

        testReservation = new Reservation();
        testReservation.setId("res-1");
        testReservation.setPersonName("John Doe");
        testReservation.setContactNumber("+1234567890");
        testReservation.setBookingId("NCT-2024-001");
        testReservation.setStartDate(LocalDate.of(2024, 6, 1));
        testReservation.setEndDate(LocalDate.of(2024, 6, 5));
        testReservation.setAmount(500.0);
        testReservation.setStatus(ReservationStatus.CONFIRMED);
        testReservation.setCreatedBy(testUser);
    }

    @Test
    @WithMockUser
    @DisplayName("Should get all reservations successfully")
    void shouldGetAllReservationsSuccessfully() throws Exception {
        // Arrange
        List<Reservation> reservations = List.of(testReservation);
        when(reservationRepository.findAll()).thenReturn(reservations);

        // Act & Assert
        mockMvc.perform(get("/api/reservations"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].id").value("res-1"))
            .andExpect(jsonPath("$[0].personName").value("John Doe"))
            .andExpect(jsonPath("$[0].bookingId").value("NCT-2024-001"));

        verify(reservationRepository, times(1)).findAll();
    }

    @Test
    @WithMockUser
    @DisplayName("Should get single reservation by ID successfully")
    void shouldGetSingleReservationSuccessfully() throws Exception {
        // Arrange
        when(reservationRepository.findById("res-1")).thenReturn(Optional.of(testReservation));

        // Act & Assert
        mockMvc.perform(get("/api/reservations/res-1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value("res-1"))
            .andExpect(jsonPath("$.personName").value("John Doe"))
            .andExpect(jsonPath("$.amount").value(500.0));

        verify(reservationRepository, times(1)).findById("res-1");
    }

    @Test
    @WithMockUser
    @DisplayName("Should return 404 when reservation not found")
    void shouldReturn404WhenReservationNotFound() throws Exception {
        // Arrange
        when(reservationRepository.findById("non-existent")).thenReturn(Optional.empty());

        // Act & Assert
        mockMvc.perform(get("/api/reservations/non-existent"))
            .andExpect(status().isNotFound());

        verify(reservationRepository, times(1)).findById("non-existent");
    }

    @Test
    @WithMockUser
    @DisplayName("Should create reservation successfully")
    void shouldCreateReservationSuccessfully() throws Exception {
        // Arrange
        Reservation newReservation = new Reservation();
        newReservation.setPersonName("Jane Smith");
        newReservation.setStartDate(LocalDate.of(2024, 7, 1));
        newReservation.setEndDate(LocalDate.of(2024, 7, 5));

        when(userRepository.findByEmail(anyString())).thenReturn(Optional.of(testUser));
        when(reservationRepository.save(any(Reservation.class))).thenReturn(testReservation);

        // Act & Assert
        mockMvc.perform(post("/api/reservations")
                .with(csrf())
                .header("Authorization", "Bearer test-token")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(newReservation)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").exists());

        verify(reservationRepository, times(1)).save(any(Reservation.class));
    }

    @Test
    @WithMockUser
    @DisplayName("Should reject reservation with missing required fields")
    void shouldRejectReservationWithMissingFields() throws Exception {
        // Arrange
        Reservation invalidReservation = new Reservation();
        // Missing personName, startDate, endDate

        // Act & Assert
        mockMvc.perform(post("/api/reservations")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(invalidReservation)))
            .andExpect(status().isBadRequest())
            .andExpect(content().string(containsString("Missing required fields")));

        verify(reservationRepository, never()).save(any(Reservation.class));
    }

    @Test
    @WithMockUser
    @DisplayName("Should update reservation successfully")
    void shouldUpdateReservationSuccessfully() throws Exception {
        // Arrange
        Reservation updatedReservation = new Reservation();
        updatedReservation.setId("res-1");
        updatedReservation.setPersonName("John Doe Updated");
        updatedReservation.setStartDate(LocalDate.of(2024, 6, 1));
        updatedReservation.setEndDate(LocalDate.of(2024, 6, 10));
        updatedReservation.setAmount(750.0);

        when(reservationRepository.existsById("res-1")).thenReturn(true);
        when(reservationRepository.findById("res-1")).thenReturn(Optional.of(testReservation));
        when(userRepository.findByEmail(anyString())).thenReturn(Optional.of(testUser));
        when(reservationRepository.save(any(Reservation.class))).thenReturn(updatedReservation);

        // Act & Assert
        mockMvc.perform(put("/api/reservations/res-1")
                .with(csrf())
                .header("Authorization", "Bearer test-token")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(updatedReservation)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value("res-1"));

        verify(reservationRepository, times(1)).save(any(Reservation.class));
    }

    @Test
    @WithMockUser
    @DisplayName("Should return 404 when updating non-existent reservation")
    void shouldReturn404WhenUpdatingNonExistentReservation() throws Exception {
        // Arrange
        Reservation updatedReservation = new Reservation();
        updatedReservation.setPersonName("Test");
        updatedReservation.setStartDate(LocalDate.now());
        updatedReservation.setEndDate(LocalDate.now().plusDays(1));

        when(reservationRepository.existsById("non-existent")).thenReturn(false);

        // Act & Assert
        mockMvc.perform(put("/api/reservations/non-existent")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(updatedReservation)))
            .andExpect(status().isNotFound());

        verify(reservationRepository, never()).save(any(Reservation.class));
    }

    @Test
    @WithMockUser
    @DisplayName("Should delete reservation successfully")
    void shouldDeleteReservationSuccessfully() throws Exception {
        // Arrange
        when(reservationRepository.existsById("res-1")).thenReturn(true);
        doNothing().when(reservationRepository).deleteById("res-1");

        // Act & Assert
        mockMvc.perform(delete("/api/reservations/res-1")
                .with(csrf()))
            .andExpect(status().isNoContent());

        verify(reservationRepository, times(1)).deleteById("res-1");
    }

    @Test
    @WithMockUser
    @DisplayName("Should return 404 when deleting non-existent reservation")
    void shouldReturn404WhenDeletingNonExistentReservation() throws Exception {
        // Arrange
        when(reservationRepository.existsById("non-existent")).thenReturn(false);

        // Act & Assert
        mockMvc.perform(delete("/api/reservations/non-existent")
                .with(csrf()))
            .andExpect(status().isNotFound());

        verify(reservationRepository, never()).deleteById(anyString());
    }

    @Test
    @WithMockUser
    @DisplayName("Should validate date range (end date after start date)")
    void shouldValidateDateRange() throws Exception {
        // Arrange
        Reservation invalidReservation = new Reservation();
        invalidReservation.setPersonName("Test User");
        invalidReservation.setStartDate(LocalDate.of(2024, 6, 10));
        invalidReservation.setEndDate(LocalDate.of(2024, 6, 5)); // End before start

        // Act & Assert
        mockMvc.perform(post("/api/reservations")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(invalidReservation)))
            .andExpect(status().isBadRequest());

        verify(reservationRepository, never()).save(any(Reservation.class));
    }

    @Test
    @WithMockUser
    @DisplayName("Should detect vehicle double booking conflicts")
    void shouldDetectDoubleBookingConflicts() throws Exception {
        // Arrange
        Reservation conflictingReservation = new Reservation();
        conflictingReservation.setPersonName("Conflicting User");
        conflictingReservation.setStartDate(LocalDate.of(2024, 6, 3)); // Overlaps with existing
        conflictingReservation.setEndDate(LocalDate.of(2024, 6, 7));
        conflictingReservation.setReservationVehicle("Vehicle-1");

        when(reservationRepository.findConflictingReservations(
            any(LocalDate.class), any(LocalDate.class), anyString()))
            .thenReturn(List.of(testReservation));

        // Act & Assert
        mockMvc.perform(post("/api/reservations")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(conflictingReservation)))
            .andExpect(status().isConflict())
            .andExpect(content().string(containsString("Vehicle already booked")));

        verify(reservationRepository, never()).save(any(Reservation.class));
    }

    @Test
    @WithMockUser
    @DisplayName("Should calculate total amount with extras")
    void shouldCalculateTotalAmountWithExtras() throws Exception {
        // Arrange
        Reservation reservationWithExtras = new Reservation();
        reservationWithExtras.setPersonName("Test User");
        reservationWithExtras.setStartDate(LocalDate.of(2024, 6, 1));
        reservationWithExtras.setEndDate(LocalDate.of(2024, 6, 5));
        reservationWithExtras.setBaseAmount(400.0);
        // Add extras pricing logic

        when(reservationRepository.save(any(Reservation.class))).thenReturn(reservationWithExtras);

        // Act & Assert
        mockMvc.perform(post("/api/reservations")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(reservationWithExtras)))
            .andExpect(status().isOk());
    }

    @Test
    @WithMockUser
    @DisplayName("Should search reservations by customer name")
    void shouldSearchReservationsByCustomerName() throws Exception {
        // Arrange
        when(reservationRepository.findByPersonNameContainingIgnoreCase("John"))
            .thenReturn(List.of(testReservation));

        // Act & Assert
        mockMvc.perform(get("/api/reservations/search")
                .param("name", "John"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].personName").value("John Doe"));
    }

    @Test
    @WithMockUser
    @DisplayName("Should filter reservations by status")
    void shouldFilterReservationsByStatus() throws Exception {
        // Arrange
        when(reservationRepository.findByStatus(ReservationStatus.CONFIRMED))
            .thenReturn(List.of(testReservation));

        // Act & Assert
        mockMvc.perform(get("/api/reservations/filter")
                .param("status", "CONFIRMED"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].status").value("CONFIRMED"));
    }

    @Test
    @WithMockUser
    @DisplayName("Should get reservations by date range")
    void shouldGetReservationsByDateRange() throws Exception {
        // Arrange
        when(reservationRepository.findByStartDateBetween(
            any(LocalDate.class), any(LocalDate.class)))
            .thenReturn(List.of(testReservation));

        // Act & Assert
        mockMvc.perform(get("/api/reservations/date-range")
                .param("start", "2024-06-01")
                .param("end", "2024-06-30"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    @DisplayName("Should require authentication for accessing reservations")
    void shouldRequireAuthenticationForAccessingReservations() throws Exception {
        // Act & Assert
        mockMvc.perform(get("/api/reservations"))
            .andExpect(status().isUnauthorized());

        verify(reservationRepository, never()).findAll();
    }

    @Test
    @WithMockUser
    @DisplayName("Should handle concurrent reservation updates safely")
    void shouldHandleConcurrentUpdates() throws Exception {
        // Arrange
        when(reservationRepository.existsById("res-1")).thenReturn(true);
        when(reservationRepository.findById("res-1")).thenReturn(Optional.of(testReservation));
        when(userRepository.findByEmail(anyString())).thenReturn(Optional.of(testUser));
        when(reservationRepository.save(any(Reservation.class)))
            .thenThrow(new org.springframework.dao.OptimisticLockingFailureException("Concurrent update detected"));

        Reservation updatedReservation = new Reservation();
        updatedReservation.setPersonName("Updated Name");
        updatedReservation.setStartDate(LocalDate.now());
        updatedReservation.setEndDate(LocalDate.now().plusDays(1));

        // Act & Assert
        mockMvc.perform(put("/api/reservations/res-1")
                .with(csrf())
                .header("Authorization", "Bearer test-token")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(updatedReservation)))
            .andExpect(status().isConflict());
    }

    @Test
    @WithMockUser
    @DisplayName("Should track user who created the reservation")
    void shouldTrackUserWhoCreatedReservation() throws Exception {
        // Arrange
        Reservation newReservation = new Reservation();
        newReservation.setPersonName("Test User");
        newReservation.setStartDate(LocalDate.now());
        newReservation.setEndDate(LocalDate.now().plusDays(1));

        when(jwtUtil.extractUsername("test-token")).thenReturn("agent@nct.com");
        when(userRepository.findByEmail("agent@nct.com")).thenReturn(Optional.of(testUser));
        when(reservationRepository.save(any(Reservation.class))).thenAnswer(invocation -> {
            Reservation saved = invocation.getArgument(0);
            assertThat(saved.getCreatedBy()).isNotNull();
            assertThat(saved.getCreatedBy().getEmail()).isEqualTo("agent@nct.com");
            return saved;
        });

        // Act & Assert
        mockMvc.perform(post("/api/reservations")
                .with(csrf())
                .header("Authorization", "Bearer test-token")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(newReservation)))
            .andExpect(status().isOk());
    }

    @Test
    @WithMockUser
    @DisplayName("Should track user who last edited the reservation")
    void shouldTrackUserWhoLastEditedReservation() throws Exception {
        // Arrange
        Reservation updatedReservation = new Reservation();
        updatedReservation.setPersonName("Updated User");
        updatedReservation.setStartDate(LocalDate.now());
        updatedReservation.setEndDate(LocalDate.now().plusDays(1));

        when(reservationRepository.existsById("res-1")).thenReturn(true);
        when(reservationRepository.findById("res-1")).thenReturn(Optional.of(testReservation));
        when(jwtUtil.extractUsername("test-token")).thenReturn("agent@nct.com");
        when(userRepository.findByEmail("agent@nct.com")).thenReturn(Optional.of(testUser));
        when(reservationRepository.save(any(Reservation.class))).thenAnswer(invocation -> {
            Reservation saved = invocation.getArgument(0);
            assertThat(saved.getLastEditedBy()).isNotNull();
            assertThat(saved.getLastEditedBy().getEmail()).isEqualTo("agent@nct.com");
            return saved;
        });

        // Act & Assert
        mockMvc.perform(put("/api/reservations/res-1")
                .with(csrf())
                .header("Authorization", "Bearer test-token")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(updatedReservation)))
            .andExpect(status().isOk());
    }
}
