package com.carrental.backend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final com.carrental.backend.tenant.ChannelOwnershipInterceptor channelOwnership;

    public WebConfig(com.carrental.backend.tenant.ChannelOwnershipInterceptor channelOwnership) {
        this.channelOwnership = channelOwnership;
    }

    /** Staff screens of a broker channel answer only for the signed-in person's own supplier. */
    @Override
    public void addInterceptors(org.springframework.web.servlet.config.annotation.InterceptorRegistry registry) {
        registry.addInterceptor(channelOwnership).addPathPatterns("/api/channels/**");
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // Serve static resources from multiple locations
        registry.addResourceHandler("/**")
                .addResourceLocations(
                    "classpath:/static/",
                    "classpath:/public/",
                    "file:./dist/",
                    "file:./public/"
                )
                .setCachePeriod(0);
    }

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        // Forward root to index.html for SPA routing
        registry.addViewController("/").setViewName("forward:/index.html");
        // The platform admin portal and the set-password page are pages of the same app.
        registry.addViewController("/admin").setViewName("forward:/index.html");
        registry.addViewController("/admin/suppliers").setViewName("forward:/index.html");
        registry.addViewController("/admin/suppliers/{id}").setViewName("forward:/index.html");
        registry.addViewController("/admin/activity").setViewName("forward:/index.html");
        registry.addViewController("/set-password").setViewName("forward:/index.html");
        // A supplier's own sign-in link: the same app, with that supplier's logo and colour on the sign-in page.
        registry.addViewController("/s/{code}").setViewName("forward:/index.html");
    }
}
