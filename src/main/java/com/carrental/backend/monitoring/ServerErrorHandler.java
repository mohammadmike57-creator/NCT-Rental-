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
        if (clientWentAway(e)) {
            // The browser closed or reloaded the page, or lost its connection, while the answer was being sent.
            // Nothing failed on the server and there is nobody left to answer: not reported as an error.
            log.debug("Client went away during {} {}: {}", req.getMethod(), req.getRequestURI(), e.toString());
            return null;
        }
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

    /** The connection was closed by the other side (page closed or reloaded, phone lost signal). */
    static boolean clientWentAway(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause() == t ? null : t.getCause()) {
            String type = t.getClass().getSimpleName();
            if (type.equals("AsyncRequestNotUsableException") || type.equals("ClientAbortException")) return true;
            String msg = t.getMessage() == null ? "" : t.getMessage().toLowerCase(java.util.Locale.ROOT);
            if (t instanceof java.io.IOException && (msg.contains("broken pipe") || msg.contains("connection reset by peer")
                    || msg.contains("connection was aborted") || msg.contains("an established connection was aborted"))) return true;
        }
        return false;
    }

    private static String stackOf(Throwable e) {
        StringBuilder b = new StringBuilder(String.valueOf(e));
        StackTraceElement[] st = e.getStackTrace();
        for (int i = 0; i < Math.min(12, st.length); i++) b.append("\n  at ").append(st[i]);
        return b.toString();
    }
}
