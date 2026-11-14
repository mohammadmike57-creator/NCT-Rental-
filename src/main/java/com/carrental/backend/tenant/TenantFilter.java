package com.carrental.backend.tenant;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/** Every request starts with no supplier and ends with none, so nothing carries over between requests on a thread. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TenantFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        TenantContext.clear();
        try {
            chain.doFilter(request, response);
        } catch (TenantContext.CrossSupplierException e) {
            if (!response.isCommitted()) response.sendError(HttpServletResponse.SC_NOT_FOUND);
        } finally {
            TenantContext.clear();
        }
    }
}
