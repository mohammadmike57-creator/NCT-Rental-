package com.carrental.backend.ota;

import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * OpenTravel code values and formats in one place, so every OTA answer writes them the same way.
 * Day names follow the OTA DOW_PatternGroup attributes (Mon, Tue, Weds, Thur, Fri, Sat, Sun).
 */
final class OtaCodes {

    private OtaCodes() {}

    /** OTA DOW_PatternGroup attribute for a day (MON, Monday, Wed… all accepted). */
    static String dayAttribute(String day) {
        return switch (day.trim().toUpperCase(Locale.ROOT).substring(0, 3)) {
            case "MON" -> "Mon";
            case "TUE" -> "Tue";
            case "WED" -> "Weds";
            case "THU" -> "Thur";
            case "FRI" -> "Fri";
            case "SAT" -> "Sat";
            case "SUN" -> "Sun";
            default -> throw new IllegalArgumentException("Unknown day: " + day);
        };
    }

    /** The day names channels connected before the standard layout were built against (Wed, Thu). */
    static String legacyDayAttribute(String day) {
        return day.charAt(0) + day.substring(1).toLowerCase(Locale.ROOT);
    }

    /** xs:time: "6:00" / "06:00" become "06:00:00"; a full time is kept. */
    static String time(String hhmm) {
        if (hhmm == null || hhmm.isBlank()) return null;
        String[] p = hhmm.trim().split(":");
        int h = Integer.parseInt(p[0]);
        int m = p.length > 1 ? Integer.parseInt(p[1]) : 0;
        int sec = p.length > 2 ? Integer.parseInt(p[2]) : 0;
        return String.format(Locale.ROOT, "%02d:%02d:%02d", h, m, sec);
    }

    // ---- Code values, taken from the OpenTravel Alliance's own sample messages (OTA 2011B samples) ----

    /** Vehicle charge purposes (OTA list VCP) used in the official samples. */
    static final String CHARGE_RENTAL = "1", CHARGE_SURCHARGE = "5", CHARGE_TAX = "7", CHARGE_ADDITIONAL_DISTANCE = "8";

    /** Coverage types (OTA list VCT) for the coverage codes that appear in the official samples. */
    private static final Map<String, String> COVERAGE_TYPES = Map.of(
        "ALI", "1", "CDW", "7", "PDW", "31", "PAI", "32", "PEP", "35", "SLI", "42");

    private static final Pattern OTA_CODE = Pattern.compile("[0-9A-Z]{1,3}(\\.[A-Z]{3}(\\.X)?)?");

    /** True for a value OTA_CodeType accepts (e.g. 7, 101, 101.EQP). */
    static boolean isOtaCode(String value) {
        return value != null && OTA_CODE.matcher(value).matches();
    }

    /**
     * The OTA coverage type for one of our coverage codes: the code the channel's broker gave us, else the official
     * one for the common codes, else null (the cover is then listed in TPA_Extensions until a code is set).
     */
    static String coverageType(String code, Map<String, String> channelCodes) {
        if (code == null) return null;
        String key = code.trim().toUpperCase(Locale.ROOT);
        String own = channelCodes == null ? null : channelCodes.get(key);
        if (isOtaCode(own)) return own;
        return COVERAGE_TYPES.get(key);
    }

    /** OTA StringLength1to64 texts (Description attributes). */
    static String text64(String value) {
        if (value == null || value.isBlank()) return null;
        String v = value.trim();
        return v.length() <= 64 ? v : v.substring(0, 63) + "…";
    }
}
