package com.carrental.backend.ota;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;

import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The language a broker asked for, for the duration of one request. XML brokers ask with the OTA
 * attribute PrimaryLangID="ar" on the message; REST v3 brokers with Accept-Language: ar. Nothing
 * else switches it (a broker's HTTP library sending Accept-Language does not change XML answers).
 *
 * <p>English is the default and the fallback: a text with no Arabic version stays English, so a
 * broker that never asks for Arabic (HOG, AUE) gets exactly what it got before.
 */
public final class ChannelLanguage {

    private static final ThreadLocal<String> LANG = new ThreadLocal<>();
    private static final Pattern PRIMARY = Pattern.compile("PrimaryLangID\\s*=\\s*[\"']([A-Za-z]{2})", Pattern.CASE_INSENSITIVE);

    private ChannelLanguage() {}

    /** "ar" or "en" for this request. */
    static String detect(HttpServletRequest http, String body) {
        String uri = http == null ? "" : String.valueOf(http.getRequestURI());
        if (uri.startsWith("/api/v3/")) {
            String h = http.getHeader("Accept-Language");
            return h != null && h.trim().toLowerCase(Locale.ROOT).startsWith("ar") ? "ar" : "en";
        }
        if (body == null) return "en";
        Matcher m = PRIMARY.matcher(body.length() > 4000 ? body.substring(0, 4000) : body);
        return m.find() && "ar".equalsIgnoreCase(m.group(1)) ? "ar" : "en";
    }

    static void set(String lang) { if ("ar".equals(lang)) LANG.set(lang); else LANG.remove(); }

    static void clear() { LANG.remove(); }

    public static boolean arabic() { return "ar".equals(LANG.get()); }

    /** field, or fieldAr when Arabic was asked for and staff entered one. */
    public static String text(JsonNode node, String field, String fallback) {
        if (arabic()) {
            String ar = node.path(field + "Ar").asText("").trim();
            if (!ar.isEmpty()) return ar;
        }
        String en = node.path(field).asText("");
        return en.isEmpty() ? fallback : en;
    }

    public static String pick(String english, String arabicText) {
        return arabic() && arabicText != null && !arabicText.isBlank() ? arabicText.trim() : english;
    }

    /** The catalogue meaning of an error in Arabic, for brokers that show it to customers. */
    static final Map<ChannelError, String> ERRORS_AR = Map.ofEntries(
        Map.entry(ChannelError.AUTH_FAILED, "بيانات الدخول غير صحيحة أو مفقودة"),
        Map.entry(ChannelError.PERMISSION_DENIED, "لا تتوفر صلاحية لهذا الموقع أو فئة السيارة أو العملية"),
        Map.entry(ChannelError.INVALID_REQUEST, "حقل مطلوب مفقود أو غير صحيح"),
        Map.entry(ChannelError.INVALID_LOCATION, "رمز الموقع غير معروف أو غير فعال"),
        Map.entry(ChannelError.INVALID_DATE, "التاريخ أو الوقت أو مدة الإيجار غير صحيحة"),
        Map.entry(ChannelError.INVALID_VEHICLE_GROUP, "فئة السيارة غير معروفة أو غير متاحة"),
        Map.entry(ChannelError.NO_AVAILABILITY, "لا تتوفر سيارات في هذه التواريخ"),
        Map.entry(ChannelError.OFFER_EXPIRED, "انتهت صلاحية العرض"),
        Map.entry(ChannelError.PRICE_CHANGED, "تغيّر السعر عن العرض"),
        Map.entry(ChannelError.DUPLICATE_REFERENCE, "رقم مرجع الوسيط موجود مسبقاً"),
        Map.entry(ChannelError.RESERVATION_NOT_FOUND, "الحجز غير موجود"),
        Map.entry(ChannelError.MODIFICATION_NOT_ALLOWED, "لم يعد بالإمكان تعديل هذا الحجز"),
        Map.entry(ChannelError.CANCELLATION_NOT_ALLOWED, "لم يعد بالإمكان إلغاء هذا الحجز"),
        Map.entry(ChannelError.PAYMENT_DECLINED, "تم رفض الدفع أو الضمان"),
        Map.entry(ChannelError.POLICY_VIOLATION, "الحجز يخالف أحد شروط الإيجار"),
        Map.entry(ChannelError.RATE_LIMIT_EXCEEDED, "عدد كبير من الطلبات، يرجى المحاولة لاحقاً"),
        Map.entry(ChannelError.SYSTEM_ERROR, "خطأ داخلي، يرجى المحاولة مرة أخرى"));
}
