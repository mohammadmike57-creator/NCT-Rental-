package com.carrental.backend.platform;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Distribution platform, Phase 1: every broker call (/ota, /xml, /partner) carries a correlation ID and the
 * API version in its response headers, and both are in the server log lines written while it runs.
 * Only headers are added: response bodies are untouched, so existing broker integrations see no change.
 * Staff screens (/api, the website) are not affected.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 5)
public class CorrelationFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Correlation-ID";
    public static final String ATTR = "urd.correlationId";
    private static final Pattern SAFE = Pattern.compile("[A-Za-z0-9._:\\-]{1,100}");

    /** The broker-facing API families and the contract version each one answers with. */
    static String apiVersion(String path) {
        if (path.startsWith("/ota/2018A/")) return "ota-2018A-1.0";
        if (path.startsWith("/ota/2024A/")) return "ota-2024A-1.0";
        if (path.startsWith("/ota/")) return "ota-1.0";
        if (path.startsWith("/xml/")) return "xml-1.0";
        if (path.startsWith("/partner/")) return "partner-1.0";
        if (path.startsWith("/api/v3/") || path.equals("/oauth/token")) return "3.0.0";
        return null;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return apiVersion(request.getRequestURI()) == null;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String id = pick(request.getHeader(HEADER));
        if (id == null) id = pick(request.getHeader("X-Request-ID"));
        if (id == null) id = "cor-" + UUID.randomUUID().toString().replace("-", "").substring(0, 20);
        request.setAttribute(ATTR, id);
        response.setHeader(HEADER, id);
        response.setHeader("X-API-Version", apiVersion(request.getRequestURI()));
        MDC.put("correlationId", id);
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove("correlationId");
        }
    }

    /** A caller's ID is reused only when it is short and plain (it ends up in logs and headers). */
    private static String pick(String v) {
        return v != null && SAFE.matcher(v.trim()).matches() ? v.trim() : null;
    }
}
