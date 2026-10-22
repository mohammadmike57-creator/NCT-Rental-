package com.carrental.backend.notify;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private final MailSettingsService settings;

    public CustomerEmailService(MailSettingsService settings) { this.settings = settings; }

    public static class EmailException extends RuntimeException {
        private final int status;
        public EmailException(int status, String message) { super(message); this.status = status; }
        public int status() { return status; }
    }

    public boolean isConfigured() {
        return settings.effective().usable();
    }

    public void send(CustomerEmailRequest req) {
        String to = req.to() == null ? "" : req.to().trim();
        if (!EMAIL.matcher(to).matches()) throw new EmailException(400, "The customer email address is not valid.");
        if (blank(req.subject())) throw new EmailException(400, "Subject is required.");
        MailSettingsService.MailConfig cfg = settings.effective();
        if (!cfg.usable()) throw new EmailException(503, "Outgoing email is not set up yet. An administrator can set it up in Settings → Email.");

        try {
            Session session = Session.getInstance(smtpProps(cfg), new Authenticator() {
                @Override protected PasswordAuthentication getPasswordAuthentication() {
                    return new PasswordAuthentication(cfg.username(), cfg.password());
                }
            });
            MimeMessage msg = new MimeMessage(session);
            msg.setFrom(new InternetAddress(cfg.from(), blank(req.companyName()) ? cfg.fromName() : req.companyName(), "UTF-8"));
            msg.setRecipients(Message.RecipientType.TO, InternetAddress.parse(to, true));
            // Send-only by default: replies go somewhere only if an administrator set a reply-to address.
            boolean sendOnly = blank(cfg.replyTo()) || !EMAIL.matcher(cfg.replyTo().trim()).matches();
            if (!sendOnly) msg.setReplyTo(InternetAddress.parse(cfg.replyTo().trim(), true));
            msg.setSubject(clip(req.subject(), 200), "UTF-8");

            MimeMultipart mixed = new MimeMultipart("mixed");
            MimeMultipart alternative = new MimeMultipart("alternative");
            MimeBodyPart text = new MimeBodyPart();
            text.setText(renderText(req, sendOnly), "UTF-8");
            MimeBodyPart html = new MimeBodyPart();
            html.setContent(renderHtml(req, sendOnly), "text/html; charset=UTF-8");
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

    private static Properties smtpProps(MailSettingsService.MailConfig cfg) {
        Properties p = new Properties();
        p.put("mail.smtp.auth", "true");
        p.put("mail.smtp.host", cfg.host());
        p.put("mail.smtp.port", String.valueOf(cfg.port()));
        p.put("mail.smtp.connectiontimeout", "15000");
        p.put("mail.smtp.timeout", "20000");
        if ("SSL".equals(cfg.security())) p.put("mail.smtp.ssl.enable", "true");
        else p.put("mail.smtp.starttls.enable", "true");
        return p;
    }

    // ---------------------------------------------------------------- rendering

    static String esc(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;");
    }

    static String renderHtml(CustomerEmailRequest r) { return renderHtml(r, false); }

    static String renderHtml(CustomerEmailRequest r, boolean sendOnly) {
        String[] tone = switch (blank(r.tone()) ? "info" : r.tone()) {
            case "success" -> new String[]{"#047857", "#ecfdf5", "#a7f3d0"};
            case "warning" -> new String[]{"#b45309", "#fffbeb", "#fde68a"};
            default -> new String[]{"#3730a3", "#eef2ff", "#c7d2fe"};
        };
        StringBuilder rows = new StringBuilder();
        if (r.rows() != null) {
            for (List<String> row : r.rows()) {
                if (row == null || row.size() < 2) continue;
                rows.append("<tr><td style=\"padding:9px 12px 9px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;vertical-align:top\">")
                    .append(esc(row.get(0)))
                    .append("</td><td style=\"padding:9px 0;color:#0f172a;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #f1f5f9\">")
                    .append(esc(row.get(1))).append("</td></tr>");
            }
        }
        StringBuilder files = new StringBuilder();
        if (r.attachments() != null) {
            for (CustomerEmailRequest.Attachment a : r.attachments()) {
                if (a == null || blank(a.fileName())) continue;
                boolean pdf = "application/pdf".equals(a.contentType());
                files.append("<tr><td style=\"padding:6px 0\"><span style=\"display:inline-block;width:30px;height:30px;line-height:30px;text-align:center;border-radius:8px;font-size:9px;font-weight:800;color:#ffffff;background:")
                    .append(pdf ? "#e11d48" : "#475569").append("\">").append(pdf ? "PDF" : "DOC").append("</span>")
                    .append("<span style=\"padding-left:10px;font-size:13px;color:#0f172a;font-weight:600\">").append(esc(a.fileName())).append("</span></td></tr>");
            }
        }
        String company = blank(r.companyName()) ? "NCT Rental" : r.companyName();
        String contact = String.join(" &middot; ", java.util.stream.Stream.of(r.companyAddress(), r.companyPhone(), r.companyEmail())
            .filter(x -> !blank(x)).map(CustomerEmailService::esc).toList());
        return "<!DOCTYPE html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head>"
            + "<body style=\"margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Helvetica,Arial,sans-serif\">"
            + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#f1f5f9;padding:28px 12px\"><tr><td align=\"center\">"
            + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:580px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.08)\">"
            + "<tr><td style=\"background:#0f172a;padding:22px 30px\"><div style=\"color:#ffffff;font-size:19px;font-weight:700;letter-spacing:-.01em\">" + esc(company) + "</div>"
            + "<div style=\"color:#94a3b8;font-size:12px;margin-top:2px\">Car Rental Services</div></td></tr>"
            + "<tr><td style=\"padding:30px\">"
            + (blank(r.badge()) ? "" : "<span style=\"display:inline-block;margin-bottom:12px;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.08em;color:" + tone[0] + ";background:" + tone[1] + ";border:1px solid " + tone[2] + "\">" + esc(r.badge()) + "</span>")
            + "<h1 style=\"margin:0 0 12px;font-size:22px;line-height:1.3;color:#0f172a\">" + esc(r.heading()) + "</h1>"
            + "<p style=\"margin:0 0 22px;font-size:14px;line-height:1.65;color:#334155;white-space:pre-line\">" + esc(r.intro()) + "</p>"
            + (blank(r.highlightValue()) ? "" : "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:0 0 22px;background:" + tone[1] + ";border:1px solid " + tone[2] + ";border-radius:12px\"><tr>"
                + "<td style=\"padding:16px 18px;font-size:13px;color:" + tone[0] + ";font-weight:600\">" + esc(nz(r.highlightLabel())) + "</td>"
                + "<td style=\"padding:16px 18px;text-align:right;font-size:22px;font-weight:800;color:#0f172a\">" + esc(r.highlightValue()) + "</td></tr></table>")
            + (rows.length() > 0 ? "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">" + rows + "</table>" : "")
            + (files.length() > 0 ? "<div style=\"margin-top:22px;padding:14px 16px;border:1px solid #e2e8f0;border-radius:12px\"><div style=\"font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:4px\">Attached</div>"
                + "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\">" + files + "</table></div>" : "")
            + (blank(r.closing()) ? "" : "<p style=\"margin:22px 0 0;font-size:14px;line-height:1.65;color:#334155;white-space:pre-line\">" + esc(r.closing()) + "</p>")
            + "<p style=\"margin:22px 0 0;font-size:14px;color:#334155\">Kind regards,<br><strong>" + esc(company) + "</strong></p>"
            + "</td></tr>"
            + "<tr><td style=\"padding:16px 30px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5\">" + contact
            + (sendOnly ? "<div style=\"margin-top:6px;color:#94a3b8\">This is an automated message and replies to this address are not monitored." + (blank(r.companyPhone()) ? "" : " For assistance, please call " + esc(r.companyPhone()) + ".") + "</div>" : "")
            + "</td></tr>"
            + "</table></td></tr></table></body></html>";
    }

    static String renderText(CustomerEmailRequest r) { return renderText(r, false); }

    static String renderText(CustomerEmailRequest r, boolean sendOnly) {
        StringBuilder sb = new StringBuilder();
        sb.append(nz(r.heading())).append("\n\n").append(nz(r.intro())).append("\n\n");
        if (!blank(r.highlightValue())) sb.append(nz(r.highlightLabel())).append(": ").append(r.highlightValue()).append("\n\n");
        if (r.rows() != null) for (List<String> row : r.rows()) if (row != null && row.size() >= 2) sb.append(row.get(0)).append(": ").append(row.get(1)).append('\n');
        if (!blank(r.closing())) sb.append('\n').append(r.closing()).append('\n');
        sb.append("\n").append(nz(r.companyName())).append('\n');
        if (sendOnly) sb.append("\nThis is an automated message and replies to this address are not monitored.").append(blank(r.companyPhone()) ? "" : " For assistance, please call " + r.companyPhone() + ".").append('\n');
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
