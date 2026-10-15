package com.carrental.backend.service;

import com.carrental.backend.model.RentalAgreement;
import com.carrental.backend.repository.RentalAgreementRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class RentalAgreementService {

    private static final Logger logger = LoggerFactory.getLogger(RentalAgreementService.class);

    @Autowired
    private RentalAgreementRepository agreementRepository;

    /**
     * Create new rental agreement from reservation
     */
    @Transactional
    public RentalAgreement createAgreement(Map<String, Object> agreementData) {
        logger.info("Creating new rental agreement");

        RentalAgreement agreement = new RentalAgreement();

        // Customer Information
        agreement.setCustomerFullName((String) agreementData.get("customerFullName"));
        agreement.setCustomerEmail((String) agreementData.get("customerEmail"));
        agreement.setCustomerPhone((String) agreementData.get("customerPhone"));
        agreement.setCustomerAddress((String) agreementData.get("customerAddress"));
        agreement.setCustomerCity((String) agreementData.get("customerCity"));
        agreement.setCustomerCountry((String) agreementData.get("customerCountry"));
        agreement.setCustomerPostalCode((String) agreementData.get("customerPostalCode"));

        // Driver License
        agreement.setLicenseNumber((String) agreementData.get("licenseNumber"));
        agreement.setLicenseCountry((String) agreementData.get("licenseCountry"));
        agreement.setDriverAge((Integer) agreementData.get("driverAge"));

        // Rental Details
        agreement.setPickupDate((LocalDateTime) agreementData.get("pickupDate"));
        agreement.setReturnDate((LocalDateTime) agreementData.get("returnDate"));
        agreement.setRentalDays((int) ChronoUnit.DAYS.between(
            agreement.getPickupDate(),
            agreement.getReturnDate()
        ));
        agreement.setPickupLocation((String) agreementData.get("pickupLocation"));
        agreement.setReturnLocation((String) agreementData.get("returnLocation"));
        agreement.setOneWay(!agreement.getPickupLocation().equals(agreement.getReturnLocation()));

        // Vehicle Information
        agreement.setVehicleMake((String) agreementData.get("vehicleMake"));
        agreement.setVehicleModel((String) agreementData.get("vehicleModel"));
        agreement.setVehicleYear((Integer) agreementData.get("vehicleYear"));
        agreement.setVehicleCategory((String) agreementData.get("vehicleCategory"));
        agreement.setLicensePlate((String) agreementData.get("licensePlate"));

        // Pricing
        agreement.setDailyRate((BigDecimal) agreementData.get("dailyRate"));
        agreement.setBaseRentalCost(
            agreement.getDailyRate().multiply(BigDecimal.valueOf(agreement.getRentalDays()))
        );

        // Additional Fees
        agreement.setAirportFee((BigDecimal) agreementData.getOrDefault("airportFee", BigDecimal.ZERO));
        agreement.setYoungDriverFee((BigDecimal) agreementData.getOrDefault("youngDriverFee", BigDecimal.ZERO));
        agreement.setAdditionalDriverFee((BigDecimal) agreementData.getOrDefault("additionalDriverFee", BigDecimal.ZERO));
        agreement.setOneWayFee((BigDecimal) agreementData.getOrDefault("oneWayFee", BigDecimal.ZERO));

        // Extras & Insurance
        agreement.setExtrasCost((BigDecimal) agreementData.getOrDefault("extrasCost", BigDecimal.ZERO));
        agreement.setInsuranceCost((BigDecimal) agreementData.getOrDefault("insuranceCost", BigDecimal.ZERO));
        agreement.setInsuranceType((String) agreementData.get("insuranceType"));

        // Deposits
        agreement.setSecurityDeposit((BigDecimal) agreementData.get("securityDeposit"));
        agreement.setExcessAmount((BigDecimal) agreementData.get("excessAmount"));

        // Currency
        agreement.setCurrency((String) agreementData.getOrDefault("currency", "USD"));

        // Calculate totals
        agreement.calculateTotals();

        // Set tax
        agreement.setTaxPercentage(10.0); // Default 10%

        // Terms & Conditions
        agreement.setTermsAndConditions(generateTermsAndConditions());
        agreement.setCancellationPolicy(generateCancellationPolicy());
        agreement.setFuelPolicy(generateFuelPolicy());

        // Mileage
        agreement.setIncludedMileage((Integer) agreementData.getOrDefault("includedMileage", 0));
        agreement.setExtraMileageCharge((BigDecimal) agreementData.get("extraMileageCharge"));

        // Set initial status
        agreement.setAgreementStatus(RentalAgreement.AgreementStatus.DRAFT);
        agreement.setPaymentStatus(RentalAgreement.PaymentStatus.PENDING);

        return agreementRepository.save(agreement);
    }

    /**
     * Sign agreement (customer signature)
     */
    @Transactional
    public RentalAgreement signAgreementByCustomer(
            String agreementId,
            String signatureData,
            String ipAddress
    ) {
        RentalAgreement agreement = agreementRepository.findById(agreementId)
            .orElseThrow(() -> new RuntimeException("Agreement not found"));

        agreement.setCustomerSignature(signatureData);
        agreement.setCustomerSignedAt(LocalDateTime.now());
        agreement.setIpAddress(ipAddress);
        agreement.setAgreementStatus(RentalAgreement.AgreementStatus.PENDING_SIGNATURE);

        logger.info("Agreement {} signed by customer", agreement.getAgreementNumber());
        return agreementRepository.save(agreement);
    }

    /**
     * Sign agreement (agent signature)
     */
    @Transactional
    public RentalAgreement signAgreementByAgent(
            String agreementId,
            String agentName,
            String signatureData
    ) {
        RentalAgreement agreement = agreementRepository.findById(agreementId)
            .orElseThrow(() -> new RuntimeException("Agreement not found"));

        agreement.setAgentName(agentName);
        agreement.setAgentSignature(signatureData);
        agreement.setAgentSignedAt(LocalDateTime.now());
        agreement.setSigned(true);
        agreement.setSignedAt(LocalDateTime.now());
        agreement.setAgreementStatus(RentalAgreement.AgreementStatus.SIGNED);

        logger.info("Agreement {} signed by agent {}", agreement.getAgreementNumber(), agentName);
        return agreementRepository.save(agreement);
    }

    /**
     * Activate agreement
     */
    @Transactional
    public RentalAgreement activateAgreement(String agreementId) {
        RentalAgreement agreement = agreementRepository.findById(agreementId)
            .orElseThrow(() -> new RuntimeException("Agreement not found"));

        if (!agreement.isSigned()) {
            throw new RuntimeException("Agreement must be signed before activation");
        }

        agreement.setAgreementStatus(RentalAgreement.AgreementStatus.ACTIVE);
        agreement.setActive(true);

        logger.info("Agreement {} activated", agreement.getAgreementNumber());
        return agreementRepository.save(agreement);
    }

    /**
     * Complete agreement (at return)
     */
    @Transactional
    public RentalAgreement completeAgreement(
            String agreementId,
            Integer odometerEnd,
            String fuelLevelEnd,
            BigDecimal additionalCharges
    ) {
        RentalAgreement agreement = agreementRepository.findById(agreementId)
            .orElseThrow(() -> new RuntimeException("Agreement not found"));

        agreement.setOdometerEnd(odometerEnd);
        agreement.setFuelLevelEnd(fuelLevelEnd);

        // Calculate actual mileage
        if (agreement.getOdometerStart() != null && odometerEnd != null) {
            agreement.setActualMileage(odometerEnd - agreement.getOdometerStart());
        }

        // Add any additional charges
        if (additionalCharges != null && additionalCharges.compareTo(BigDecimal.ZERO) > 0) {
            agreement.setTotalAmount(agreement.getTotalAmount().add(additionalCharges));
            agreement.setAmountDue(agreement.getAmountDue().add(additionalCharges));
        }

        agreement.setAgreementStatus(RentalAgreement.AgreementStatus.COMPLETED);
        agreement.setCompletedAt(LocalDateTime.now());

        logger.info("Agreement {} completed", agreement.getAgreementNumber());
        return agreementRepository.save(agreement);
    }

    /**
     * Void agreement
     */
    @Transactional
    public RentalAgreement voidAgreement(String agreementId, String reason) {
        RentalAgreement agreement = agreementRepository.findById(agreementId)
            .orElseThrow(() -> new RuntimeException("Agreement not found"));

        agreement.setAgreementStatus(RentalAgreement.AgreementStatus.VOIDED);
        agreement.setActive(false);
        agreement.setVoidedAt(LocalDateTime.now());
        agreement.setNotes(agreement.getNotes() + "\nVOID REASON: " + reason);

        logger.info("Agreement {} voided. Reason: {}", agreement.getAgreementNumber(), reason);
        return agreementRepository.save(agreement);
    }

    /**
     * Record payment
     */
    @Transactional
    public RentalAgreement recordPayment(
            String agreementId,
            BigDecimal amount,
            RentalAgreement.PaymentMethod method,
            String authorizationCode
    ) {
        RentalAgreement agreement = agreementRepository.findById(agreementId)
            .orElseThrow(() -> new RuntimeException("Agreement not found"));

        agreement.setAmountPaid(agreement.getAmountPaid().add(amount));
        agreement.setAmountDue(agreement.getAmountDue().subtract(amount));
        agreement.setPaymentMethod(method);
        agreement.setPaymentAuthorizationCode(authorizationCode);

        if (agreement.getAmountDue().compareTo(BigDecimal.ZERO) <= 0) {
            agreement.setPaymentStatus(RentalAgreement.PaymentStatus.PAID);
        } else {
            agreement.setPaymentStatus(RentalAgreement.PaymentStatus.PARTIAL);
        }

        logger.info("Payment of {} recorded for agreement {}", amount, agreement.getAgreementNumber());
        return agreementRepository.save(agreement);
    }

    /**
     * Get agreement by number
     */
    public Optional<RentalAgreement> getAgreementByNumber(String agreementNumber) {
        return agreementRepository.findByAgreementNumber(agreementNumber);
    }

    /**
     * Get agreement by reservation ID
     */
    public Optional<RentalAgreement> getAgreementByReservationId(String reservationId) {
        return agreementRepository.findByReservationId(reservationId);
    }

    /**
     * Get unsigned agreements
     */
    public List<RentalAgreement> getUnsignedAgreements() {
        return agreementRepository.findUnsignedAgreements();
    }

    /**
     * Generate professional terms and conditions
     */
    private String generateTermsAndConditions() {
        return """
            RENTAL AGREEMENT TERMS AND CONDITIONS

            This Rental Agreement ("Agreement") is entered into between NCT Rental ("Company", "We", "Us") and the customer identified above ("Renter", "You").

            1. RENTAL PERIOD AND EXTENSION
            1.1 The vehicle shall be rented for the period specified in this Agreement.
            1.2 Late returns beyond 59 minutes incur full additional day charges.
            1.3 Extensions require prior authorization. Unauthorized extensions may result in vehicle recovery and additional charges.
            1.4 The Company reserves the right to terminate this Agreement if the return date extends beyond the maximum rental period.

            2. DRIVER ELIGIBILITY AND REQUIREMENTS
            2.1 Primary driver must be at least 21 years of age (25+ for premium vehicles).
            2.2 Must hold a valid driver's license for a minimum of 2 years from country of residence.
            2.3 Must present valid government-issued photo identification and credit card in driver's name.
            2.4 International drivers must present passport, valid driver's license, and International Driving Permit (IDP) where required.
            2.5 Young drivers (21-24) are subject to additional fees and vehicle restrictions.
            2.6 Additional drivers must meet the same requirements and be registered on this Agreement.

            3. PERMITTED AND PROHIBITED USE
            3.1 The vehicle may only be driven by the Renter or authorized Additional Drivers listed in this Agreement.
            3.2 PROHIBITED USES - The vehicle must NOT be:
                • Driven by any unauthorized person
                • Used for hire, reward, or commercial purposes
                • Used to carry passengers or property for compensation
                • Used for racing, rallying, pacing, testing vehicle reliability or speed
                • Used to tow or push any vehicle, trailer, or other object
                • Driven off-road, on unsealed roads, beaches, or in flood conditions
                • Used to transport illegal substances, contraband, or for illegal purposes
                • Driven under the influence of alcohol, drugs, or medication that impairs driving ability
                • Overloaded beyond manufacturer's specifications
                • Used outside the permitted territory without prior written authorization
            3.3 The vehicle may not be taken outside Jordan without explicit written permission.

            4. INSURANCE, LIABILITY, AND DAMAGE RESPONSIBILITY
            4.1 Basic Third-Party Liability Insurance is included, covering damage to third parties up to statutory limits.
            4.2 COLLISION DAMAGE WAIVER (CDW): If purchased, limits Renter's liability for vehicle damage to the excess amount specified.
            4.3 THEFT PROTECTION (TP): If purchased, limits Renter's liability for theft to the excess amount specified.
            4.4 The Renter is responsible for ALL damage to the vehicle and third-party claims up to the excess amount.
            4.5 Coverage is VOID if:
                • Damage occurs during prohibited use
                • Driver under influence of alcohol/drugs (legal limit applies)
                • Renter fails to report accident/theft to police and Company within 24 hours
                • False information provided in accident report
                • Vehicle driven by unauthorized driver
            4.6 Renter must reimburse all costs if insurance coverage is voided.
            4.7 Additional charges apply for: Tires, windscreen, undercarriage damage, lost keys, interior damage, and smoking in vehicle.

            5. RENTER'S OBLIGATIONS AND RESPONSIBILITIES
            5.1 Conduct pre-rental and post-rental vehicle inspections and sign inspection reports.
            5.2 Maintain vehicle in good condition, check fluids, tire pressure regularly.
            5.3 Lock vehicle and secure keys at all times; report lost keys immediately.
            5.4 Report accidents, damage, or theft to police and Company immediately (within 24 hours).
            5.5 Obtain police report for all accidents, theft, or damage incidents.
            5.6 Return vehicle on time, to specified location, in same condition as received.
            5.7 Pay all fines, tolls, parking fees, traffic violations incurred during rental period.
            5.8 Not modify, alter, or tamper with vehicle in any way.

            6. FUEL POLICY
            6.1 FULL-TO-FULL POLICY: Vehicle provided with full tank and must be returned with full tank.
            6.2 Refueling receipts must be from within 10km of return location and within 2 hours of return.
            6.3 If not returned full, refueling charges apply: Cost of missing fuel + 25% service fee (minimum $30).
            6.4 Only use fuel type specified in vehicle manual. Damage from incorrect fuel is Renter's responsibility.

            7. PAYMENT, DEPOSITS, AND CHARGES
            7.1 Rental charges are due at commencement of rental. Full payment required before vehicle release.
            7.2 Security deposit will be pre-authorized on credit card and held for 14-21 business days post-return.
            7.3 Deposit will cover: Additional charges, fines, damage, fuel, cleaning, or violations.
            7.4 Additional charges may include: Extra days, one-way fees, additional driver fees, young driver fees, airport surcharges, late return fees, toll fees, traffic fines, fuel charges, cleaning fees, smoking fees, damage repairs, key replacement, towing costs.
            7.5 Final invoice will be provided within 7 days of vehicle return.
            7.6 Traffic fines and toll charges will be billed with $15 administrative fee per violation.
            7.7 All prices in USD unless otherwise specified. Exchange rates apply for foreign currency payments.

            8. CANCELLATION AND MODIFICATION POLICY
            8.1 FREE CANCELLATION: Up to 48 hours before pickup time - Full refund
            8.2 LATE CANCELLATION: 24-48 hours before pickup - 50% charge of first day rate
            8.3 VERY LATE CANCELLATION: Less than 24 hours before pickup - 100% charge of first day rate
            8.4 NO-SHOW: Failure to pickup - 100% charge, no refund
            8.5 Modifications subject to availability and may incur rate changes.
            8.6 Cancellations/modifications must be made through official channels (email/phone/website).
            8.7 Refunds processed within 7-14 business days to original payment method.

            9. MILEAGE POLICY
            9.1 UNLIMITED MILEAGE included for all standard rentals within Jordan.
            9.2 If mileage limit applies (specified in Agreement), excess mileage charged at rate specified.
            9.3 Odometer tampering results in immediate termination and legal action.

            10. ACCIDENTS, THEFT, AND BREAKDOWN
            10.1 In case of accident:
                 • Stop immediately and ensure safety of all parties
                 • Call emergency services if injuries occur
                 • Obtain police report (MANDATORY)
                 • Exchange information with other parties
                 • Document scene with photos
                 • Notify Company within 24 hours
                 • Complete Company accident report form
            10.2 In case of theft:
                 • Report to police immediately
                 • Obtain police report
                 • Notify Company within 24 hours
                 • Provide all keys and documentation
            10.3 In case of breakdown:
                 • Move vehicle to safe location
                 • Contact Company roadside assistance (24/7 number provided)
                 • Do not arrange unauthorized repairs
            10.4 Failure to follow procedures may void insurance coverage.

            11. FINES, TOLLS, AND TRAFFIC VIOLATIONS
            11.1 Renter is responsible for all traffic violations, parking fines, toll charges during rental period.
            11.2 Company will charge Renter's credit card for any fines/tolls received + $15 administrative fee.
            11.3 Renter must pay fines directly if possible to avoid administrative fees.
            11.4 Failure to pay fines may result in travel restrictions or legal action.

            12. VEHICLE RETURN CONDITIONS
            12.1 Return vehicle on scheduled date/time to specified location.
            12.2 Vehicle must be in same condition as received (normal wear excepted).
            12.3 Interior must be clean and free of excessive dirt, stains, or odors.
            12.4 Smoking in vehicle prohibited - $250 deep cleaning fee applies.
            12.5 Pet transportation requires prior approval and pet fee.
            12.6 After-hours returns require prior arrangement and must follow specified procedures.
            12.7 Keys and all vehicle documentation must be returned.

            13. PERSONAL BELONGINGS
            13.1 Company not liable for personal belongings left in vehicle.
            13.2 Items found will be held for 30 days; collection fee may apply.

            14. CROSS-BORDER AND TERRITORIAL RESTRICTIONS
            14.1 Vehicle may NOT leave Jordan without written authorization.
            14.2 Unauthorized cross-border travel voids all insurance and coverage.
            14.3 GPS tracking enabled - unauthorized territorial violations will be detected.

            15. DATA PROTECTION AND PRIVACY
            15.1 Personal data collected in accordance with our Privacy Policy.
            15.2 Data may be shared with: Insurance providers, authorities (if required), payment processors.
            15.3 Vehicle may be equipped with GPS tracking for security and fleet management.

            16. FORCE MAJEURE
            16.1 Company not liable for delays/failures due to circumstances beyond reasonable control.
            16.2 Includes: Natural disasters, war, strikes, government action, pandemic.

            17. DISPUTE RESOLUTION AND GOVERNING LAW
            17.1 This Agreement governed by laws of Jordan.
            17.2 Disputes subject to exclusive jurisdiction of Jordanian courts.
            17.3 Renter waives right to class action lawsuits.

            18. ENTIRE AGREEMENT
            18.1 This Agreement constitutes entire agreement between parties.
            18.2 Supersedes all prior agreements, representations, or understandings.
            18.3 Amendments must be in writing and signed by both parties.
            18.4 If any provision deemed invalid, remaining provisions remain in effect.

            19. ACKNOWLEDGMENT AND ACCEPTANCE
            By signing below, Renter acknowledges:
            • Having read, understood, and agreed to all terms and conditions
            • Received vehicle in good condition with fuel level and mileage as documented
            • Accepts full responsibility as outlined in this Agreement
            • Confirms all information provided is true and accurate
            • Authorizes Company to charge credit card for any amounts due
            • Has been offered and understands optional insurance coverages

            CUSTOMER SUPPORT: Available 24/7 | Emergency: [Emergency Number]

            This is a legally binding agreement. Please read carefully before signing.
            """;
    }

    /**
     * Generate cancellation policy
     */
    private String generateCancellationPolicy() {
        return """
            CANCELLATION POLICY

            - More than 48 hours before pickup: Full refund
            - 24-48 hours before pickup: 50% refund
            - Less than 24 hours before pickup: No refund
            - No-show: No refund

            Cancellations must be made through our official channels.
            Refunds will be processed within 7-14 business days.
            """;
    }

    /**
     * Generate fuel policy
     */
    private String generateFuelPolicy() {
        return """
            FUEL POLICY

            FULL-TO-FULL POLICY:
            - Vehicle is provided with a full tank of fuel
            - Vehicle must be returned with a full tank
            - Refueling receipts must be from within 10km of return location
            - Failure to refuel will result in refueling charge plus service fee

            REFUELING CHARGES:
            - Missing fuel will be charged at premium rate
            - Service fee will apply for refueling service

            Please retain all fuel receipts for your records.
            """;
    }

    /**
     * Generate agreement PDF (placeholder)
     */
    public byte[] generateAgreementPDF(String agreementId) {
        // TODO: Implement PDF generation using iText or similar library
        logger.info("Generating PDF for agreement {}", agreementId);
        return new byte[0];
    }
}
