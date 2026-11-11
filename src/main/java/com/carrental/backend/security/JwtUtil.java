package com.carrental.backend.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import com.carrental.backend.config.ServerSecret;
import io.jsonwebtoken.JwtException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;

import java.security.Key;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

@Component
public class JwtUtil {

    private final ServerSecret secret;

    @Value("${jwt.expiration}")
    private Long expiration;

    public JwtUtil(ServerSecret secret) {
        this.secret = secret;
    }

    private static Key keyFor(String value) {
        return Keys.hmacShaKeyFor(value.getBytes());
    }

    private Key getSigningKey() {
        return keyFor(secret.current());
    }

    public String extractEmail(String token) {
        return extractClaim(token, Claims::getSubject);
    }

    public String extractUsername(String token) {
        return extractEmail(token);
    }

    public Date extractExpiration(String token) {
        return extractClaim(token, Claims::getExpiration);
    }

    public <T> T extractClaim(String token, Function<Claims, T> claimsResolver) {
        final Claims claims = extractAllClaims(token);
        return claimsResolver.apply(claims);
    }

    /** Checked with the current secret, then with JWT_SECRET_PREVIOUS (so a secret change logs nobody out). */
    private Claims extractAllClaims(String token) {
        JwtException last = null;
        for (String value : secret.all()) {
            try {
                return Jwts.parserBuilder().setSigningKey(keyFor(value)).build().parseClaimsJws(token).getBody();
            } catch (io.jsonwebtoken.security.SignatureException e) {
                last = e;   // signed with another secret: try the next one
            }
        }
        throw last;
    }

    private Boolean isTokenExpired(String token) {
        return extractExpiration(token).before(new Date());
    }

    public String generateToken(String email) {
        Map<String, Object> claims = new HashMap<>();
        return createToken(claims, email);
    }

    private String createToken(Map<String, Object> claims, String subject) {
        return Jwts.builder()
                .setClaims(claims)
                .setSubject(subject)
                .setIssuedAt(new Date(System.currentTimeMillis()))
                .setExpiration(new Date(System.currentTimeMillis() + expiration))
                .signWith(getSigningKey())
                .compact();
    }

    public Boolean validateToken(String token, UserDetails userDetails) {
        final String email = extractEmail(token);
        return (email.equals(userDetails.getUsername()) && !isTokenExpired(token));
    }
}
