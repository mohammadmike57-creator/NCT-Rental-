package com.carrental.backend.ota;

import org.springframework.http.HttpStatus;

/**
 * The error catalogue every channel adapter (OTA XML, native XML, REST/JSON) returns.
 * Codes are stable: partners program against them. Each maps to an HTTP status, an OTA
 * error type (1 Unknown, 3 Biz rule, 4 Authentication, 6 Authorisation, 10 Required field
 * missing, 12 Processing exception) and an OTA error code from the OTA ERR list.
 */
public enum ChannelError {
    AUTH_FAILED(HttpStatus.UNAUTHORIZED, "4", "497", "Invalid or missing credentials", "Stop and contact the supplier"),
    PERMISSION_DENIED(HttpStatus.FORBIDDEN, "6", "448", "No access to this location, vehicle group or operation", "Check the channel configuration"),
    INVALID_REQUEST(HttpStatus.BAD_REQUEST, "10", "321", "A required field is missing or invalid", "Correct the request"),
    INVALID_LOCATION(HttpStatus.BAD_REQUEST, "3", "61", "Unknown or inactive location code", "Correct the location code"),
    INVALID_DATE(HttpStatus.BAD_REQUEST, "3", "15", "Invalid date, time or rental duration", "Correct the search"),
    INVALID_VEHICLE_GROUP(HttpStatus.BAD_REQUEST, "3", "424", "Unknown or unavailable vehicle group", "Correct the vehicle group"),
    NO_AVAILABILITY(HttpStatus.CONFLICT, "3", "322", "No vehicles available for these dates", "Show no results"),
    OFFER_EXPIRED(HttpStatus.CONFLICT, "3", "450", "The offer has expired", "Search again"),
    PRICE_CHANGED(HttpStatus.CONFLICT, "3", "451", "The price differs from the quoted offer", "Show the new price"),
    DUPLICATE_REFERENCE(HttpStatus.CONFLICT, "3", "95", "This broker reference already exists", "Retrieve the original booking"),
    RESERVATION_NOT_FOUND(HttpStatus.NOT_FOUND, "3", "245", "Reservation not found", "Check the reservation number"),
    MODIFICATION_NOT_ALLOWED(HttpStatus.CONFLICT, "3", "452", "This reservation can no longer be modified", "Contact the supplier"),
    CANCELLATION_NOT_ALLOWED(HttpStatus.CONFLICT, "3", "453", "This reservation can no longer be cancelled", "Contact the supplier"),
    PAYMENT_DECLINED(HttpStatus.PAYMENT_REQUIRED, "3", "454", "Payment or guarantee was declined", "Retry the payment"),
    POLICY_VIOLATION(HttpStatus.UNPROCESSABLE_ENTITY, "3", "455", "The booking breaks a rental rule", "Show the reason to the customer"),
    RATE_LIMIT_EXCEEDED(HttpStatus.TOO_MANY_REQUESTS, "12", "456", "Too many requests", "Retry with back-off"),
    SYSTEM_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "1", "448", "Internal error", "Retry safely with the same idempotency key");

    public final HttpStatus http;
    public final String otaType;
    public final String otaCode;
    public final String meaning;
    public final String brokerAction;

    ChannelError(HttpStatus http, String otaType, String otaCode, String meaning, String brokerAction) {
        this.http = http;
        this.otaType = otaType;
        this.otaCode = otaCode;
        this.meaning = meaning;
        this.brokerAction = brokerAction;
    }

    /** A business error raised by the channel core; every adapter turns it into its own error format. */
    public static class ChannelException extends RuntimeException {
        public final ChannelError error;
        public ChannelException(ChannelError error, String message) {
            super(message == null || message.isBlank() ? error.meaning : message);
            this.error = error;
        }
        public ChannelException(ChannelError error) { this(error, null); }
    }

    public ChannelException ex(String message) { return new ChannelException(this, message); }
}
