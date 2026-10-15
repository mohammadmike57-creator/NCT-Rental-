package com.carrental.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.mail.*;
import javax.mail.internet.InternetAddress;
import javax.mail.internet.MimeMessage;
import java.util.Properties;

@Service
public class EmailService {

    private static final Logger logger = LoggerFactory.getLogger(EmailService.class);

    @Value("${mail.smtp.host:smtp.gmail.com}")
    private String smtpHost;

    @Value("${mail.smtp.port:587}")
    private String smtpPort;

    @Value("${mail.smtp.username:}")
    private String smtpUsername;

    @Value("${mail.smtp.password:}")
    private String smtpPassword;

    @Value("${mail.smtp.from:noreply@nctrental.com}")
    private String fromEmail;

    @Value("${mail.smtp.enabled:false}")
    private boolean emailEnabled;

    /**
     * Send email using SMTP
     */
    public void sendEmail(String to, String subject, String body) throws MessagingException {
        if (!emailEnabled) {
            logger.info("Email sending disabled. Would have sent to {}: {}", to, subject);
            return;
        }

        Properties props = new Properties();
        props.put("mail.smtp.auth", "true");
        props.put("mail.smtp.starttls.enable", "true");
        props.put("mail.smtp.host", smtpHost);
        props.put("mail.smtp.port", smtpPort);
        props.put("mail.smtp.ssl.trust", smtpHost);

        Session session = Session.getInstance(props, new Authenticator() {
            @Override
            protected PasswordAuthentication getPasswordAuthentication() {
                return new PasswordAuthentication(smtpUsername, smtpPassword);
            }
        });

        Message message = new MimeMessage(session);
        message.setFrom(new InternetAddress(fromEmail));
        message.setRecipients(Message.RecipientType.TO, InternetAddress.parse(to));
        message.setSubject(subject);
        message.setContent(body, "text/html; charset=utf-8");

        Transport.send(message);
        logger.info("Email sent successfully to {}", to);
    }

    /**
     * Send email with HTML content
     */
    public void sendHtmlEmail(String to, String subject, String htmlBody) throws MessagingException {
        sendEmail(to, subject, htmlBody);
    }

    /**
     * Send email with attachment
     */
    public void sendEmailWithAttachment(String to, String subject, String body, byte[] attachment, String attachmentName) {
        // Implementation for attachments would go here
        logger.info("Email with attachment not yet fully implemented");
    }
}
