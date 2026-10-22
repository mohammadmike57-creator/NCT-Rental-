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
            // Replies go to the reply-to address from email settings, else to the company's support email;
            // with neither, the email is send-only and says so.
            String replyTo = validEmail(cfg.replyTo()) ? cfg.replyTo().trim() : validEmail(req.supportEmail()) ? req.supportEmail().trim() : null;
            boolean sendOnly = replyTo == null;
            if (!sendOnly) msg.setReplyTo(InternetAddress.parse(replyTo, true));
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

    private static final String FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

    static String renderHtml(CustomerEmailRequest r, boolean sendOnly) {
        String[] tone = switch (blank(r.tone()) ? "info" : r.tone()) {
            case "success" -> new String[]{"#047857", "#ecfdf5", "#a7f3d0"};
            case "warning" -> new String[]{"#b45309", "#fffbeb", "#fde68a"};
            default -> new String[]{"#1e3a8a", "#eff6ff", "#bfdbfe"};
        };
        String company = blank(r.companyName()) ? "NCT Rental" : r.companyName();

        StringBuilder rows = new StringBuilder();
        if (r.rows() != null) {
            for (List<String> row : r.rows()) {
                if (row == null || row.size() < 2) continue;
                rows.append("<tr><td style=\"padding:10px 16px 10px 0;color:#6b7280;font-size:13px;border-top:1px solid #f0f1f3;vertical-align:top;width:42%\">")
                    .append(esc(row.get(0)))
                    .append("</td><td style=\"padding:10px 0;color:#111827;font-size:13px;font-weight:600;text-align:right;border-top:1px solid #f0f1f3\">")
                    .append(esc(row.get(1))).append("</td></tr>");
            }
        }
        StringBuilder files = new StringBuilder();
        if (r.attachments() != null) {
            for (CustomerEmailRequest.Attachment a : r.attachments()) {
                if (a == null || blank(a.fileName())) continue;
                boolean pdf = "application/pdf".equals(a.contentType());
                files.append("<tr><td style=\"padding:5px 0\"><span style=\"display:inline-block;width:32px;height:22px;line-height:22px;text-align:center;border-radius:4px;font-size:9px;font-weight:800;color:#ffffff;background:")
                    .append(pdf ? "#dc2626" : "#4b5563").append("\">").append(pdf ? "PDF" : "DOC").append("</span>")
                    .append("<span style=\"padding-left:10px;font-size:13px;color:#111827\">").append(esc(a.fileName())).append("</span></td></tr>");
            }
        }

        String phone = blank(r.supportPhone()) ? nz(r.companyPhone()) : r.supportPhone();
        String mail = blank(r.supportEmail()) ? nz(r.companyEmail()) : r.supportEmail();
        StringBuilder support = new StringBuilder();
        if (!blank(phone)) support.append(supportRow("Phone", "<a href=\"tel:" + esc(phone.replaceAll("[^0-9+]", "")) + "\" style=\"color:#1e3a8a;text-decoration:none;font-weight:600\">" + esc(phone) + "</a>"));
        if (!blank(mail)) support.append(supportRow("Email", "<a href=\"mailto:" + esc(mail) + "\" style=\"color:#1e3a8a;text-decoration:none;font-weight:600\">" + esc(mail) + "</a>"));
        if (!blank(r.supportHours())) support.append(supportRow("Hours", esc(r.supportHours())));

        String website = nz(r.companyWebsite()).trim();
        String websiteHref = website.isEmpty() ? "" : (website.matches("(?i)^https?://.*") ? website : "https://" + website);
        String footerLine = String.join(" &nbsp;|&nbsp; ", java.util.stream.Stream.of(r.companyAddress(), r.companyPhone(), r.companyEmail())
            .filter(x -> !blank(x)).map(CustomerEmailService::esc).toList());
        int year = java.time.Year.now().getValue();

        return "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" + esc(r.subject()) + "</title></head>"
            + "<body style=\"margin:0;padding:0;background:#f3f4f6;font-family:" + FONT + ";-webkit-font-smoothing:antialiased\">"
            + (blank(r.heading()) ? "" : "<div style=\"display:none;max-height:0;overflow:hidden;opacity:0\">" + esc(r.heading()) + "</div>")
            + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#f3f4f6;padding:32px 12px\"><tr><td align=\"center\">"
            + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:600px\">"

            // Brand header
            + "<tr><td style=\"background:#0b1f3a;border-radius:8px 8px 0 0;padding:24px 32px;border-bottom:3px solid #f59e0b\">"
            + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\"><tr>"
            + "<td style=\"color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-.01em\">" + esc(company)
            + "<div style=\"color:#9fb0c8;font-size:12px;font-weight:400;letter-spacing:.04em;margin-top:3px\">Car Rental Services</div></td>"
            + (blank(r.badge()) ? "" : "<td align=\"right\" style=\"vertical-align:middle\"><span style=\"display:inline-block;padding:5px 10px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:.1em;color:#0b1f3a;background:#f8fafc\">" + esc(r.badge()) + "</span></td>")
            + "</tr></table></td></tr>"

            // Body
            + "<tr><td style=\"background:#ffffff;padding:36px 32px 8px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb\">"
            + "<h1 style=\"margin:0 0 18px;font-size:22px;line-height:1.3;font-weight:700;color:#111827\">" + esc(r.heading()) + "</h1>"
            + "<p style=\"margin:0 0 24px;font-size:15px;line-height:1.7;color:#374151;white-space:pre-line\">" + esc(r.intro()) + "</p>"
            + (blank(r.highlightValue()) ? "" : "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:0 0 26px;background:" + tone[1] + ";border:1px solid " + tone[2] + ";border-left:4px solid " + tone[0] + ";border-radius:6px\"><tr>"
                + "<td style=\"padding:16px 18px;font-size:13px;color:" + tone[0] + ";font-weight:600;text-transform:uppercase;letter-spacing:.05em\">" + esc(nz(r.highlightLabel())) + "</td>"
                + "<td style=\"padding:16px 18px;text-align:right;font-size:24px;font-weight:700;color:#111827;white-space:nowrap\">" + esc(r.highlightValue()) + "</td></tr></table>")
            + (rows.length() > 0 ? "<div style=\"font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6b7280;margin:0 0 6px\">Summary</div>"
                + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-bottom:1px solid #f0f1f3\">" + rows + "</table>" : "")
            + (files.length() > 0 ? "<div style=\"margin-top:26px;padding:14px 18px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px\"><div style=\"font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6b7280;margin-bottom:6px\">Attachments</div>"
                + "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\">" + files + "</table></div>" : "")
            + (blank(r.closing()) ? "" : "<p style=\"margin:26px 0 0;font-size:15px;line-height:1.7;color:#374151;white-space:pre-line\">" + esc(r.closing()) + "</p>")
            + "<p style=\"margin:26px 0 0;font-size:15px;line-height:1.6;color:#374151\">Kind regards,<br><span style=\"color:#111827;font-weight:600\">Customer Service Team</span><br>" + esc(company) + "</p>"
            + "</td></tr>"

            // Customer support
            + (support.length() == 0 ? "" : "<tr><td style=\"background:#ffffff;padding:24px 32px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb\">"
                + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px\"><tr><td style=\"padding:18px 20px\">"
                + "<div style=\"font-size:15px;font-weight:700;color:#111827\">Need assistance?</div>"
                + "<div style=\"font-size:13px;line-height:1.6;color:#4b5563;margin:4px 0 10px\">Our customer support team is here to help. Please have your booking reference ready when you contact us.</div>"
                + "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\">" + support + "</table>"
                + "</td></tr></table></td></tr>")

            // Footer
            + "<tr><td style=\"background:#f9fafb;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;padding:22px 32px;color:#6b7280;font-size:12px;line-height:1.6\">"
            + "<div style=\"color:#111827;font-weight:600\">" + esc(company) + "</div>"
            + (footerLine.isEmpty() ? "" : "<div>" + footerLine + "</div>")
            + (websiteHref.isEmpty() ? "" : "<div><a href=\"" + esc(websiteHref) + "\" style=\"color:#1e3a8a;text-decoration:none\">" + esc(website.replaceFirst("(?i)^https?://", "")) + "</a></div>")
            + "<div style=\"margin-top:12px;color:#9ca3af\">"
            + (sendOnly
                ? "This is an automated message sent from an unmonitored mailbox. Please do not reply to this email" + (support.length() > 0 ? "; contact our customer support team using the details above." : ".")
                : "You can reply directly to this email to reach our customer support team.")
            + " This message relates to your rental with " + esc(company) + " and may contain confidential information intended only for the named recipient.</div>"
            + "<div style=\"margin-top:8px;color:#9ca3af\">&copy; " + year + " " + esc(company) + ". All rights reserved.</div>"
            + "</td></tr>"
            + "</table></td></tr></table></body></html>";
    }

    private static String supportRow(String label, String value) {
        return "<tr><td style=\"padding:3px 16px 3px 0;font-size:13px;color:#6b7280;width:56px\">" + label + "</td><td style=\"padding:3px 0;font-size:13px;color:#111827\">" + value + "</td></tr>";
    }

    static String renderText(CustomerEmailRequest r) { return renderText(r, false); }

    static String renderText(CustomerEmailRequest r, boolean sendOnly) {
        String company = blank(r.companyName()) ? "NCT Rental" : r.companyName();
        String phone = blank(r.supportPhone()) ? nz(r.companyPhone()) : r.supportPhone();
        String mail = blank(r.supportEmail()) ? nz(r.companyEmail()) : r.supportEmail();
        StringBuilder sb = new StringBuilder();
        sb.append(nz(r.heading())).append("\n\n").append(nz(r.intro())).append("\n\n");
        if (!blank(r.highlightValue())) sb.append(nz(r.highlightLabel())).append(": ").append(r.highlightValue()).append("\n\n");
        if (r.rows() != null && !r.rows().isEmpty()) {
            sb.append("SUMMARY\n");
            for (List<String> row : r.rows()) if (row != null && row.size() >= 2) sb.append(row.get(0)).append(": ").append(row.get(1)).append('\n');
        }
        if (r.attachments() != null && r.attachments().stream().anyMatch(a -> a != null && !blank(a.fileName()))) {
            sb.append("\nATTACHMENTS\n");
            r.attachments().stream().filter(a -> a != null && !blank(a.fileName())).forEach(a -> sb.append("- ").append(a.fileName()).append('\n'));
        }
        if (!blank(r.closing())) sb.append('\n').append(r.closing()).append('\n');
        sb.append("\nKind regards,\nCustomer Service Team\n").append(company).append('\n');
        if (!blank(phone) || !blank(mail) || !blank(r.supportHours())) {
            sb.append("\nNEED ASSISTANCE?\nOur customer support team is here to help. Please have your booking reference ready when you contact us.\n");
            if (!blank(phone)) sb.append("Phone: ").append(phone).append('\n');
            if (!blank(mail)) sb.append("Email: ").append(mail).append('\n');
            if (!blank(r.supportHours())) sb.append("Hours: ").append(r.supportHours()).append('\n');
        }
        sb.append("\n--\n").append(company).append('\n');
        if (!blank(r.companyAddress())) sb.append(r.companyAddress()).append('\n');
        if (!blank(r.companyWebsite())) sb.append(r.companyWebsite()).append('\n');
        sb.append('\n').append(sendOnly
            ? "This is an automated message sent from an unmonitored mailbox. Please do not reply to this email."
            : "You can reply directly to this email to reach our customer support team.").append('\n');
        return sb.toString();
    }

    private static String safeFileName(String name, String type) {
        String ext = type.equals("application/pdf") ? ".pdf" : type.equals("text/html") ? ".html" : ".txt";
        String base = blank(name) ? "document" : name.replaceAll("[^A-Za-z0-9._ -]", "_");
        if (base.length() > 80) base = base.substring(0, 80);
        return base.toLowerCase().endsWith(ext) ? base : base + ext;
    }

    private static boolean validEmail(String s) { return !blank(s) && EMAIL.matcher(s.trim()).matches(); }
    private static boolean blank(String s) { return s == null || s.isBlank(); }
    private static String nz(String s) { return s == null ? "" : s; }
    private static String clip(String s, int n) { return s.length() <= n ? s : s.substring(0, n); }
}
