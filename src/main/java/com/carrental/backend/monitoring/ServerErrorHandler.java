package com.carrental.backend.monitoring;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.firewall.RequestRejectedException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.server.ResponseStatusException;

import java.security.Principal;
import java.util.Map;

/**
 * Last line for errors no controller handled: the person gets a short message with a reference
 * instead of technical details, and the error is logged and reported (see ErrorMonitor).
 * Expected outcomes (not found, bad request, not signed in, no permission) pass through unchanged.
 */
@RestControllerAdvice
public class ServerErrorHandler {

    private static final Logger log = LoggerFactory.getLogger(ServerErrorHandler.class);

    private final ErrorMonitor monitor;

    public ServerErrorHandler(ErrorMonitor monitor) { this.monitor = monitor; }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> unexpected(Exception e, HttpServletRequest req, Principal who) throws Exception {
        if (expected(e)) throw e; // Spring answers these with the right status (400, 401, 403, 404...)
        String where = req.getMethod() + " " + req.getRequestURI();
        String ref = monitor.report("server", e.getClass().getSimpleName() + " at " + where + ": " + e.getMessage(),
                stackOf(e), who == null ? null : who.getName());
        log.error("Unexpected error {} at {}", ref, where, e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("error", "Something went wrong on the server. Reference: " + ref, "reference", ref));
    }

    /** Outcomes Spring already turns into a proper answer; they are not server faults. */
    static boolean expected(Exception e) {
        return e instanceof AccessDeniedException || e instanceof AuthenticationException
                || e instanceof ResponseStatusException || e instanceof ErrorResponse
                || e instanceof HttpMessageNotReadableException || e instanceof TypeMismatchException
                || e instanceof MultipartException || e instanceof RequestRejectedException
                || AnnotatedElementUtils.hasAnnotation(e.getClass(), ResponseStatus.class);
    }

    private static String stackOf(Throwable e) {
        StringBuilder b = new StringBuilder(String.valueOf(e));
        StackTraceElement[] st = e.getStackTrace();
        for (int i = 0; i < Math.min(12, st.length); i++) b.append("\n  at ").append(st[i]);
        return b.toString();
    }
}
