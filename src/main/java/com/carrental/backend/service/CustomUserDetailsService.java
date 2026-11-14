package com.carrental.backend.service;

import com.carrental.backend.model.User;
import com.carrental.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CustomUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;
    private final com.carrental.backend.tenant.SupplierService suppliers;

    /** Authority naming the person's supplier (read by the sign-in filter); never a permission. */
    public static final String SUPPLIER_AUTHORITY = "SUPPLIER:";

    public static String supplierOf(String supplierId) {
        return supplierId == null || supplierId.isBlank() ? com.carrental.backend.tenant.TenantContext.DEFAULT : supplierId;
    }

    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new UsernameNotFoundException("User not found with email: " + email));

        // Nobody gets more than the supplier's package holds (Full system, CRM only or OTA XML only).
        String supplierId = supplierOf(user.getSupplierId());
        List<SimpleGrantedAuthority> authorities = suppliers.planOf(supplierId).cap(user.getPermissions()).stream()
                .map(permission -> new SimpleGrantedAuthority(permission.name()))
                .collect(Collectors.toList());
        String supplier = supplierId;
        authorities.add(new SimpleGrantedAuthority(SUPPLIER_AUTHORITY + supplier));

        return org.springframework.security.core.userdetails.User.builder()
                .username(user.getEmail())
                .password(user.getPassword())
                .authorities(authorities)
                .disabled(user.getStatus() != null && user.getStatus() != com.carrental.backend.model.UserStatus.ACTIVE
                        || Boolean.FALSE.equals(user.getWebAppAccess())
                        || !suppliers.isActive(supplier))   // a paused or closed supplier's staff cannot work
                .build();
    }
}
