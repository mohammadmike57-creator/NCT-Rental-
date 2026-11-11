package com.carrental.backend.config;

import jakarta.persistence.EntityManagerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.orm.jpa.support.OpenEntityManagerInViewInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * "Open EntityManager in view" for the staff application, as before, but not for the broker gateway.
 *
 * Spring's default keeps a database connection for the whole web request. Broker requests wait in
 * line for the booking lock; with that default every waiting request kept a connection, the pool ran
 * dry and the request holding the lock could not get the one connection it needed to save: 20
 * brokers booking at the same moment hung for 30 seconds. Gateway requests now take a connection
 * only while they use it. Everything else keeps the same behaviour (spring.jpa.open-in-view=false
 * in application.properties turns off only Spring's global version of this interceptor).
 */
@Configuration
public class OpenEntityManagerConfig implements WebMvcConfigurer {

    static final String[] GATEWAY = {"/ota/**", "/xml/**", "/partner/**", "/api/v3/**", "/oauth/token"};

    private final EntityManagerFactory emf;

    public OpenEntityManagerConfig(EntityManagerFactory emf) { this.emf = emf; }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        OpenEntityManagerInViewInterceptor osiv = new OpenEntityManagerInViewInterceptor();
        osiv.setEntityManagerFactory(emf);
        registry.addWebRequestInterceptor(osiv).excludePathPatterns(GATEWAY);
    }
}
