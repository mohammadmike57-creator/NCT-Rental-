package com.carrental.backend.notify;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.mail.*;
import javax.mail.internet.*;
import javax.mail.util.ByteArrayDataSource;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Properties;
import java.util.Set;
import java.util.regex.Pattern;

/** Sends customer-facing emails (rental agreements, extension invoices) over SMTP. */
@Service
public class CustomerEmailService {

    private static final Logger log = LoggerFactory.getLogger(CustomerEmailService.class);
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@,;<>]+@[^\\s@,;<>]+\\.[^\\s@,;<>]+$");
    private static final Set<String> ALLOWED_TYPES = Set.of("application/pdf", "text/html", "text/plain");
    static final int MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

    @Value("${mail.smtp.enabled:false}") boolean enabled;
    @Value("${mail.smtp.host:smtp.gmail.com}") String host;
    @Value("${mail.smtp.port:587}") String port;
    @Value("${mail.smtp.username:}") String username;
    @Value("${mail.smtp.password:}") String password;
    @Value("${mail.smtp.from:noreply@nctrental.com}") String from;
    @Value("${mail.smtp.from.name:NCT Rental}") String fromName;

    public static class EmailException extends RuntimeException {
        private final int status;
        public EmailException(int status, String message) { super(message); this.status = status; }
        public int status() { return status; }
    }

    public boolean isConfigured() {
        return enabled && !host.isBlank() && !username.isBlank() && !password.isBlank();
    }

    public void send(CustomerEmailRequest req) {
        String to = req.to() == null ? "" : req.to().trim();
        if (!EMAIL.matcher(to).matches()) throw new EmailException(400, "The customer email address is not valid.");
        if (blank(req.subject())) throw new EmailException(400, "Subject is required.");
        if (!isConfigured()) throw new EmailException(503, "Email sending is not set up on the server (MAIL_ENABLED / SMTP settings).");

        try {
            Session session = Session.getInstance(smtpProps(), new Authenticator() {
                @Override protected PasswordAuthentication getPasswordAuthentication() {
                    return new PasswordAuthentication(username, password);
                }
            });
            MimeMessage msg = new MimeMessage(session);
            msg.setFrom(new InternetAddress(from, blank(req.companyName()) ? fromName : req.companyName(), "UTF-8"));
            msg.setRecipients(Message.RecipientType.TO, InternetAddress.parse(to, true));
            if (!blank(req.replyTo()) && EMAIL.matcher(req.replyTo().trim()).matches()) {
                msg.setReplyTo(InternetAddress.parse(req.replyTo().trim(), true));
            }
            msg.setSubject(clip(req.subject(), 200), "UTF-8");

            MimeMultipart mixed = new MimeMultipart("mixed");
            MimeMultipart alternative = new MimeMultipart("alternative");
            MimeBodyPart text = new MimeBodyPart();
            text.setText(renderText(req), "UTF-8");
            MimeBodyPart html = new MimeBodyPart();
            html.setContent(renderHtml(req), "text/html; charset=UTF-8");
            alternative.addBodyPart(text);
            alternative.addBodyPart(html);
            MimeBodyPart body = new MimeBodyPart();
            body.setContent(alternative);
            mixed.addBodyPart(body);

            for (CustomerEmailRequest.Attachment a : req.attachments() == null ? List.<CustomerEmailRequest.Attachment>of() : req.attachments()) {
                if (a == null || blank(a.base64())) continue;
                String type = a.contentType() == null ? "application/pdf" : a.contentType().toLowerCase();
                if (!ALLOWED_TYPES.contains(type)) throw new EmailException(400, "Attachment type not allowed: " + type);
                byte[] bytes;
                try { bytes = Base64.getDecoder().decode(a.base64()); }
                catch (IllegalArgumentException e) { throw new EmailException(400, "Attachment is not valid base64."); }
                if (bytes.length > MAX_ATTACHMENT_BYTES) throw new EmailException(400, "Attachment is too large.");
                MimeBodyPart part = new MimeBodyPart();
                part.setDataHandler(new javax.activation.DataHandler(new ByteArrayDataSource(bytes, type)));
                part.setFileName(MimeUtility.encodeText(safeFileName(a.fileName(), type), "UTF-8", null));
                mixed.addBodyPart(part);
            }
            msg.setContent(mixed);
            Transport.send(msg);
            log.info("Customer email '{}' sent to {}", req.subject(), to);
        } catch (EmailException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Customer email to {} failed: {}", to, e.getMessage());
            throw new EmailException(502, "The mail server rejected the message: " + clip(String.valueOf(e.getMessage()), 200));
        }
    }

    private Properties smtpProps() {
        Properties p = new Properties();
        p.put("mail.smtp.auth", "true");
        p.put("mail.smtp.host", host);
        p.put("mail.smtp.port", port);
        p.put("mail.smtp.connectiontimeout", "15000");
        p.put("mail.smtp.timeout", "20000");
        if ("465".equals(port)) p.put("mail.smtp.ssl.enable", "true");
        else p.put("mail.smtp.starttls.enable", "true");
        return p;
    }

    // ---------------------------------------------------------------- rendering

    static String esc(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;");
    }

    static String renderHtml(CustomerEmailRequest r) {
        StringBuilder rows = new StringBuilder();
        if (r.rows() != null) {
            for (List<String> row : r.rows()) {
                if (row == null || row.size() < 2) continue;
                rows.append("<tr><td style=\"padding:8px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9\">")
                    .append(esc(row.get(0)))
                    .append("</td><td style=\"padding:8px 0;color:#0f172a;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #f1f5f9\">")
                    .append(esc(row.get(1))).append("</td></tr>");
            }
        }
        String company = blank(r.companyName()) ? "NCT Rental" : r.companyName();
        String contact = String.join(" · ", java.util.stream.Stream.of(r.companyAddress(), r.companyPhone(), r.companyEmail())
            .filter(x -> !blank(x)).map(CustomerEmailService::esc).toList());
        return "<!DOCTYPE html><html><body style=\"margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif\">"
            + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#f1f5f9;padding:24px 12px\"><tr><td align=\"center\">"
            + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden\">"
            + "<tr><td style=\"background:#0f172a;padding:22px 28px;color:#ffffff;font-size:18px;font-weight:700\">" + esc(company) + "</td></tr>"
            + "<tr><td style=\"padding:28px\">"
            + "<h1 style=\"margin:0 0 12px;font-size:20px;color:#0f172a\">" + esc(r.heading()) + "</h1>"
            + "<p style=\"margin:0 0 20px;font-size:14px;line-height:1.6;color:#334155;white-space:pre-line\">" + esc(r.intro()) + "</p>"
            + (rows.length() > 0 ? "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">" + rows + "</table>" : "")
            + (blank(r.closing()) ? "" : "<p style=\"margin:20px 0 0;font-size:14px;line-height:1.6;color:#334155;white-space:pre-line\">" + esc(r.closing()) + "</p>")
            + "</td></tr>"
            + "<tr><td style=\"padding:16px 28px;background:#f8fafc;color:#64748b;font-size:12px\">" + contact + "</td></tr>"
            + "</table></td></tr></table></body></html>";
    }

    static String renderText(CustomerEmailRequest r) {
        StringBuilder sb = new StringBuilder();
        sb.append(nz(r.heading())).append("\n\n").append(nz(r.intro())).append("\n\n");
        if (r.rows() != null) for (List<String> row : r.rows()) if (row != null && row.size() >= 2) sb.append(row.get(0)).append(": ").append(row.get(1)).append('\n');
        if (!blank(r.closing())) sb.append('\n').append(r.closing()).append('\n');
        sb.append("\n").append(nz(r.companyName())).append('\n');
        return sb.toString();
    }

    private static String safeFileName(String name, String type) {
        String ext = type.equals("application/pdf") ? ".pdf" : type.equals("text/html") ? ".html" : ".txt";
        String base = blank(name) ? "document" : name.replaceAll("[^A-Za-z0-9._ -]", "_");
        if (base.length() > 80) base = base.substring(0, 80);
        return base.toLowerCase().endsWith(ext) ? base : base + ext;
    }

    private static boolean blank(String s) { return s == null || s.isBlank(); }
    private static String nz(String s) { return s == null ? "" : s; }
    private static String clip(String s, int n) { return s.length() <= n ? s : s.substring(0, n); }
}
