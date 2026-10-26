package com.carrental.backend.ota;

/**
 * Machine-readable contracts handed to brokers:
 *   - the XSD of the native XML messages (GET /xml/v1/schema.xsd), and
 *   - the WSDL of the OTA SOAP endpoint (GET /ota/v1/{channel}/soap?wsdl).
 * Responses are written in the element order these schemas declare; optional values are left out.
 */
final class ChannelSchemas {
    private ChannelSchemas() {}

    private static final String NATIVE_XSD = """
        <?xml version="1.0" encoding="UTF-8"?>
        <!-- NCT Rental native XML booking API, version 1. Messages are POSTed to /xml/v1/{Operation}. -->
        <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" elementFormDefault="unqualified" version="1.0">

          <!-- ============================================================ common -->
          <xs:simpleType name="Code"><xs:restriction base="xs:string"><xs:maxLength value="40"/></xs:restriction></xs:simpleType>
          <xs:simpleType name="Money"><xs:restriction base="xs:decimal"><xs:fractionDigits value="2"/></xs:restriction></xs:simpleType>
          <xs:simpleType name="LocalDateTime">
            <xs:annotation><xs:documentation>Local time at the station, e.g. 2026-11-20T10:00:00 (no offset).</xs:documentation></xs:annotation>
            <xs:restriction base="xs:string"><xs:pattern value="\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2})?"/></xs:restriction>
          </xs:simpleType>

          <xs:complexType name="RequestHeader">
            <xs:all>
              <xs:element name="ChannelCode" type="Code" minOccurs="0"/>
              <xs:element name="RequestID" type="xs:string" minOccurs="0"/>
              <xs:element name="IdempotencyKey" type="xs:string" minOccurs="0"/>
            </xs:all>
          </xs:complexType>
          <xs:complexType name="Credentials">
            <xs:all>
              <xs:element name="Username" type="Code" minOccurs="0"/>
              <xs:element name="ApiKey" type="xs:string" minOccurs="0"/>
              <xs:element name="PasswordHash" type="xs:string" minOccurs="0"/>
            </xs:all>
          </xs:complexType>
          <xs:complexType name="ResponseHeader">
            <xs:sequence>
              <xs:element name="RequestID" type="xs:string" minOccurs="0"/>
              <xs:element name="Status">
                <xs:simpleType><xs:restriction base="xs:string"><xs:enumeration value="SUCCESS"/><xs:enumeration value="ERROR"/></xs:restriction></xs:simpleType>
              </xs:element>
              <xs:element name="ErrorCode" type="xs:string" minOccurs="0"/>
              <xs:element name="ErrorMessage" type="xs:string" minOccurs="0"/>
              <xs:element name="Environment" type="xs:string" minOccurs="0"/>
              <xs:element name="Timestamp" type="xs:dateTime"/>
            </xs:sequence>
          </xs:complexType>

          <xs:complexType name="Itinerary">
            <xs:all>
              <xs:element name="PickupLocationCode" type="Code" minOccurs="0"/>
              <xs:element name="ReturnLocationCode" type="Code" minOccurs="0"/>
              <xs:element name="PickupDateTime" type="LocalDateTime" minOccurs="0"/>
              <xs:element name="ReturnDateTime" type="LocalDateTime" minOccurs="0"/>
              <xs:element name="DriverAge" type="xs:int" minOccurs="0"/>
              <xs:element name="DriverCountry" type="Code" minOccurs="0"/>
              <xs:element name="VehicleGroupCode" type="Code" minOccurs="0"/>
            </xs:all>
          </xs:complexType>
          <xs:complexType name="ExtrasRequested">
            <xs:sequence>
              <xs:element name="Extra" minOccurs="0" maxOccurs="20">
                <xs:complexType><xs:all><xs:element name="Code" type="Code"/><xs:element name="Quantity" type="xs:int" minOccurs="0"/></xs:all></xs:complexType>
              </xs:element>
            </xs:sequence>
          </xs:complexType>
          <xs:complexType name="CoveragesRequested">
            <xs:sequence><xs:element name="CoverageCode" type="Code" minOccurs="0" maxOccurs="10"/></xs:sequence>
          </xs:complexType>
          <xs:complexType name="Customer">
            <xs:all>
              <xs:element name="Title" type="xs:string" minOccurs="0"/>
              <xs:element name="FirstName" type="xs:string" minOccurs="0"/>
              <xs:element name="LastName" type="xs:string"/>
              <xs:element name="Email" type="xs:string" minOccurs="0"/>
              <xs:element name="Phone" type="xs:string" minOccurs="0"/>
              <xs:element name="Country" type="Code" minOccurs="0"/>
            </xs:all>
          </xs:complexType>
          <xs:complexType name="Driver">
            <xs:all>
              <xs:element name="FirstName" type="xs:string" minOccurs="0"/>
              <xs:element name="LastName" type="xs:string" minOccurs="0"/>
              <xs:element name="DateOfBirth" type="xs:date" minOccurs="0"/>
              <xs:element name="LicenceNumber" type="xs:string" minOccurs="0"/>
              <xs:element name="LicenceCountry" type="Code" minOccurs="0"/>
            </xs:all>
          </xs:complexType>

          <!-- ============================================================ requests -->
          <xs:complexType name="BaseRequest">
            <xs:all>
              <xs:element name="Header" type="RequestHeader"/>
              <xs:element name="Credentials" type="Credentials" minOccurs="0"/>
            </xs:all>
          </xs:complexType>
          <xs:element name="LocationsRequest" type="BaseRequest"/>
          <xs:element name="VehicleGroupsRequest" type="BaseRequest"/>
          <xs:element name="ExtrasRequest" type="BaseRequest"/>
          <xs:element name="CoveragesRequest" type="BaseRequest"/>
          <xs:element name="InventoryRequest">
            <xs:complexType><xs:all>
              <xs:element name="Header" type="RequestHeader"/>
              <xs:element name="Credentials" type="Credentials" minOccurs="0"/>
              <xs:element name="Days" type="xs:int" minOccurs="0"/>
            </xs:all></xs:complexType>
          </xs:element>
          <xs:element name="AvailabilityRequest">
            <xs:complexType><xs:all>
              <xs:element name="Header" type="RequestHeader"/>
              <xs:element name="Credentials" type="Credentials" minOccurs="0"/>
              <xs:element name="Itinerary" type="Itinerary"/>
              <xs:element name="Extras" type="ExtrasRequested" minOccurs="0"/>
              <xs:element name="Coverages" type="CoveragesRequested" minOccurs="0"/>
              <xs:element name="PromoCode" type="Code" minOccurs="0"/>
              <xs:element name="OnlyAvailable" type="xs:boolean" minOccurs="0"/>
            </xs:all></xs:complexType>
          </xs:element>
          <xs:element name="QuoteRequest">
            <xs:complexType><xs:all>
              <xs:element name="Header" type="RequestHeader"/>
              <xs:element name="Credentials" type="Credentials" minOccurs="0"/>
              <xs:element name="OfferID" type="Code"/>
            </xs:all></xs:complexType>
          </xs:element>
          <xs:element name="ReservationCreateRequest">
            <xs:complexType><xs:all>
              <xs:element name="Header" type="RequestHeader"/>
              <xs:element name="Credentials" type="Credentials" minOccurs="0"/>
              <xs:element name="OfferID" type="Code" minOccurs="0"/>
              <xs:element name="BrokerReference" type="xs:string" minOccurs="0"/>
              <xs:element name="Itinerary" type="Itinerary" minOccurs="0"/>
              <xs:element name="Extras" type="ExtrasRequested" minOccurs="0"/>
              <xs:element name="Coverages" type="CoveragesRequested" minOccurs="0"/>
              <xs:element name="PromoCode" type="Code" minOccurs="0"/>
              <xs:element name="Customer" type="Customer"/>
              <xs:element name="Driver" type="Driver" minOccurs="0"/>
              <xs:element name="ExpectedTotalAmount" type="Money" minOccurs="0"/>
              <xs:element name="Comments" type="xs:string" minOccurs="0"/>
              <xs:element name="FlightNumber" type="xs:string" minOccurs="0"/>
            </xs:all></xs:complexType>
          </xs:element>
          <xs:complexType name="ReservationReference">
            <xs:all>
              <xs:element name="Header" type="RequestHeader"/>
              <xs:element name="Credentials" type="Credentials" minOccurs="0"/>
              <xs:element name="ReservationID" type="Code" minOccurs="0"/>
              <xs:element name="BrokerReference" type="xs:string" minOccurs="0"/>
              <xs:element name="Reason" type="xs:string" minOccurs="0"/>
            </xs:all>
          </xs:complexType>
          <xs:element name="ReservationStatusRequest" type="ReservationReference"/>
          <xs:element name="ReservationCancelRequest" type="ReservationReference"/>
          <xs:element name="ReservationModifyRequest">
            <xs:complexType><xs:all>
              <xs:element name="Header" type="RequestHeader"/>
              <xs:element name="Credentials" type="Credentials" minOccurs="0"/>
              <xs:element name="ReservationID" type="Code" minOccurs="0"/>
              <xs:element name="BrokerReference" type="xs:string" minOccurs="0"/>
              <xs:element name="Itinerary" type="Itinerary" minOccurs="0"/>
              <xs:element name="Extras" type="ExtrasRequested" minOccurs="0"/>
              <xs:element name="Coverages" type="CoveragesRequested" minOccurs="0"/>
              <xs:element name="PromoCode" type="Code" minOccurs="0"/>
              <xs:element name="Customer" type="Customer" minOccurs="0"/>
              <xs:element name="Driver" type="Driver" minOccurs="0"/>
              <xs:element name="ExpectedTotalAmount" type="Money" minOccurs="0"/>
              <xs:element name="Comments" type="xs:string" minOccurs="0"/>
            </xs:all></xs:complexType>
          </xs:element>

          <!-- ============================================================ response parts -->
          <xs:complexType name="VehicleDetails">
            <xs:sequence>
              <xs:element name="Seats" type="xs:int"/>
              <xs:element name="Doors" type="xs:int"/>
              <xs:element name="LargeBags" type="xs:int"/>
              <xs:element name="SmallBags" type="xs:int"/>
              <xs:element name="Fuel" type="xs:string"/>
              <xs:element name="PictureURL" type="xs:anyURI" minOccurs="0"/>
              <xs:element name="Description" type="xs:string" minOccurs="0"/>
            </xs:sequence>
          </xs:complexType>
          <xs:complexType name="Breakdown">
            <xs:sequence>
              <xs:element name="Line" minOccurs="0" maxOccurs="unbounded">
                <xs:annotation><xs:documentation>Type: BASE, DISCOUNT, EXTRA, COVERAGE, FEE or TAX.</xs:documentation></xs:annotation>
                <xs:complexType><xs:simpleContent><xs:extension base="xs:string">
                  <xs:attribute name="Type" type="xs:string" use="required"/>
                  <xs:attribute name="Code" type="xs:string"/>
                  <xs:attribute name="Quantity" type="xs:int"/>
                  <xs:attribute name="UnitAmount" type="Money"/>
                  <xs:attribute name="Amount" type="Money" use="required"/>
                </xs:extension></xs:simpleContent></xs:complexType>
              </xs:element>
            </xs:sequence>
          </xs:complexType>
          <xs:complexType name="Mileage">
            <xs:attribute name="Unlimited" type="xs:boolean" use="required"/>
            <xs:attribute name="KmPerDay" type="xs:int"/>
            <xs:attribute name="KmIncluded" type="xs:int"/>
            <xs:attribute name="ExtraKmPrice" type="Money"/>
          </xs:complexType>
          <xs:complexType name="OfferCoverages">
            <xs:sequence>
              <xs:element name="Coverage" maxOccurs="unbounded">
                <xs:complexType><xs:simpleContent><xs:extension base="xs:string">
                  <xs:attribute name="Code" type="xs:string" use="required"/>
                  <xs:attribute name="Included" type="xs:boolean" use="required"/>
                  <xs:attribute name="Selected" type="xs:boolean" use="required"/>
                  <xs:attribute name="DailyPrice" type="Money"/>
                  <xs:attribute name="Amount" type="Money"/>
                  <xs:attribute name="ExcessAmount" type="Money"/>
                  <xs:attribute name="DepositAmount" type="Money"/>
                </xs:extension></xs:simpleContent></xs:complexType>
              </xs:element>
            </xs:sequence>
          </xs:complexType>
          <xs:complexType name="Offer">
            <xs:sequence>
              <xs:element name="OfferID" type="Code" minOccurs="0"/>
              <xs:element name="VehicleGroupCode" type="Code"/>
              <xs:element name="VehicleGroupName" type="xs:string"/>
              <xs:element name="SippCode" type="Code"/>
              <xs:element name="VehicleExample" type="xs:string"/>
              <xs:element name="Transmission" type="xs:string"/>
              <xs:element name="Available" type="xs:boolean"/>
              <xs:element name="AvailableCount" type="xs:int"/>
              <xs:element name="Currency" type="Code"/>
              <xs:element name="RentalDays" type="xs:int"/>
              <xs:element name="ClosedReason" type="xs:string" minOccurs="0"/>
              <xs:element name="VehicleDetails" type="VehicleDetails" minOccurs="0"/>
              <xs:element name="Price">
                <xs:complexType><xs:sequence>
                  <xs:element name="BaseAmount" type="Money"/>
                  <xs:element name="ExtrasAmount" type="Money"/>
                  <xs:element name="FeesAmount" type="Money"/>
                  <xs:element name="TaxAmount" type="Money"/>
                  <xs:element name="TaxIncluded" type="xs:boolean"/>
                  <xs:element name="TaxName" type="xs:string" minOccurs="0"/>
                  <xs:element name="TaxPercent" type="xs:decimal" minOccurs="0"/>
                  <xs:element name="TotalAmount" type="Money"/>
                  <xs:element name="PromoCode" type="Code" minOccurs="0"/>
                  <xs:element name="Breakdown" type="Breakdown"/>
                </xs:sequence></xs:complexType>
              </xs:element>
              <xs:element name="Mileage" type="Mileage" minOccurs="0"/>
              <xs:element name="Coverages" type="OfferCoverages" minOccurs="0"/>
              <xs:element name="Policies">
                <xs:complexType><xs:sequence>
                  <xs:element name="CancellationPolicyCode" type="xs:string"/>
                  <xs:element name="PaymentType" type="xs:string"/>
                  <xs:element name="DepositAmount" type="Money"/>
                  <xs:element name="ExcessAmount" type="Money"/>
                </xs:sequence></xs:complexType>
              </xs:element>
              <xs:element name="QuoteExpiresAt" type="xs:dateTime" minOccurs="0"/>
              <xs:element name="Held" type="xs:boolean" minOccurs="0"/>
            </xs:sequence>
          </xs:complexType>
          <xs:complexType name="Reservation">
            <xs:sequence>
              <xs:element name="ReservationID" type="Code"/>
              <xs:element name="BrokerReference" type="xs:string" minOccurs="0"/>
              <xs:element name="Status">
                <xs:simpleType><xs:restriction base="xs:string">
                  <xs:enumeration value="PENDING"/><xs:enumeration value="CONFIRMED"/><xs:enumeration value="IN_PROGRESS"/>
                  <xs:enumeration value="COMPLETED"/><xs:enumeration value="CANCELLED"/><xs:enumeration value="NO_SHOW"/>
                </xs:restriction></xs:simpleType>
              </xs:element>
              <xs:element name="VehicleGroupCode" type="Code"/>
              <xs:element name="Vehicle" type="xs:string"/>
              <xs:element name="PickupLocationCode" type="xs:string"/>
              <xs:element name="ReturnLocationCode" type="xs:string"/>
              <xs:element name="PickupDateTime" type="LocalDateTime"/>
              <xs:element name="ReturnDateTime" type="LocalDateTime"/>
              <xs:element name="RentalDays" type="xs:int"/>
              <xs:element name="BaseAmount" type="Money"/>
              <xs:element name="ExtrasAmount" type="Money"/>
              <xs:element name="FeesAmount" type="Money"/>
              <xs:element name="TaxAmount" type="Money"/>
              <xs:element name="TaxIncluded" type="xs:boolean"/>
              <xs:element name="TotalAmount" type="Money"/>
              <xs:element name="Currency" type="Code"/>
              <xs:element name="PromoCode" type="Code" minOccurs="0"/>
              <xs:element name="PaymentType" type="xs:string"/>
              <xs:element name="PaymentStatus" type="xs:string"/>
              <xs:element name="CancellationPolicyCode" type="xs:string"/>
              <xs:element name="Breakdown" type="Breakdown"/>
              <xs:element name="VehicleDetails" type="VehicleDetails" minOccurs="0"/>
              <xs:element name="Mileage" type="Mileage" minOccurs="0"/>
              <xs:element name="Coverages" type="OfferCoverages" minOccurs="0"/>
              <xs:element name="Customer">
                <xs:complexType><xs:sequence>
                  <xs:element name="FirstName" type="xs:string"/>
                  <xs:element name="LastName" type="xs:string"/>
                  <xs:element name="Email" type="xs:string" minOccurs="0"/>
                  <xs:element name="Phone" type="xs:string" minOccurs="0"/>
                </xs:sequence></xs:complexType>
              </xs:element>
              <xs:element name="AssignedVehicle" type="xs:string" minOccurs="0"/>
              <xs:element name="CancellationFee" type="Money" minOccurs="0"/>
              <xs:element name="RefundAmount" type="Money" minOccurs="0"/>
              <xs:element name="RefundStatus" type="xs:string" minOccurs="0"/>
              <xs:element name="Sandbox" type="xs:boolean" minOccurs="0"/>
            </xs:sequence>
          </xs:complexType>

          <!-- ============================================================ responses -->
          <xs:element name="LocationsResponse">
            <xs:complexType><xs:sequence>
              <xs:element name="Header" type="ResponseHeader"/>
              <xs:element name="Locations" minOccurs="0">
                <xs:complexType><xs:sequence>
                  <xs:element name="Location" minOccurs="0" maxOccurs="unbounded">
                    <xs:complexType><xs:sequence>
                      <xs:element name="Code" type="Code"/>
                      <xs:element name="Name" type="xs:string"/>
                      <xs:element name="Type">
                        <xs:simpleType><xs:restriction base="xs:string"><xs:enumeration value="AIRPORT"/><xs:enumeration value="CITY"/>
                          <xs:enumeration value="HOTEL"/><xs:enumeration value="RAILWAY"/><xs:enumeration value="PORT"/></xs:restriction></xs:simpleType>
                      </xs:element>
                      <xs:element name="Address" type="xs:string" minOccurs="0"/>
                      <xs:element name="Phone" type="xs:string" minOccurs="0"/>
                      <xs:element name="Latitude" type="xs:decimal" minOccurs="0"/>
                      <xs:element name="Longitude" type="xs:decimal" minOccurs="0"/>
                      <xs:element name="PickupAllowed" type="xs:boolean"/>
                      <xs:element name="ReturnAllowed" type="xs:boolean"/>
                      <xs:element name="OpeningHours">
                        <xs:annotation><xs:documentation>No Day elements: open around the clock. A day that is missing: closed that day.</xs:documentation></xs:annotation>
                        <xs:complexType><xs:sequence>
                          <xs:element name="Day" minOccurs="0" maxOccurs="7">
                            <xs:complexType>
                              <xs:attribute name="Name" use="required">
                                <xs:simpleType><xs:restriction base="xs:string"><xs:enumeration value="MON"/><xs:enumeration value="TUE"/>
                                  <xs:enumeration value="WED"/><xs:enumeration value="THU"/><xs:enumeration value="FRI"/><xs:enumeration value="SAT"/>
                                  <xs:enumeration value="SUN"/></xs:restriction></xs:simpleType>
                              </xs:attribute>
                              <xs:attribute name="Open" type="xs:string" use="required"/>
                              <xs:attribute name="Close" type="xs:string" use="required"/>
                            </xs:complexType>
                          </xs:element>
                        </xs:sequence></xs:complexType>
                      </xs:element>
                      <xs:element name="AfterHours">
                        <xs:complexType>
                          <xs:attribute name="Pickup" type="xs:boolean" use="required"/>
                          <xs:attribute name="Return" type="xs:boolean" use="required"/>
                          <xs:attribute name="Fee" type="Money"/>
                        </xs:complexType>
                      </xs:element>
                    </xs:sequence></xs:complexType>
                  </xs:element>
                </xs:sequence></xs:complexType>
              </xs:element>
            </xs:sequence></xs:complexType>
          </xs:element>
          <xs:element name="VehicleGroupsResponse">
            <xs:complexType><xs:sequence>
              <xs:element name="Header" type="ResponseHeader"/>
              <xs:element name="VehicleGroups" minOccurs="0">
                <xs:complexType><xs:sequence>
                  <xs:element name="VehicleGroup" minOccurs="0" maxOccurs="unbounded">
                    <xs:complexType><xs:sequence>
                      <xs:element name="Code" type="Code"/>
                      <xs:element name="SippCode" type="Code"/>
                      <xs:element name="Name" type="xs:string"/>
                      <xs:element name="Example" type="xs:string"/>
                      <xs:element name="Transmission" type="xs:string"/>
                      <xs:element name="AirConditioning" type="xs:boolean"/>
                      <xs:element name="DepositAmount" type="Money"/>
                      <xs:element name="ExcessAmount" type="Money"/>
                      <xs:element name="VehicleDetails" type="VehicleDetails" minOccurs="0"/>
                    </xs:sequence></xs:complexType>
                  </xs:element>
                </xs:sequence></xs:complexType>
              </xs:element>
            </xs:sequence></xs:complexType>
          </xs:element>
          <xs:element name="ExtrasResponse">
            <xs:complexType><xs:sequence>
              <xs:element name="Header" type="ResponseHeader"/>
              <xs:element name="Extras" minOccurs="0">
                <xs:complexType><xs:sequence>
                  <xs:element name="Extra" minOccurs="0" maxOccurs="unbounded">
                    <xs:complexType><xs:sequence>
                      <xs:element name="Code" type="Code"/>
                      <xs:element name="Name" type="xs:string"/>
                      <xs:element name="DailyPrice" type="Money"/>
                      <xs:element name="MaxPerRental" type="Money" minOccurs="0"/>
                    </xs:sequence></xs:complexType>
                  </xs:element>
                </xs:sequence></xs:complexType>
              </xs:element>
            </xs:sequence></xs:complexType>
          </xs:element>
          <xs:element name="CoveragesResponse">
            <xs:complexType><xs:sequence>
              <xs:element name="Header" type="ResponseHeader"/>
              <xs:element name="Coverages" minOccurs="0">
                <xs:complexType><xs:sequence>
                  <xs:element name="Coverage" minOccurs="0" maxOccurs="unbounded">
                    <xs:complexType><xs:sequence>
                      <xs:element name="Code" type="Code"/>
                      <xs:element name="Name" type="xs:string"/>
                      <xs:element name="Included" type="xs:boolean"/>
                      <xs:element name="DailyPrice" type="Money"/>
                      <xs:element name="ExcessAmount" type="Money" minOccurs="0"/>
                      <xs:element name="DepositAmount" type="Money" minOccurs="0"/>
                    </xs:sequence></xs:complexType>
                  </xs:element>
                </xs:sequence></xs:complexType>
              </xs:element>
            </xs:sequence></xs:complexType>
          </xs:element>
          <xs:element name="InventoryResponse">
            <xs:complexType><xs:sequence>
              <xs:element name="Header" type="ResponseHeader"/>
              <xs:element name="Inventory" minOccurs="0">
                <xs:complexType>
                  <xs:sequence>
                    <xs:element name="VehicleGroup" minOccurs="0" maxOccurs="unbounded">
                      <xs:complexType>
                        <xs:sequence>
                          <xs:element name="Day" minOccurs="0" maxOccurs="366">
                            <xs:complexType>
                              <xs:attribute name="Date" type="xs:date" use="required"/>
                              <xs:attribute name="Available" type="xs:int" use="required"/>
                              <xs:attribute name="Status" type="xs:string" use="required"/>
                              <xs:attribute name="Reason" type="xs:string"/>
                            </xs:complexType>
                          </xs:element>
                        </xs:sequence>
                        <xs:attribute name="Code" type="Code" use="required"/>
                        <xs:attribute name="FleetSize" type="xs:int"/>
                      </xs:complexType>
                    </xs:element>
                  </xs:sequence>
                  <xs:attribute name="From" type="xs:date"/>
                  <xs:attribute name="To" type="xs:date"/>
                </xs:complexType>
              </xs:element>
            </xs:sequence></xs:complexType>
          </xs:element>
          <xs:element name="AvailabilityResponse">
            <xs:complexType><xs:sequence>
              <xs:element name="Header" type="ResponseHeader"/>
              <xs:element name="Offers" minOccurs="0">
                <xs:complexType><xs:sequence><xs:element name="Offer" type="Offer" minOccurs="0" maxOccurs="unbounded"/></xs:sequence></xs:complexType>
              </xs:element>
            </xs:sequence></xs:complexType>
          </xs:element>
          <xs:element name="QuoteResponse">
            <xs:complexType><xs:sequence>
              <xs:element name="Header" type="ResponseHeader"/>
              <xs:element name="Offer" type="Offer" minOccurs="0"/>
            </xs:sequence></xs:complexType>
          </xs:element>
          <xs:complexType name="ReservationResponse">
            <xs:sequence>
              <xs:element name="Header" type="ResponseHeader"/>
              <xs:element name="Reservation" type="Reservation" minOccurs="0"/>
            </xs:sequence>
          </xs:complexType>
          <xs:element name="ReservationCreateResponse" type="ReservationResponse"/>
          <xs:element name="ReservationStatusResponse" type="ReservationResponse"/>
          <xs:element name="ReservationModifyResponse" type="ReservationResponse"/>
          <xs:element name="ReservationCancelResponse" type="ReservationResponse"/>
        </xs:schema>
        """;

    static String nativeXsd() { return NATIVE_XSD; }

    static final String[][] OTA_OPERATIONS = {
        {"OTA_VehLocSearch", "Stations sold on this channel, with phone, position, opening hours and after-hours rules"},
        {"OTA_VehAvailRate", "Live availability and prices; returns offer ids, covers, tax and mileage"},
        {"OTA_VehRes", "Book from an offer (or dates + SIPP code)"},
        {"OTA_VehRetRes", "Retrieve a booking by our number or the broker reference"},
        {"OTA_VehModify", "Amend dates, car group, extras, covers or driver"},
        {"OTA_VehCancel", "Cancel, with the fee and refund that apply"},
    };

    /** WSDL 1.1, document/literal over SOAP 1.1 and 1.2, one operation per OTA message pair. */
    static String wsdl(String address) {
        String ota = OtaXml.OTA_NAMESPACE;
        StringBuilder types = new StringBuilder(), messages = new StringBuilder(), ops = new StringBuilder(),
            b11 = new StringBuilder(), b12 = new StringBuilder();
        for (String[] op : OTA_OPERATIONS) {
            String n = op[0];
            types.append("      <xs:element name=\"").append(n).append("RQ\" type=\"xs:anyType\"/>\n")
                 .append("      <xs:element name=\"").append(n).append("RS\" type=\"xs:anyType\"/>\n");
            messages.append("  <wsdl:message name=\"").append(n).append("RQ\"><wsdl:part name=\"body\" element=\"ota:").append(n).append("RQ\"/></wsdl:message>\n")
                    .append("  <wsdl:message name=\"").append(n).append("RS\"><wsdl:part name=\"body\" element=\"ota:").append(n).append("RS\"/></wsdl:message>\n");
            ops.append("    <wsdl:operation name=\"").append(n).append("\">\n")
               .append("      <wsdl:documentation>").append(OtaXml.escape(op[1])).append("</wsdl:documentation>\n")
               .append("      <wsdl:input message=\"tns:").append(n).append("RQ\"/>\n")
               .append("      <wsdl:output message=\"tns:").append(n).append("RS\"/>\n")
               .append("    </wsdl:operation>\n");
            for (StringBuilder b : new StringBuilder[]{b11, b12}) {
                String p = b == b11 ? "soap" : "soap12";
                b.append("    <wsdl:operation name=\"").append(n).append("\">\n")
                 .append("      <").append(p).append(":operation soapAction=\"").append(ota).append('/').append(n).append("\" style=\"document\"/>\n")
                 .append("      <wsdl:input><").append(p).append(":body use=\"literal\"/></wsdl:input>\n")
                 .append("      <wsdl:output><").append(p).append(":body use=\"literal\"/></wsdl:output>\n")
                 .append("    </wsdl:operation>\n");
            }
        }
        String addr = OtaXml.escape(address);
        return """
            <?xml version="1.0" encoding="UTF-8"?>
            <wsdl:definitions name="NctRentalOtaVehicle"
                targetNamespace="urn:nct-rental:ota:soap"
                xmlns:tns="urn:nct-rental:ota:soap"
                xmlns:ota="%1$s"
                xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
                xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
                xmlns:soap12="http://schemas.xmlsoap.org/wsdl/soap12/"
                xmlns:xs="http://www.w3.org/2001/XMLSchema">
              <wsdl:documentation>
                NCT Rental OpenTravel (OTA 2003/05) car rental booking service. Message bodies follow the OpenTravel
                schemas for each RQ/RS pair. Authenticate with WS-Security UsernameToken (Username = channel code,
                Password = API key), POS/Source/RequestorID MessagePassword, or the X-Api-Key HTTP header.
              </wsdl:documentation>
              <wsdl:types>
                <xs:schema targetNamespace="%1$s" elementFormDefault="qualified">
            %2$s    </xs:schema>
              </wsdl:types>
            %3$s  <wsdl:portType name="OtaVehiclePortType">
            %4$s  </wsdl:portType>
              <wsdl:binding name="OtaVehicleSoap11" type="tns:OtaVehiclePortType">
                <soap:binding transport="http://schemas.xmlsoap.org/soap/http" style="document"/>
            %5$s  </wsdl:binding>
              <wsdl:binding name="OtaVehicleSoap12" type="tns:OtaVehiclePortType">
                <soap12:binding transport="http://schemas.xmlsoap.org/soap/http" style="document"/>
            %6$s  </wsdl:binding>
              <wsdl:service name="OtaVehicleService">
                <wsdl:port name="OtaVehicleSoap11Port" binding="tns:OtaVehicleSoap11"><soap:address location="%7$s"/></wsdl:port>
                <wsdl:port name="OtaVehicleSoap12Port" binding="tns:OtaVehicleSoap12"><soap12:address location="%7$s"/></wsdl:port>
              </wsdl:service>
            </wsdl:definitions>
            """.formatted(ota, types, messages, ops, b11, b12, addr);
    }
}
