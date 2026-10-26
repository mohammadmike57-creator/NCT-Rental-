package com.carrental.backend.service;

import com.fasterxml.jackson.databind.JsonNode;

/** Published after a saved change to one booking; before is null for a new booking, after is null when deleted. */
public record ReservationChangedEvent(JsonNode before, JsonNode after) {}
