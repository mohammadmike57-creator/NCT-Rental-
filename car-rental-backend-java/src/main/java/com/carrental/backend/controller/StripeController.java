package com.carrental.backend.controller;

import com.carrental.backend.dto.PaymentLinkRequest;
import com.carrental.backend.service.StripeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/stripe")
public class StripeController {

    @Autowired
    private StripeService stripeService;

    @PostMapping("/create-payment-link")
    public ResponseEntity<?> createPaymentLink(@RequestBody PaymentLinkRequest request) {
        long amountInCents = (long) (request.getAmount() * 100);
        String url = stripeService.createPaymentLink(amountInCents, request.getDescription());
        Map<String, String> response = new HashMap<>();
        response.put("url", url);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/test")
    public ResponseEntity<String> test() {
        return ResponseEntity.ok("OK");
    }
}
