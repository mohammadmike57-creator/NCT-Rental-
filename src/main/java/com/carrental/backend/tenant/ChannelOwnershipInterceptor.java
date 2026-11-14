package com.carrental.backend.tenant;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;

import java.util.Map;

/**
 * Every staff address under /api/channels/{channelId}/… (bookings, traffic, keys, console, connectors, OAuth
 * clients, deliveries) answers only for a channel the signed-in person's supplier owns. Another supplier's channel,
 * or a channel nobody owns any more, is "not found", exactly like a channel that never existed.
 */
@Component
public class ChannelOwnershipInterceptor implements HandlerInterceptor {

    private final ChannelRegistry registry;

    public ChannelOwnershipInterceptor(ChannelRegistry registry) { this.registry = registry; }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        Object vars = request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        String channelId = vars instanceof Map<?, ?> m && m.get("channelId") instanceof String s ? s : null;
        if (channelId == null || !TenantContext.isBound()) return true;   // not signed in: refused by the security rules
        String owner = registry.owner(channelId).orElse(null);
        if (TenantContext.current().equals(owner)) return true;
        response.setStatus(HttpServletResponse.SC_NOT_FOUND);
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"Channel not found\"}");
        return false;
    }
}
