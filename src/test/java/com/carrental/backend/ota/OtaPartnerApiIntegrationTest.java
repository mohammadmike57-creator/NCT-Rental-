package com.carrental.backend.ota;

import com.carrental.backend.service.StateService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
    "jwt.secret=test-secret-key-that-is-long-enough-for-hmac-sha256",
    "stripe.secret.key=sk_test_dummy",
    "stripe.price.id=price_dummy",
    "spring.datasource.url=jdbc:h2:mem:ota-it;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class OtaPartnerApiIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired StateService stateService;
    @Autowired ChannelDeliveryLogRepository logs;

    @BeforeEach
    void seed() throws Exception {
        var state = OtaXmlTest.state(PartnerKeyVerifier.sha256Hex("secret-key"));
        stateService.mergeState(new ObjectMapper().writeValueAsString(Map.of(
            "fleet", state.get("fleet"), "stopSales", state.get("stopSales"), "aggregators", state.get("aggregators"))));
    }

    @Test
    void stateDocumentRequiresLogin() throws Exception {
        mvc.perform(get("/api/state")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/state").contentType(MediaType.APPLICATION_JSON).content("{\"aggregators\":[]}"))
            .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/channels/agg-1/deliveries")).andExpect(status().isUnauthorized());
    }

    @Test
    void partnerNeedsValidKey() throws Exception {
        mvc.perform(get("/ota/v1/BKG/ping")).andExpect(status().isUnauthorized())
            .andExpect(content().string(containsString("Invalid or missing feed key")));
        mvc.perform(get("/ota/v1/BKG/ping").header("X-Api-Key", "wrong")).andExpect(status().isUnauthorized());
        mvc.perform(get("/ota/v1/NOPE/ping").header("X-Api-Key", "secret-key")).andExpect(status().isUnauthorized());
        mvc.perform(get("/ota/v1/bkg/ping").header("Authorization", "Bearer secret-key"))
            .andExpect(status().isOk()).andExpect(content().string(containsString("<Success/>")));
    }

    @Test
    void partnerGetsAvailabilityAndRateSheet() throws Exception {
        String y = OtaXmlTest.NEXT_YEAR;
        String rq = """
            <OTA_VehAvailRateRQ xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="T1">
              <VehAvailRQCore><VehRentalCore PickUpDateTime="%s-05-01T10:00:00" ReturnDateTime="%s-05-06T10:00:00">
                <PickUpLocation LocationCode="AMM"/></VehRentalCore></VehAvailRQCore>
              <SpecialEquipPrefs><SpecialEquipPref EquipType="13"/></SpecialEquipPrefs>
            </OTA_VehAvailRateRQ>""".formatted(y, y);
        mvc.perform(post("/ota/v1/BKG/OTA_VehAvailRate").header("X-Api-Key", "secret-key")
                .contentType(MediaType.APPLICATION_XML).content(rq))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_XML))
            .andExpect(content().string(containsString("EchoToken=\"T1\"")))
            .andExpect(content().string(containsString("EstimatedTotalAmount=\"225.00\"")));

        mvc.perform(get("/ota/v1/BKG/ratesheet").header("X-Api-Key", "secret-key"))
            .andExpect(status().isOk()).andExpect(content().string(containsString("<RateSheet")));

        mvc.perform(post("/ota/v1/BKG/OTA_VehAvailRate").header("X-Api-Key", "secret-key")
                .contentType(MediaType.APPLICATION_XML).content("<not-xml"))
            .andExpect(status().isBadRequest()).andExpect(content().string(containsString("<Errors>")));

        org.junit.jupiter.api.Assertions.assertFalse(logs.findAll().isEmpty(), "inbound requests are logged");
    }
}
