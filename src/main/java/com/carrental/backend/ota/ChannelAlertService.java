package com.carrental.backend.ota;

import com.carrental.backend.audit.ActivityService;
import com.carrental.backend.notify.CustomerEmailService;
import com.carrental.backend.notify.MailSettingsService;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import javax.mail.Authenticator;
import javax.mail.Message;
import javax.mail.PasswordAuthentication;
import javax.mail.Session;
import javax.mail.Transport;
import javax.mail.internet.InternetAddress;
import javax.mail.internet.MimeMessage;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Broker alerts: every few minutes (from {@link ChannelJobs}) each live broker is checked, and the people in the
 * channel's {@code alertEmails} (else ALERT_EMAIL) get an email when something needs them:
 *   - many of the broker's requests fail (more than 10% of at least 20 in the last hour),
 *   - bookings from the broker fail (in the last hour),
 *   - the broker stopped searching (nothing for 6 hours after calls in the last 7 days),
 *   - status updates could not be delivered to the broker,
 *   - answers are slow (95% above 5 seconds, at least 10 calls in the last hour).
 * The same alert for the same broker is sent at most once every 6 hours while it lasts; every alert also goes to
 * the Activity Log. Channels in testing or paused are not checked. Nothing is sent when email is not set up.
 */
@Service
public class ChannelAlertService {

    private static final Logger log = LoggerFactory.getLogger(ChannelAlertService.class);
    static final Duration REPEAT_AFTER = Duration.ofHours(6);

    public record Alert(String type, String title, String text) {}

    private final ChannelTrafficService traffic;
    private final ChannelWebhookRepository deliveries;
    private final MailSettingsService mail;
    private final ActivityService activity;
    private final String fallbackEmail;
    private final Map<String, Instant> lastSent = new ConcurrentHashMap<>();

    public ChannelAlertService(ChannelTrafficService traffic, ChannelWebhookRepository deliveries, MailSettingsService mail,
                               ActivityService activity, @Value("${alert.email:${ALERT_EMAIL:}}") String fallbackEmail) {
        this.traffic = traffic;
        this.deliveries = deliveries;
        this.mail = mail;
        this.activity = activity;
        this.fallbackEmail = fallbackEmail == null ? "" : fallbackEmail.trim();
    }

    /** Who gets this channel's alerts: its own list, else the server's ALERT_EMAIL. */
    public List<String> recipients(ChannelSnapshot ch) {
        Set<String> out = new LinkedHashSet<>();
        JsonNode own = ch.raw().path("alertEmails");
        String text = own.isArray() ? String.join(",", iterable(own)) : own.asText("");
        for (String s : (text.isBlank() ? fallbackEmail : text).split("[,;\\s]+")) if (s.contains("@")) out.add(s.trim());
        return new ArrayList<>(out);
    }

    private static List<String> iterable(JsonNode arr) {
        List<String> out = new ArrayList<>();
        arr.forEach(n -> out.add(n.asText("")));
        return out;
    }

    /** What is wrong with this broker right now (empty when all is well). */
    @SuppressWarnings("unchecked")
    public List<Alert> problems(ChannelSnapshot ch) {
        List<Alert> out = new ArrayList<>();
        Map<String, Object> hour = traffic.stats(ch.id(), 1);
        long live = num(hour.get("liveCalls")), liveErrors = num(hour.get("liveErrors")), calls = num(hour.get("calls"));
        if (live >= 20 && liveErrors * 10 > live) {
            String top = ((List<Map<String, Object>>) hour.getOrDefault("errorCodes", List.of())).stream().findFirst().map(m -> String.valueOf(m.get("code"))).orElse("");
            out.add(new Alert("errors", "Many requests are failing",
                liveErrors + " of " + live + " requests from " + ch.name() + " failed in the last hour" + (top.isBlank() ? "" : ", mostly " + top)
                    + ". The broker may be showing no cars. Open OTA XML → Technical → Monitoring → Traffic to see why."));
        }
        long failedBookings = ((List<Map<String, Object>>) hour.getOrDefault("operations", List.of())).stream()
            .filter(o -> Set.of("OTA_VehRes", "XML ReservationCreate", "REST create").contains(String.valueOf(o.get("operation"))))
            .mapToLong(o -> num(o.get("errors"))).sum();
        if (failedBookings > 0) out.add(new Alert("bookings", "Bookings are failing",
            failedBookings + " booking" + (failedBookings == 1 ? "" : "s") + " from " + ch.name() + " failed in the last hour. Customers may have been turned away. "
                + "Open OTA XML → Technical → Monitoring → Traffic and filter on errors."));
        if (calls >= 10 && num(hour.get("p95Ms")) > 5000) out.add(new Alert("slow", "Answers are slow",
            "95% of answers to " + ch.name() + " took up to " + (num(hour.get("p95Ms")) / 1000) + " seconds in the last hour. Brokers usually give up after 3 to 5 seconds."));
        if (num(traffic.stats(ch.id(), 6).get("liveCalls")) == 0 && num(traffic.stats(ch.id(), 24 * 7).get("liveCalls")) > 0) out.add(new Alert("silent", "The broker stopped searching",
            ch.name() + " sent no searches in the last 6 hours, although it did in the last 7 days. Check with the broker that the connection is running, "
                + "and that the server is awake."));
        long failed = deliveries.findByChannelIdOrderByCreatedAtDesc(ch.id(), PageRequest.of(0, 100)).stream()
            .filter(d -> d.getStatus() == ChannelWebhookDelivery.Status.FAILED).count();
        if (failed > 0) out.add(new Alert("webhooks", "Status updates are not reaching the broker",
            failed + " status update" + (failed == 1 ? "" : "s") + " (bookings, changes, cancellations) could not be delivered to " + ch.name()
                + ". OTA XML resends them when the Dashboard opens; if they keep failing, check the broker's address under Technical → Booking API."));
        return out;
    }

    /** One background check of a live channel: emails the alerts that are new or have lasted 6 hours since the last email. */
    public void check(ChannelSnapshot ch) {
        if (!"active".equalsIgnoreCase(ch.status()) || !ch.isProduction()) return;
        List<Alert> due = new ArrayList<>();
        Instant now = Instant.now();
        for (Alert a : problems(ch)) {
            String key = ch.supplierId() + "|" + ch.id() + "|" + a.type();
            Instant last = lastSent.get(key);
            if (last == null || last.plus(REPEAT_AFTER).isBefore(now)) { due.add(a); lastSent.put(key, now); }
        }
        if (due.isEmpty()) return;
        due.forEach(a -> {
            try { activity.recordSystem("system", "BROKER_ALERT", ch.name() + ": " + a.title(), a.text()); } catch (Exception e) { log.debug("Alert not logged: {}", e.getMessage()); }
        });
        String result = send(ch, due, false);
        log.info("Broker alert for {} ({}): {}", ch.name(), due.size(), result);
    }

    /** Sends the alerts by email; returns "sent to …" or why nothing was sent. */
    public String send(ChannelSnapshot ch, List<Alert> alerts, boolean test) {
        List<String> to = recipients(ch);
        if (to.isEmpty()) return "No alert email address is set for " + ch.name() + ".";
        MailSettingsService.MailConfig cfg = mail.effective();
        if (!cfg.usable()) return "Outgoing email is not set up (Company Details → Email settings).";
        try {
            Session session = Session.getInstance(CustomerEmailService.smtpProps(cfg), new Authenticator() {
                @Override protected PasswordAuthentication getPasswordAuthentication() { return new PasswordAuthentication(cfg.username(), cfg.password()); }
            });
            MimeMessage msg = new MimeMessage(session);
            msg.setFrom(new InternetAddress(cfg.from(), ch.vendorName(), "UTF-8"));
            msg.setRecipients(Message.RecipientType.TO, InternetAddress.parse(String.join(",", to), true));
            msg.setSubject((test ? "[Test] " : "") + ch.name() + ": " + (alerts.size() == 1 ? alerts.get(0).title() : alerts.size() + " problems need you"), "UTF-8");
            msg.setText(body(ch, alerts, test), "UTF-8");
            Transport.send(msg);
            return "Sent to " + String.join(", ", to) + ".";
        } catch (Exception e) {
            log.warn("Broker alert email for {} failed: {}", ch.name(), e.getMessage());
            return "The email could not be sent: " + e.getMessage();
        }
    }

    static String body(ChannelSnapshot ch, List<Alert> alerts, boolean test) {
        StringBuilder b = new StringBuilder();
        if (test) b.append("This is a test alert. Real alerts look like this and come when something goes wrong with ").append(ch.name()).append(".\n\n");
        for (Alert a : alerts) b.append("• ").append(a.title()).append('\n').append("  ").append(a.text()).append("\n\n");
        b.append("You get this because your address is set for ").append(ch.name()).append(" alerts in OTA XML → Technical → Alerts.\n")
         .append("The same alert is repeated no sooner than 6 hours from now while it lasts.\n");
        return b.toString();
    }

    private static long num(Object o) { return o instanceof Number n ? n.longValue() : 0L; }
}
