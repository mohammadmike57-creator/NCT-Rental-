package com.carrental.backend.controller;

import com.carrental.backend.service.StateService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/state")
@RequiredArgsConstructor
public class StateController {

    private static final Logger logger = LoggerFactory.getLogger(StateController.class);

    private final StateService stateService;

    @GetMapping
    public ResponseEntity<String> getState() {
        return ResponseEntity.ok(stateService.getFullState());
    }

    @PostMapping
    public ResponseEntity<?> updateState(@RequestBody String updates) {
        logger.info("Received state update payload length: {}", updates.length());
        logger.debug("Payload: {}", updates);
        stateService.mergeState(updates);
        return ResponseEntity.ok().build();
    }
}
