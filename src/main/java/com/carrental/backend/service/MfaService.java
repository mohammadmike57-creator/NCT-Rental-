package com.carrental.backend.service;

import com.carrental.backend.model.MfaSettings;
import com.carrental.backend.model.User;
import com.carrental.backend.repository.MfaSettingsRepository;
import org.apache.commons.codec.binary.Base32;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class MfaService {

    @Autowired
    private MfaSettingsRepository mfaSettingsRepository;

    private static final int TIME_STEP_SECONDS = 30;
    private static final int DIGITS = 6;
    private static final int BACKUP_CODES_COUNT = 10;

    /**
     * Generate a new MFA secret key for TOTP
     */
    public String generateSecretKey() {
        SecureRandom random = new SecureRandom();
        byte[] bytes = new byte[20];
        random.nextBytes(bytes);
        Base32 base32 = new Base32();
        return base32.encodeToString(bytes);
    }

    /**
     * Generate QR code URL for Google Authenticator
     */
    public String generateQrCodeUrl(String userEmail, String secretKey, String issuer) {
        String format = "otpauth://totp/%s:%s?secret=%s&issuer=%s";
        return String.format(format, issuer, userEmail, secretKey, issuer);
    }

    /**
     * Verify TOTP code
     */
    public boolean verifyTotpCode(String secretKey, String code) {
        try {
            long currentTime = Instant.now().getEpochSecond() / TIME_STEP_SECONDS;

            // Check current time window and adjacent windows (±1) for clock skew tolerance
            for (int i = -1; i <= 1; i++) {
                String expectedCode = generateTotpCode(secretKey, currentTime + i);
                if (expectedCode.equals(code)) {
                    return true;
                }
            }
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Generate TOTP code for a specific time counter
     */
    private String generateTotpCode(String secretKey, long timeCounter)
            throws NoSuchAlgorithmException, InvalidKeyException {

        Base32 base32 = new Base32();
        byte[] decodedKey = base32.decode(secretKey);

        // Get the time-based counter value
        ByteBuffer buffer = ByteBuffer.allocate(8);
        buffer.putLong(timeCounter);
        byte[] timeBytes = buffer.array();

        // HMAC-SHA1
        Mac mac = Mac.getInstance("HmacSHA1");
        SecretKeySpec keySpec = new SecretKeySpec(decodedKey, "HmacSHA1");
        mac.init(keySpec);
        byte[] hash = mac.doFinal(timeBytes);

        // Dynamic truncation
        int offset = hash[hash.length - 1] & 0x0F;
        int binary = ((hash[offset] & 0x7F) << 24) |
                     ((hash[offset + 1] & 0xFF) << 16) |
                     ((hash[offset + 2] & 0xFF) << 8) |
                     (hash[offset + 3] & 0xFF);

        int otp = binary % (int) Math.pow(10, DIGITS);
        return String.format("%0" + DIGITS + "d", otp);
    }

    /**
     * Generate backup codes
     */
    public List<String> generateBackupCodes() {
        List<String> codes = new ArrayList<>();
        SecureRandom random = new SecureRandom();

        for (int i = 0; i < BACKUP_CODES_COUNT; i++) {
            // Generate 8-character alphanumeric code
            String code = String.format("%08d", random.nextInt(100000000));
            codes.add(code);
        }

        return codes;
    }

    /**
     * Enable MFA for user
     */
    public MfaSettings enableMfa(User user, MfaSettings.MfaType type) {
        MfaSettings settings = mfaSettingsRepository.findByUser(user)
            .orElse(new MfaSettings());

        settings.setUser(user);
        settings.setMfaEnabled(true);
        settings.setMfaType(type);

        if (type == MfaSettings.MfaType.TOTP) {
            settings.setSecretKey(generateSecretKey());
        }

        // Generate backup codes
        List<String> backupCodes = generateBackupCodes();
        settings.setBackupCodes(String.join(",", backupCodes));

        return mfaSettingsRepository.save(settings);
    }

    /**
     * Disable MFA for user
     */
    public void disableMfa(User user) {
        mfaSettingsRepository.findByUser(user).ifPresent(settings -> {
            settings.setMfaEnabled(false);
            mfaSettingsRepository.save(settings);
        });
    }

    /**
     * Verify backup code
     */
    public boolean verifyBackupCode(User user, String code) {
        return mfaSettingsRepository.findByUser(user)
            .map(settings -> {
                String[] codes = settings.getBackupCodes().split(",");
                List<String> codeList = new ArrayList<>(List.of(codes));

                if (codeList.remove(code)) {
                    // Remove used backup code
                    settings.setBackupCodes(String.join(",", codeList));
                    mfaSettingsRepository.save(settings);
                    return true;
                }
                return false;
            })
            .orElse(false);
    }

    /**
     * Get MFA settings for user
     */
    public MfaSettings getMfaSettings(User user) {
        return mfaSettingsRepository.findByUser(user).orElse(null);
    }

    /**
     * Check if MFA is enabled for user
     */
    public boolean isMfaEnabled(User user) {
        return mfaSettingsRepository.findByUser(user)
            .map(MfaSettings::isMfaEnabled)
            .orElse(false);
    }
}
