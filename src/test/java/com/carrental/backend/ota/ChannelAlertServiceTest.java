package com.carrental.backend.ota;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ChannelAlertServiceTest {

    private static ChannelSnapshot channel(String json) throws Exception {
        return new ChannelSnapshot(new ObjectMapper().readTree(json), null, null, "UR-Drive Jordan");
    }

    @Test
    void recipientsComeFromTheChannelElseTheServerAddress() throws Exception {
        ChannelAlertService svc = new ChannelAlertService(null, null, null, null, "ops@example.com");
        assertThat(svc.recipients(channel("{\"id\":\"a\",\"name\":\"Hogicar\",\"alertEmails\":\"sara@example.com; omar@example.com, bad\"}")))
            .containsExactly("sara@example.com", "omar@example.com");
        assertThat(svc.recipients(channel("{\"id\":\"a\",\"name\":\"Hogicar\"}"))).containsExactly("ops@example.com");
    }

    @Test
    void theEmailSaysWhatIsWrongAndWhereToLook() throws Exception {
        String body = ChannelAlertService.body(channel("{\"id\":\"a\",\"name\":\"Hogicar\"}"),
            List.of(new ChannelAlertService.Alert("silent", "The broker stopped searching", "Hogicar sent no searches in the last 6 hours.")), false);
        assertThat(body).contains("The broker stopped searching").contains("OTA XML → Technical → Alerts").contains("6 hours").doesNotContain("NCT");
    }
}
