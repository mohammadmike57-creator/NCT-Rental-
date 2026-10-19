package com.carrental.backend.controller;

import com.carrental.backend.model.MediaFile;
import com.carrental.backend.repository.MediaFileRepository;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Image uploads for the app (fleet vehicle photos).
 *   POST /api/media        {"dataUrl": "data:image/jpeg;base64,..."}  -> {"id", "url"}   (signed-in staff)
 *   GET  /api/media/{id}   the image bytes, cached for a year                           (public: ids are random UUIDs)
 */
@RestController
@RequestMapping("/api/media")
public class MediaController {

    private static final Pattern DATA_URL = Pattern.compile("^data:(image/[a-z+.-]+);base64,(.+)$", Pattern.DOTALL);
    private static final Set<String> ALLOWED = Set.of("image/jpeg", "image/png", "image/webp");
    private static final int MAX_BYTES = 3 * 1024 * 1024;

    private final MediaFileRepository repository;

    public MediaController(MediaFileRepository repository) {
        this.repository = repository;
    }

    @PostMapping
    public ResponseEntity<?> upload(@RequestBody Map<String, String> body, Authentication auth) {
        Matcher m = DATA_URL.matcher(body.getOrDefault("dataUrl", ""));
        if (!m.matches()) return ResponseEntity.badRequest().body(Map.of("error", "Send the image as a data URL"));
        String type = m.group(1).toLowerCase();
        if (!ALLOWED.contains(type)) return ResponseEntity.badRequest().body(Map.of("error", "Only JPEG, PNG or WebP images are accepted"));
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(m.group(2).trim());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "The image data is not valid"));
        }
        if (bytes.length == 0 || bytes.length > MAX_BYTES) return ResponseEntity.badRequest().body(Map.of("error", "The image must be smaller than 3 MB"));

        MediaFile file = new MediaFile();
        file.setId(UUID.randomUUID().toString());
        file.setContentType(type);
        file.setData(Base64.getEncoder().encodeToString(bytes));
        file.setSizeBytes(bytes.length);
        file.setUploadedBy(auth != null ? auth.getName() : null);
        file.setUploadedAt(Instant.now());
        repository.save(file);
        return ResponseEntity.ok(Map.of("id", file.getId(), "url", "/api/media/" + file.getId()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<byte[]> get(@PathVariable String id) {
        return repository.findById(id)
            .map(f -> ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(f.getContentType()))
                .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                .body(Base64.getDecoder().decode(f.getData())))
            .orElse(ResponseEntity.notFound().build());
    }
}
