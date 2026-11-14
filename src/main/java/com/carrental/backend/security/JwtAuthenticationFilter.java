package com.carrental.backend.security;

import com.carrental.backend.service.CustomUserDetailsService;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.MalformedJwtException;
import io.jsonwebtoken.security.SignatureException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private CustomUserDetailsService userDetailsService;

    @Autowired
    private com.carrental.backend.staff.PresenceService presence;

    @Autowired
    private com.carrental.backend.tenant.PlatformSettings platform;

    @Autowired
    private com.carrental.backend.tenant.SupplierService suppliers;

    /** Set on a request made with a platform support sign-in (value: the supplier being viewed). */
    public static final String SUPPORT_ATTR = "platform.support";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        // Handle preflight OPTIONS request
        if (request.getMethod().equalsIgnoreCase("OPTIONS")) {
            filterChain.doFilter(request, response);
            return;
        }

        final String requestUri = request.getRequestURI();

        // Public endpoints – skip authentication
        if (requestUri.startsWith("/auth/") ||
            requestUri.startsWith("/stripe/") ||
            requestUri.startsWith("/ota/") ||
            requestUri.startsWith("/xml/") ||
            requestUri.startsWith("/partner/") ||
            requestUri.startsWith("/api/v3/") ||
            requestUri.equals("/oauth/token") ||
            requestUri.startsWith("/api/voucher") ||
            requestUri.equals("/") ||
            requestUri.equals("/health")) {
            filterChain.doFilter(request, response);
            return;
        }

        final String authHeader = request.getHeader("Authorization");

        String email = null;
        String jwt = null;

        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            jwt = authHeader.substring(7);
            try {
                email = jwtUtil.extractEmail(jwt);
            } catch (ExpiredJwtException e) {
                logger.warn("JWT token expired");
            } catch (MalformedJwtException | SignatureException e) {
                logger.warn("Invalid JWT token");
            }
        }

        if (email != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            try {
                UserDetails userDetails = this.userDetailsService.loadUserByUsername(email);
                if (userDetails.isEnabled() && jwtUtil.validateToken(jwt, userDetails)) {
                    UsernamePasswordAuthenticationToken authToken =
                            new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());
                    authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    String support = jwtUtil.supportSupplier(jwt);
                    if (support != null) {
                        // Platform support: a super admin of UR-Drive Jordan reads one supplier's data, nothing else.
                        boolean ownUrd = userDetails.getAuthorities().stream()
                            .anyMatch(a -> (CustomUserDetailsService.SUPPLIER_AUTHORITY + com.carrental.backend.tenant.TenantContext.DEFAULT).equals(a.getAuthority()));
                        if (!ownUrd || !platform.isSuperAdmin(email) || !suppliers.isActive(support)) {
                            filterChain.doFilter(request, response);   // not signed in
                            return;
                        }
                        if (!request.getMethod().equalsIgnoreCase("GET") && !requestUri.equals("/api/account/signed-out")) {
                            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                            response.setContentType("application/json");
                            response.getWriter().write("{\"error\":\"Support access is read-only. Nothing can be changed.\"}");
                            return;
                        }
                        java.util.List<org.springframework.security.core.GrantedAuthority> capped = new java.util.ArrayList<>();
                        java.util.Set<String> allowed = suppliers.planOf(support).permissions().stream().map(Enum::name).collect(java.util.stream.Collectors.toSet());
                        userDetails.getAuthorities().stream().filter(a -> allowed.contains(a.getAuthority())).forEach(capped::add);
                        UsernamePasswordAuthenticationToken supportAuth = new UsernamePasswordAuthenticationToken(userDetails, null, capped);
                        supportAuth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                        SecurityContextHolder.getContext().setAuthentication(supportAuth);
                        com.carrental.backend.tenant.TenantContext.bind(support);
                        request.setAttribute(SUPPORT_ATTR, support);
                        filterChain.doFilter(request, response);
                        return;
                    }
                    SecurityContextHolder.getContext().setAuthentication(authToken);
                    // The supplier comes from the account only; nothing the browser sends can change it.
                    userDetails.getAuthorities().stream().map(a -> a.getAuthority())
                        .filter(a -> a.startsWith(CustomUserDetailsService.SUPPLIER_AUTHORITY)).findFirst()
                        .ifPresent(a -> com.carrental.backend.tenant.TenantContext.bind(a.substring(CustomUserDetailsService.SUPPLIER_AUTHORITY.length())));
                    // Any signed-in request means the app is open; a change (not a read) means they're working.
                    // Signing out is handled by its own endpoint.
                    if (!requestUri.equals("/api/account/signed-out")) presence.seen(email, !request.getMethod().equalsIgnoreCase("GET"));
                }
            } catch (UsernameNotFoundException e) {
                // Token for a user that no longer exists: continue unauthenticated (401 for protected routes)
                logger.warn("JWT subject not found");
            }
        }
        filterChain.doFilter(request, response);
    }
}
