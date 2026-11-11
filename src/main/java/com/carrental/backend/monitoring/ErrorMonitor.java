package com.carrental.backend.monitoring;

import com.carrental.backend.audit.ActivityService;
import com.carrental.backend.notify.MailSettingsService;
import com.carrental.backend.notify.CustomerEmailService;
import jakarta.annotation.PreDestroy;
import javax.mail.Authenticator;
import javax.mail.Message;
import javax.mail.PasswordAuthentication;
import javax.mail.Session;
import javax.mail.Transport;
import javax.mail.internet.InternetAddress;
import javax.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Collects unexpected errors from the server and from staff browsers.
 *
 * Every error gets a short reference (e.g. ERR-7K2M9Q) that the person sees, is written to the log
 * and to the Activity Log (category "system"). When ALERT_EMAIL is set, a summary email goes there
 * at most once every 30 minutes while errors keep happening. Nothing is emailed without it.
 */
@Service
public class ErrorMonitor {

    private static final Logger log = LoggerFactory.getLogger(ErrorMonitor.class);
    private static final String ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int MAX_PENDING = 50;
    static final long ALERT_GAP_MS = 30 * 60 * 1000L;

    public record Report(Instant at, String reference, String source, String summary, String user) {}

    private final ActivityService activity;
    private final MailSettingsService mail;
    private final String alertEmail;
    private final List<Report> pending = new ArrayList<>();
    private int dropped;
    private long lastAlertAt;
    private final ScheduledExecutorService timer;

    public ErrorMonitor(ActivityService activity, MailSettingsService mail, @Value("${alert.email:${ALERT_EMAIL:}}") String alertEmail) {
        this.activity = activity;
        this.mail = mail;
        this.alertEmail = alertEmail == null ? "" : alertEmail.trim();
        // Its own timer: the server has no general scheduler switched on.
        this.timer = Executors.newSingleThreadScheduledExecutor(r -> { Thread t = new Thread(r, "error-alerts"); t.setDaemon(true); return t; });
        this.timer.scheduleWithFixedDelay(this::sendAlerts, 1, 1, TimeUnit.MINUTES);
    }

    @PreDestroy
    void stop() { timer.shutdownNow(); }

    public static String newReference() {
        StringBuilder b = new StringBuilder("ERR-");
        for (int i = 0; i < 6; i++) b.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        return b.toString();
    }

    /** Records an error and returns its reference. Never throws. */
    public String report(String source, String summary, String details, String userEmail) {
        String ref = newReference();
        String who = userEmail == null || userEmail.isBlank() ? "system" : userEmail;
        String text = clip(summary, 300);
        try {
            activity.recordSystem(who, "server".equals(source) ? "SERVER_ERROR" : "SCREEN_ERROR", ref + " · " + text, clip(details, 4000));
        } catch (Exception e) {
            log.warn("Could not add error {} to the activity log: {}", ref, e.getMessage());
        }
        synchronized (pending) {
            if (pending.size() < MAX_PENDING) pending.add(new Report(Instant.now(), ref, source, text, who));
            else dropped++;
        }
        return ref;
    }

    /** Sends the waiting errors to ALERT_EMAIL, at most once every 30 minutes. */
    public void sendAlerts() {
        if (alertEmail.isEmpty()) { synchronized (pending) { pending.clear(); dropped = 0; } return; }
        long now = System.currentTimeMillis();
        List<Report> batch;
        int more;
        synchronized (pending) {
            if (pending.isEmpty() || now - lastAlertAt < ALERT_GAP_MS) return;
            batch = new ArrayList<>(pending);
            more = dropped;
            pending.clear();
            dropped = 0;
            lastAlertAt = now;
        }
        try {
            send(batch, more);
        } catch (Exception e) {
            log.warn("Error alert email to {} failed: {}", alertEmail, e.getMessage());
        }
    }

    private void send(List<Report> batch, int more) throws Exception {
        MailSettingsService.MailConfig cfg = mail.effective();
        if (!cfg.usable()) { log.warn("{} error(s) not emailed: outgoing email is not set up.", batch.size()); return; }
        Session session = Session.getInstance(CustomerEmailService.smtpProps(cfg), new Authenticator() {
            @Override protected PasswordAuthentication getPasswordAuthentication() { return new PasswordAuthentication(cfg.username(), cfg.password()); }
        });
        MimeMessage msg = new MimeMessage(session);
        msg.setFrom(new InternetAddress(cfg.from(), cfg.fromName(), "UTF-8"));
        msg.setRecipients(Message.RecipientType.TO, InternetAddress.parse(alertEmail, true));
        int total = batch.size() + more;
        msg.setSubject(total + " error" + (total == 1 ? "" : "s") + " in the rental system", "UTF-8");
        msg.setText(body(batch, more), "UTF-8");
        Transport.send(msg);
        log.info("Error alert ({} errors) sent to {}", total, alertEmail);
    }

    static String body(List<Report> batch, int more) {
        DateTimeFormatter f = DateTimeFormatter.ofPattern("d MMM HH:mm").withZone(ZoneId.of("Asia/Amman"));
        StringBuilder b = new StringBuilder("These errors happened in the rental system. Details are in Activity Log → System errors (search for the reference).\n\n");
        for (Report r : batch) {
            b.append(f.format(r.at())).append("  ").append(r.reference()).append("  ")
             .append("server".equals(r.source()) ? "Server" : "Screen").append("  ").append(r.user()).append('\n')
             .append("    ").append(r.summary()).append("\n\n");
        }
        if (more > 0) b.append("…and ").append(more).append(" more.\n");
        b.append("\nThe next summary is sent no sooner than 30 minutes from now.\n");
        return b.toString();
    }

    List<Report> pendingForTest() { synchronized (pending) { return new ArrayList<>(pending); } }

    private static String clip(String s, int n) {
        if (s == null) return "";
        String t = s.replaceAll("\\s+", " ").trim();
        return t.length() <= n ? t : t.substring(0, n) + "…";
    }
}
