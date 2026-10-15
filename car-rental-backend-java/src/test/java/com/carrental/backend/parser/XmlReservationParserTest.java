package com.carrental.backend.parser;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.xmlunit.assertj.XmlAssert;
import org.xmlunit.builder.DiffBuilder;
import org.xmlunit.diff.Diff;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.ByteArrayInputStream;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.*;

/**
 * Comprehensive test suite for XML Reservation Parser
 *
 * Tests cover:
 * - OTA XML parsing
 * - Booking.com format
 * - Expedia format
 * - Error recovery
 * - Namespace handling
 * - Invalid XML handling
 */
@DisplayName("XML Reservation Parser Tests")
class XmlReservationParserTest {

    private XmlReservationParser parser;

    @BeforeEach
    void setUp() {
        parser = new XmlReservationParser();
    }

    @Test
    @DisplayName("Should parse OTA XML format correctly")
    void shouldParseOtaXmlFormat() throws Exception {
        // Arrange
        String otaXml = """
            <?xml version="1.0" encoding="UTF-8"?>
            <OTA_VehResRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0">
                <POS>
                    <Source>
                        <RequestorID Type="5" ID="BOOKING.COM"/>
                    </Source>
                </POS>
                <VehResRQCore>
                    <VehRentalCore PickUpDateTime="2024-06-01T10:00:00" ReturnDateTime="2024-06-05T10:00:00">
                        <PickUpLocation LocationCode="NCT-MAIN"/>
                        <ReturnLocation LocationCode="NCT-MAIN"/>
                    </VehRentalCore>
                    <Customer>
                        <Primary>
                            <PersonName>
                                <GivenName>John</GivenName>
                                <Surname>Doe</Surname>
                            </PersonName>
                            <Telephone PhoneNumber="+1234567890"/>
                            <Email>john.doe@example.com</Email>
                        </Primary>
                    </Customer>
                    <VehPref>
                        <VehType VehicleCategory="ECAR"/>
                        <VehMakeModel Name="Toyota Camry"/>
                    </VehPref>
                    <TotalCharge RateTotalAmount="500.00" CurrencyCode="USD"/>
                </VehResRQCore>
                <VehResRQInfo>
                    <RentalPaymentPref>
                        <Voucher Identifier="NCT-2024-001"/>
                    </RentalPaymentPref>
                </VehResRQInfo>
            </OTA_VehResRQ>
            """;

        // Act
        ParsedReservation reservation = parser.parseOtaXml(otaXml);

        // Assert
        assertThat(reservation).isNotNull();
        assertThat(reservation.getCustomerName()).isEqualTo("John Doe");
        assertThat(reservation.getCustomerEmail()).isEqualTo("john.doe@example.com");
        assertThat(reservation.getCustomerPhone()).isEqualTo("+1234567890");
        assertThat(reservation.getBookingId()).isEqualTo("NCT-2024-001");
        assertThat(reservation.getPickupDate()).isEqualTo(LocalDate.of(2024, 6, 1));
        assertThat(reservation.getReturnDate()).isEqualTo(LocalDate.of(2024, 6, 5));
        assertThat(reservation.getVehicleModel()).isEqualTo("Toyota Camry");
        assertThat(reservation.getTotalAmount()).isEqualTo(500.00);
        assertThat(reservation.getChannel()).isEqualTo("BOOKING.COM");
    }

    @Test
    @DisplayName("Should parse Booking.com specific XML format")
    void shouldParseBookingComXmlFormat() throws Exception {
        // Arrange
        String bookingXml = """
            <?xml version="1.0" encoding="UTF-8"?>
            <BookingNotification>
                <ReservationId>BDC-123456789</ReservationId>
                <CustomerInfo>
                    <FirstName>Jane</FirstName>
                    <LastName>Smith</LastName>
                    <Email>jane.smith@example.com</Email>
                    <Phone>+9876543210</Phone>
                </CustomerInfo>
                <RentalDetails>
                    <PickupDate>2024-07-01</PickupDate>
                    <DropoffDate>2024-07-10</DropoffDate>
                    <PickupLocation>Airport Terminal</PickupLocation>
                    <VehicleType>Compact</VehicleType>
                    <VehicleModel>Honda Civic</VehicleModel>
                </RentalDetails>
                <Pricing>
                    <TotalPrice Currency="EUR">750.00</TotalPrice>
                    <DepositAmount>150.00</DepositAmount>
                </Pricing>
                <Status>Confirmed</Status>
            </BookingNotification>
            """;

        // Act
        ParsedReservation reservation = parser.parseBookingComXml(bookingXml);

        // Assert
        assertThat(reservation).isNotNull();
        assertThat(reservation.getCustomerName()).isEqualTo("Jane Smith");
        assertThat(reservation.getCustomerEmail()).isEqualTo("jane.smith@example.com");
        assertThat(reservation.getBookingId()).isEqualTo("BDC-123456789");
        assertThat(reservation.getPickupDate()).isEqualTo(LocalDate.of(2024, 7, 1));
        assertThat(reservation.getReturnDate()).isEqualTo(LocalDate.of(2024, 7, 10));
        assertThat(reservation.getVehicleModel()).isEqualTo("Honda Civic");
        assertThat(reservation.getTotalAmount()).isEqualTo(750.00);
        assertThat(reservation.getChannel()).isEqualTo("BOOKING.COM");
    }

    @Test
    @DisplayName("Should parse Expedia XML format")
    void shouldParseExpediaXmlFormat() throws Exception {
        // Arrange
        String expediaXml = """
            <?xml version="1.0" encoding="UTF-8"?>
            <CarBooking xmlns:exp="http://www.expediaconnect.com/EPS">
                <exp:ConfirmationNumber>EXP-987654321</exp:ConfirmationNumber>
                <exp:GuestInformation>
                    <exp:Name>
                        <exp:First>Robert</exp:First>
                        <exp:Last>Johnson</exp:Last>
                    </exp:Name>
                    <exp:ContactInfo>
                        <exp:Email>robert.johnson@example.com</exp:Email>
                        <exp:PhoneNumber>+1122334455</exp:PhoneNumber>
                    </exp:ContactInfo>
                </exp:GuestInformation>
                <exp:RentalInfo>
                    <exp:PickupDateTime>2024-08-15T14:00:00</exp:PickupDateTime>
                    <exp:ReturnDateTime>2024-08-20T14:00:00</exp:ReturnDateTime>
                    <exp:VehicleInfo>
                        <exp:Category>SUV</exp:Category>
                        <exp:Make>Ford</exp:Make>
                        <exp:Model>Explorer</exp:Model>
                    </exp:VehicleInfo>
                </exp:RentalInfo>
                <exp:PriceInfo>
                    <exp:TotalCharge>850.00</exp:TotalCharge>
                    <exp:Currency>USD</exp:Currency>
                </exp:PriceInfo>
            </CarBooking>
            """;

        // Act
        ParsedReservation reservation = parser.parseExpediaXml(expediaXml);

        // Assert
        assertThat(reservation).isNotNull();
        assertThat(reservation.getCustomerName()).isEqualTo("Robert Johnson");
        assertThat(reservation.getCustomerEmail()).isEqualTo("robert.johnson@example.com");
        assertThat(reservation.getBookingId()).isEqualTo("EXP-987654321");
        assertThat(reservation.getPickupDate()).isEqualTo(LocalDate.of(2024, 8, 15));
        assertThat(reservation.getReturnDate()).isEqualTo(LocalDate.of(2024, 8, 20));
        assertThat(reservation.getVehicleModel()).isEqualTo("Ford Explorer");
        assertThat(reservation.getTotalAmount()).isEqualTo(850.00);
        assertThat(reservation.getChannel()).isEqualTo("EXPEDIA");
    }

    @Test
    @DisplayName("Should auto-detect XML format and parse accordingly")
    void shouldAutoDetectXmlFormat() throws Exception {
        // Arrange
        String otaXml = """
            <?xml version="1.0" encoding="UTF-8"?>
            <OTA_VehResRQ xmlns="http://www.opentravel.org/OTA/2003/05">
                <VehResRQCore>
                    <Customer>
                        <Primary>
                            <PersonName>
                                <GivenName>Auto</GivenName>
                                <Surname>Detect</Surname>
                            </PersonName>
                        </Primary>
                    </Customer>
                </VehResRQCore>
            </OTA_VehResRQ>
            """;

        // Act
        ParsedReservation reservation = parser.parseXmlAutoDetect(otaXml);

        // Assert
        assertThat(reservation).isNotNull();
        assertThat(reservation.getCustomerName()).contains("Auto Detect");
    }

    @Test
    @DisplayName("Should handle malformed XML gracefully")
    void shouldHandleMalformedXmlGracefully() {
        // Arrange
        String malformedXml = """
            <?xml version="1.0" encoding="UTF-8"?>
            <InvalidXml>
                <UnclosedTag>
                <MissingClosing>
            </InvalidXml>
            """;

        // Act & Assert
        assertThatThrownBy(() -> parser.parseXmlAutoDetect(malformedXml))
            .isInstanceOf(XmlParseException.class)
            .hasMessageContaining("Failed to parse XML");
    }

    @Test
    @DisplayName("Should handle missing required fields with default values")
    void shouldHandleMissingRequiredFields() throws Exception {
        // Arrange
        String incompleteXml = """
            <?xml version="1.0" encoding="UTF-8"?>
            <BookingNotification>
                <ReservationId>INCOMPLETE-001</ReservationId>
                <CustomerInfo>
                    <FirstName>Test</FirstName>
                </CustomerInfo>
            </BookingNotification>
            """;

        // Act
        ParsedReservation reservation = parser.parseBookingComXml(incompleteXml);

        // Assert
        assertThat(reservation).isNotNull();
        assertThat(reservation.getBookingId()).isEqualTo("INCOMPLETE-001");
        assertThat(reservation.getCustomerName()).isEqualTo("Test");
        assertThat(reservation.getCustomerEmail()).isNull();
        assertThat(reservation.getTotalAmount()).isEqualTo(0.0); // Default value
    }

    @Test
    @DisplayName("Should handle different date formats")
    void shouldHandleDifferentDateFormats() throws Exception {
        // Arrange
        List<String> dateFormats = List.of(
            "2024-06-01",
            "2024-06-01T10:00:00",
            "2024-06-01T10:00:00Z",
            "2024-06-01T10:00:00+00:00",
            "01/06/2024"
        );

        for (String dateFormat : dateFormats) {
            // Act
            LocalDate parsed = parser.parseDateFlexible(dateFormat);

            // Assert
            assertThat(parsed).isNotNull();
            assertThat(parsed.getMonthValue()).isEqualTo(6);
            assertThat(parsed.getDayOfMonth()).isEqualTo(1);
        }
    }

    @Test
    @DisplayName("Should handle different namespace declarations")
    void shouldHandleDifferentNamespaces() throws Exception {
        // Arrange
        String xmlWithNamespace = """
            <?xml version="1.0" encoding="UTF-8"?>
            <ns1:Reservation xmlns:ns1="http://custom.namespace.com">
                <ns1:Id>NS-001</ns1:Id>
                <ns1:Customer>John Doe</ns1:Customer>
            </ns1:Reservation>
            """;

        // Act
        ParsedReservation reservation = parser.parseXmlAutoDetect(xmlWithNamespace);

        // Assert
        assertThat(reservation).isNotNull();
    }

    @Test
    @DisplayName("Should validate XML against schema if provided")
    void shouldValidateXmlAgainstSchema() throws Exception {
        // Arrange
        String validXml = """
            <?xml version="1.0" encoding="UTF-8"?>
            <OTA_VehResRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0">
                <VehResRQCore>
                    <Customer>
                        <Primary>
                            <PersonName>
                                <GivenName>Valid</GivenName>
                                <Surname>User</Surname>
                            </PersonName>
                        </Primary>
                    </Customer>
                </VehResRQCore>
            </OTA_VehResRQ>
            """;

        // Act
        boolean isValid = parser.validateXml(validXml, "ota-schema.xsd");

        // Assert
        assertThat(isValid).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "UTF-8",
        "UTF-16",
        "ISO-8859-1"
    })
    @DisplayName("Should handle different character encodings")
    void shouldHandleDifferentEncodings(String encoding) throws Exception {
        // Arrange
        String xml = """
            <?xml version="1.0" encoding="%s"?>
            <Reservation>
                <Customer>José García</Customer>
                <Notes>Special chars: üöäß€</Notes>
            </Reservation>
            """.formatted(encoding);

        // Act
        ParsedReservation reservation = parser.parseXmlAutoDetect(xml);

        // Assert
        assertThat(reservation).isNotNull();
    }

    @Test
    @DisplayName("Should extract all extras from XML")
    void shouldExtractAllExtrasFromXml() throws Exception {
        // Arrange
        String xmlWithExtras = """
            <?xml version="1.0" encoding="UTF-8"?>
            <Reservation>
                <BookingId>EXT-001</BookingId>
                <Customer>Test User</Customer>
                <Extras>
                    <Extra>
                        <Type>GPS</Type>
                        <Price>5.00</Price>
                    </Extra>
                    <Extra>
                        <Type>Child Seat</Type>
                        <Price>10.00</Price>
                    </Extra>
                    <Extra>
                        <Type>Additional Driver</Type>
                        <Price>15.00</Price>
                    </Extra>
                </Extras>
            </Reservation>
            """;

        // Act
        ParsedReservation reservation = parser.parseXmlAutoDetect(xmlWithExtras);

        // Assert
        assertThat(reservation.getExtras()).hasSize(3);
        assertThat(reservation.getExtras()).extracting("type")
            .contains("GPS", "Child Seat", "Additional Driver");
        assertThat(reservation.getTotalExtrasAmount()).isEqualTo(30.00);
    }

    @Test
    @DisplayName("Should handle CDATA sections correctly")
    void shouldHandleCdataSections() throws Exception {
        // Arrange
        String xmlWithCdata = """
            <?xml version="1.0" encoding="UTF-8"?>
            <Reservation>
                <BookingId>CDATA-001</BookingId>
                <Notes><![CDATA[
                    This is a note with special characters: <>&"'
                    And multiple lines
                    With formatting
                ]]></Notes>
            </Reservation>
            """;

        // Act
        ParsedReservation reservation = parser.parseXmlAutoDetect(xmlWithCdata);

        // Assert
        assertThat(reservation.getNotes()).contains("<>&\"'");
    }

    @Test
    @DisplayName("Should recover from partial XML errors")
    void shouldRecoverFromPartialErrors() throws Exception {
        // Arrange
        String partiallyInvalidXml = """
            <?xml version="1.0" encoding="UTF-8"?>
            <Reservation>
                <BookingId>PARTIAL-001</BookingId>
                <Customer>Valid Customer</Customer>
                <InvalidTag>This won't parse</InvalidTag
                <Amount>500.00</Amount>
            </Reservation>
            """;

        // Act
        ParsedReservation reservation = parser.parseXmlWithRecovery(partiallyInvalidXml);

        // Assert
        assertThat(reservation).isNotNull();
        assertThat(reservation.getBookingId()).isEqualTo("PARTIAL-001");
        assertThat(reservation.getCustomerName()).isEqualTo("Valid Customer");
        // Invalid tag should be skipped, but valid data preserved
    }

    @Test
    @DisplayName("Should batch parse multiple reservations from XML feed")
    void shouldBatchParseMultipleReservations() throws Exception {
        // Arrange
        String batchXml = """
            <?xml version="1.0" encoding="UTF-8"?>
            <ReservationFeed>
                <Reservation>
                    <BookingId>BATCH-001</BookingId>
                    <Customer>Customer 1</Customer>
                </Reservation>
                <Reservation>
                    <BookingId>BATCH-002</BookingId>
                    <Customer>Customer 2</Customer>
                </Reservation>
                <Reservation>
                    <BookingId>BATCH-003</BookingId>
                    <Customer>Customer 3</Customer>
                </Reservation>
            </ReservationFeed>
            """;

        // Act
        List<ParsedReservation> reservations = parser.parseBatchXml(batchXml);

        // Assert
        assertThat(reservations).hasSize(3);
        assertThat(reservations).extracting("bookingId")
            .containsExactly("BATCH-001", "BATCH-002", "BATCH-003");
    }
}

// Supporting classes for tests
class ParsedReservation {
    private String bookingId;
    private String customerName;
    private String customerEmail;
    private String customerPhone;
    private LocalDate pickupDate;
    private LocalDate returnDate;
    private String vehicleModel;
    private Double totalAmount;
    private String channel;
    private List<Extra> extras;
    private String notes;

    // Getters and setters
    public String getBookingId() { return bookingId; }
    public String getCustomerName() { return customerName; }
    public String getCustomerEmail() { return customerEmail; }
    public String getCustomerPhone() { return customerPhone; }
    public LocalDate getPickupDate() { return pickupDate; }
    public LocalDate getReturnDate() { return returnDate; }
    public String getVehicleModel() { return vehicleModel; }
    public Double getTotalAmount() { return totalAmount; }
    public String getChannel() { return channel; }
    public List<Extra> getExtras() { return extras; }
    public String getNotes() { return notes; }

    public Double getTotalExtrasAmount() {
        return extras != null ? extras.stream().mapToDouble(Extra::getPrice).sum() : 0.0;
    }
}

class Extra {
    private String type;
    private Double price;

    public String getType() { return type; }
    public Double getPrice() { return price; }
}

class XmlParseException extends Exception {
    public XmlParseException(String message) {
        super(message);
    }
}

// Stub implementation of XmlReservationParser
class XmlReservationParser {
    public ParsedReservation parseOtaXml(String xml) throws XmlParseException {
        return new ParsedReservation();
    }

    public ParsedReservation parseBookingComXml(String xml) throws XmlParseException {
        return new ParsedReservation();
    }

    public ParsedReservation parseExpediaXml(String xml) throws XmlParseException {
        return new ParsedReservation();
    }

    public ParsedReservation parseXmlAutoDetect(String xml) throws XmlParseException {
        return new ParsedReservation();
    }

    public LocalDate parseDateFlexible(String dateString) {
        return LocalDate.now();
    }

    public boolean validateXml(String xml, String schemaPath) {
        return true;
    }

    public ParsedReservation parseXmlWithRecovery(String xml) throws XmlParseException {
        return new ParsedReservation();
    }

    public List<ParsedReservation> parseBatchXml(String xml) throws XmlParseException {
        return List.of();
    }
}
