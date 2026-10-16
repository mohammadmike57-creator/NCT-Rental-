package com.carrental.backend.ota;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.w3c.dom.Document;
import org.xml.sax.InputSource;

import java.io.StringReader;
import java.net.InetAddress;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class OtaXmlTest {

    static final ObjectMapper M = new ObjectMapper();
    static final String NEXT_YEAR = String.valueOf(LocalDate.now().getYear() + 1);

    /** State shaped exactly like the frontend writes it (toDay null = open-ended). */
    static JsonNode state(String feedKeyHash) throws Exception {
        String y = NEXT_YEAR;
        return M.readTree("""
            {"fleet":[
               {"id":"v1","modelName":"Toyota Corolla","category":"Standard","sippCode":"SDAR","transmission":"Automatic"},
               {"id":"v2","modelName":"Kia Sportage","category":"SUV","sippCode":"IFAR","transmission":"Automatic"}],
             "stopSales":[{"id":"s","type":"category","target":"SUV","startDate":"%s-03-02","endDate":"%s-03-03","reason":"Maintenance"}],
             "aggregators":[{
               "id":"agg-1","name":"Booking & Co <Test>","channelCode":"BKG","vendorCode":"NCT","locationCode":"AMM",
               "currency":"USD","status":"active","feedKeyHash":"%s",
               "connectionDetails":{"apiUrl":"https://xml.partner.example/ota","username":"nct","apiKey":"k","environment":"production"},
               "termsAndConditions":"Terms with ]]> and <b>tags</b> & more",
               "extras":[{"id":"gps","name":"GPS \\"Nav\\"","price":10,"otaEquipType":"13","maxPerRental":25}],
               "currentRatePlans":[],
               "ratePlanHistory":[{"id":"sub1","submittedAt":"2026-01-01T00:00:00Z","version":4,"ratePlans":[
                 {"id":"low","name":"Low","startDate":"%s-01-01","endDate":"%s-12-31","sippRates":[
                   {"id":"r1","sippCode":"SDAR","tiers":[{"id":"t1","fromDay":1,"toDay":3,"dailyPrice":50},{"id":"t2","fromDay":4,"toDay":null,"dailyPrice":40}]},
                   {"id":"r2","sippCode":"IFAR","tiers":[{"id":"t3","fromDay":1,"toDay":null,"dailyPrice":70}]}]}]}]
             }]}
            """.formatted(y, y, feedKeyHash, y, y));
    }

    static ChannelSnapshot channel() throws Exception {
        JsonNode s = state(PartnerKeyVerifier.sha256Hex("secret-key"));
        return new ChannelSnapshot(s.get("aggregators").get(0), s.get("fleet"), s.get("stopSales"));
    }

    static Document parse(String xml) throws Exception {
        return OtaRequestParser.secureBuilder().parse(new InputSource(new StringReader(xml)));
    }

    static LocalDateTime at(String date) { return LocalDateTime.parse(NEXT_YEAR + "-" + date); }

    @Test
    void rentalDaysCountsStartedDays() {
        assertEquals(3, OtaXml.rentalDays(at("03-01T10:00"), at("03-04T10:00")));
        assertEquals(4, OtaXml.rentalDays(at("03-01T10:00"), at("03-04T10:01")));
        assertEquals(1, OtaXml.rentalDays(at("03-01T10:00"), at("03-01T09:00")));
    }

    @Test
    void quoteUsesPublishedTiersAndCapsExtras() throws Exception {
        List<OtaXml.QuoteLine> q = OtaXml.quote(channel(), new OtaXml.QuoteRequest(at("05-01T10:00"), at("05-06T10:00"), List.of("13")));
        OtaXml.QuoteLine sdar = q.stream().filter(l -> l.sippCode().equals("SDAR")).findFirst().orElseThrow();
        assertEquals(5, sdar.days());
        assertEquals("40.00", sdar.dailyRate().toPlainString());
        assertEquals("200.00", sdar.baseTotal().toPlainString());
        assertEquals("225.00", sdar.total().toPlainString()); // GPS 5 x 10 capped at 25
        assertEquals("Available", sdar.status());
    }

    @Test
    void stopSaleClosesCategory() throws Exception {
        List<OtaXml.QuoteLine> q = OtaXml.quote(channel(), new OtaXml.QuoteRequest(at("03-01T10:00"), at("03-04T10:00"), List.of()));
        assertEquals("Closed", q.stream().filter(l -> l.sippCode().equals("IFAR")).findFirst().orElseThrow().status());
        assertEquals("Available", q.stream().filter(l -> l.sippCode().equals("SDAR")).findFirst().orElseThrow().status());
    }

    @Test
    void generatesWellFormedEscapedXml() throws Exception {
        ChannelSnapshot ch = channel();
        String rs = OtaXml.vehAvailRateRS(ch, new OtaXml.QuoteRequest(at("05-01T10:00"), at("05-04T10:00"), List.of("13")), "E1");
        String sheet = OtaXml.rateSheet(ch);
        Document a = parse(rs);
        Document b = parse(sheet);
        assertEquals("OTA_VehAvailRateRS", a.getDocumentElement().getLocalName());
        assertEquals(OtaXml.OTA_NAMESPACE, a.getDocumentElement().getNamespaceURI());
        assertTrue(rs.contains("Code=\"SDAR\" CodeContext=\"SIPP\""));
        assertTrue(rs.contains("<Description>GPS &quot;Nav&quot;</Description>"));
        assertTrue(sheet.contains("Version=\"4\""));
        assertTrue(sheet.contains("<Rate MinDays=\"4\" OpenEnded=\"true\" DailyAmount=\"40.00\"/>"));
        assertEquals("Terms with ]]> and <b>tags</b> & more", b.getElementsByTagNameNS("*", "Terms").item(0).getTextContent());
    }

    @Test
    void parsesOtaRequestAndRejectsXxe() {
        String rq = """
            <OTA_VehAvailRateRQ xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="abc">
              <VehAvailRQCore>
                <VehRentalCore PickUpDateTime="%s-05-01T10:00:00" ReturnDateTime="%s-05-04T10:00:00Z">
                  <PickUpLocation LocationCode="AMM"/>
                </VehRentalCore>
              </VehAvailRQCore>
              <SpecialEquipPrefs><SpecialEquipPref EquipType="13" Quantity="1"/></SpecialEquipPrefs>
            </OTA_VehAvailRateRQ>""".formatted(NEXT_YEAR, NEXT_YEAR);
        OtaRequestParser.ParsedRequest p = OtaRequestParser.parse(rq);
        assertEquals("abc", p.echoToken());
        assertEquals("AMM", p.locationCode());
        assertEquals(List.of("13"), p.quote().equipCodes());

        String xxe = """
            <?xml version="1.0"?>
            <!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]>
            <OTA_VehAvailRateRQ><VehRentalCore PickUpDateTime="&x;" ReturnDateTime="x"/></OTA_VehAvailRateRQ>""";
        assertThrows(OtaRequestParser.InvalidRequestException.class, () -> OtaRequestParser.parse(xxe));
        assertThrows(OtaRequestParser.InvalidRequestException.class, () -> OtaRequestParser.parse("<Other/>"));
    }

    @Test
    void feedKeyIsCheckedAgainstHash() throws Exception {
        ChannelSnapshot ch = channel();
        assertTrue(PartnerKeyVerifier.matches(ch, "secret-key"));
        assertFalse(PartnerKeyVerifier.matches(ch, "wrong"));
        assertFalse(PartnerKeyVerifier.matches(ch, null));
        JsonNode noKey = state("");
        assertFalse(PartnerKeyVerifier.matches(new ChannelSnapshot(noKey.get("aggregators").get(0), null, null), "anything"));
        assertEquals("abc", PartnerKeyVerifier.extractKey("Bearer abc", null));
        assertEquals("def", PartnerKeyVerifier.extractKey(null, " def "));
    }

    @Test
    void outboundGuardBlocksPrivateTargets() throws Exception {
        assertThrows(OutboundUrlGuard.BlockedUrlException.class, () -> OutboundUrlGuard.check("http://example.com"));
        assertThrows(OutboundUrlGuard.BlockedUrlException.class, () -> OutboundUrlGuard.check("https://127.0.0.1/x"));
        assertThrows(OutboundUrlGuard.BlockedUrlException.class, () -> OutboundUrlGuard.check("https://localhost/x"));
        assertThrows(OutboundUrlGuard.BlockedUrlException.class, () -> OutboundUrlGuard.check("https://user:pw@example.com/"));
        assertTrue(OutboundUrlGuard.isPrivate(InetAddress.getByName("10.1.2.3")));
        assertTrue(OutboundUrlGuard.isPrivate(InetAddress.getByName("169.254.169.254")));
        assertFalse(OutboundUrlGuard.isPrivate(InetAddress.getByName("8.8.8.8")));
    }
}
