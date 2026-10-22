package com.carrental.backend.notify;

import java.util.List;

/**
 * A branded email to a customer, composed on the server from structured parts
 * (so staff cannot inject arbitrary markup) plus optional attachments.
 */
public record CustomerEmailRequest(
        String to,
        String subject,
        String heading,
        String intro,
        List<List<String>> rows,      // [label, value] pairs shown as a summary table
        String closing,
        String companyName,
        String companyAddress,
        String companyPhone,
        String companyEmail,
        String replyTo,
        List<Attachment> attachments,
        String badge,                 // short status pill under the heading, e.g. "PAID"
        String tone,                  // success | warning | info (badge and highlight colour)
        String highlightLabel,        // optional large figure, e.g. "Amount due"
        String highlightValue,
        String companyWebsite,
        String supportEmail,          // "Customer support" box; also the reply-to address when settings name none
        String supportPhone,
        String supportHours
) {
    public record Attachment(String fileName, String contentType, String base64) {}
}
