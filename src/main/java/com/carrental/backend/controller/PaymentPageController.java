package com.carrental.backend.controller;

import com.carrental.backend.model.Payment;
import com.carrental.backend.repository.PaymentRepository;
import com.carrental.backend.service.StateService;
import com.carrental.backend.service.StripeService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.stripe.model.checkout.Session;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Optional;

/**
 * The pages Stripe Checkout sends the payer back to. Without them the payer saw the server's
 * "Whitelabel Error Page" right after paying. The success page asks Stripe whether the session
 * is really paid (never trusting the address alone) and marks our payment record as paid, so it
 * is recorded even when the Stripe webhook is not set up.
 */
@RestController
public class PaymentPageController {

    private static final Logger log = LoggerFactory.getLogger(PaymentPageController.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("dd MMM yyyy, HH:mm", Locale.ENGLISH);

    private final StripeService stripe;
    private final PaymentRepository payments;
    private final StateService state;

    public PaymentPageController(StripeService stripe, PaymentRepository payments, StateService state) {
        this.stripe = stripe;
        this.payments = payments;
        this.state = state;
    }

    @GetMapping(value = "/payment/success", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> success(@RequestParam(name = "session_id", required = false) String sessionId) {
        String company = companyName();
        if (sessionId == null || !sessionId.matches("cs_[A-Za-z0-9_]{10,250}")) {
            return page(company, "Thank you", "info",
                "If your payment went through, Stripe has sent a receipt to your email address.", null);
        }
        Session session;
        try {
            session = stripe.retrieveSession(sessionId);
        } catch (Exception e) {
            log.warn("Payment page: could not read Stripe session {}: {}", sessionId, e.getMessage());
            return page(company, "Thank you", "info",
                "We could not show the payment details right now. If your payment went through, Stripe has sent a receipt to your email address.", null);
        }
        Optional<Payment> record = payments.findByStripeCheckoutSessionId(session.getId());
        boolean paid = "paid".equals(session.getPaymentStatus()) || "no_payment_required".equals(session.getPaymentStatus());
        if (paid) {
            record.filter(p -> p.getStatus() != Payment.PaymentStatus.SUCCEEDED).ifPresent(p -> {
                p.setStatus(Payment.PaymentStatus.SUCCEEDED);
                if (session.getPaymentIntent() != null) p.setStripePaymentId(session.getPaymentIntent());
                if (p.getPaidAt() == null) p.setPaidAt(LocalDateTime.now());
                payments.save(p);
                log.info("Payment page: session {} confirmed paid", session.getId());
            });
        }

        String amount = session.getAmountTotal() == null ? null
            : BigDecimal.valueOf(session.getAmountTotal()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP).toPlainString()
              + " " + (session.getCurrency() == null ? "" : session.getCurrency().toUpperCase(Locale.ROOT));
        String ref = record.map(p -> shortRef(String.valueOf(p.getId()))).orElse(session.getId().substring(Math.max(0, session.getId().length() - 10)).toUpperCase(Locale.ROOT));
        String email = session.getCustomerDetails() != null ? session.getCustomerDetails().getEmail() : null;

        StringBuilder rows = new StringBuilder();
        if (amount != null) rows.append(row("Amount", amount));
        rows.append(row("Date", LocalDateTime.now(ZoneId.of("Asia/Amman")).format(WHEN)));
        rows.append(row("Reference", ref));
        if (email != null && !email.isBlank()) rows.append(row("Receipt sent to", email));

        return paid
            ? page(company, "Payment received", "ok", "Thank you. Your payment was successful.", rows.toString())
            : page(company, "Payment being processed", "info",
                "Your payment has not been confirmed yet. You will receive a receipt from Stripe as soon as it is.", rows.toString());
    }

    @GetMapping(value = "/payment/cancel", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> cancel() {
        return page(companyName(), "Payment cancelled", "info", "No payment was taken. You can close this page, or open the payment link again to pay.", null);
    }

    /** A reference a person can read out: the first 8 letters and digits of the payment id. */
    static String shortRef(String id) {
        String c = id == null ? "" : id.replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ROOT);
        return "P-" + (c.length() > 8 ? c.substring(0, 8) : c);
    }

    private String companyName() {
        try {
            String n = JSON.readTree(state.getFullState()).path("companyDetails").path("name").asText("");
            return n.isBlank() ? "UR-Drive Jordan" : n;
        } catch (Exception e) {
            return "UR-Drive Jordan";
        }
    }

    private static String row(String label, String value) {
        return "<tr><th>" + esc(label) + "</th><td>" + esc(value) + "</td></tr>";
    }

    private static ResponseEntity<String> page(String company, String title, String tone, String message, String rows) {
        String icon = "ok".equals(tone)
            ? "<svg viewBox=\"0 0 24 24\" width=\"30\" height=\"30\" fill=\"none\" stroke=\"#fff\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 12.5l4.5 4.5L19 7.5\"/></svg>"
            : "<svg viewBox=\"0 0 24 24\" width=\"28\" height=\"28\" fill=\"none\" stroke=\"#fff\" stroke-width=\"2.6\" stroke-linecap=\"round\"><path d=\"M12 7v6\"/><circle cx=\"12\" cy=\"17\" r=\".6\" fill=\"#fff\"/></svg>";
        String html = """
            <!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
            <meta name="robots" content="noindex"><title>%s · %s</title>
            <style>
              *{box-sizing:border-box;margin:0;padding:0}
              body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:#f1f5f9;
                font-family:-apple-system,'Segoe UI',Inter,Helvetica,Arial,sans-serif;color:#0f172a}
              .card{width:100%%;max-width:440px;background:#fff;border-radius:18px;box-shadow:0 10px 40px rgba(15,23,42,.08);overflow:hidden}
              .top{height:5px;background:linear-gradient(90deg,#0b1f3a,#334155 60%%,#f59e0b)}
              .body{padding:32px 28px 26px;text-align:center}
              .icon{width:58px;height:58px;border-radius:50%%;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;background:%s}
              h1{font-size:22px;letter-spacing:-.01em}
              p{margin-top:8px;font-size:15px;line-height:1.5;color:#475569}
              table{width:100%%;margin-top:22px;border-collapse:collapse;text-align:left;font-size:14px}
              th,td{padding:10px 0;border-top:1px solid #e2e8f0;vertical-align:top}
              th{color:#64748b;font-weight:500;width:42%%}
              td{font-weight:600;text-align:right;word-break:break-word}
              .foot{padding:14px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:center}
              .co{font-weight:700;color:#0f172a}
            </style></head><body>
            <main class="card"><div class="top"></div><div class="body">
              <div class="icon">%s</div><h1>%s</h1><p>%s</p>%s
            </div><div class="foot"><span class="co">%s</span><br>You can close this page.</div></main>
            </body></html>
            """.formatted(esc(title), esc(company), "ok".equals(tone) ? "#059669" : "#334155", icon, esc(title), esc(message),
                rows == null ? "" : "<table>" + rows + "</table>", esc(company));
        return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).header("Cache-Control", "no-store").body(html);
    }

    private static String esc(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
