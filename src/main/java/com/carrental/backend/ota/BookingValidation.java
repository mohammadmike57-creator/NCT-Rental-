package com.carrental.backend.ota;

import com.carrental.backend.ota.ChannelError.ChannelException;
import com.carrental.backend.ota.ChannelModels.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Period;

/**
 * The checks every broker search, booking and change passes before it is priced or stored: dates and
 * rental length, the channel's commercial limits, branches and their opening hours (holidays included),
 * the driver's age and the customer's details. Each failure is a {@link ChannelError} the broker sees.
 */
final class BookingValidation {

    private BookingValidation() {}


    static void validate(ChannelBookingService.Ctx c, Search s) {
        if (s.pickupAt() == null || s.returnAt() == null) throw ChannelError.INVALID_DATE.ex("Pick-up and return date and time are required");
        if (!s.returnAt().isAfter(s.pickupAt())) throw ChannelError.INVALID_DATE.ex("Return must be after pick-up");
        LocalDateTime now = c.rules().now();
        if (s.pickupAt().isBefore(now.plusHours(c.rules().minLeadHours()))) {
            throw ChannelError.INVALID_DATE.ex("Pick-up must be at least " + c.rules().minLeadHours() + " hours from now");
        }
        if (s.pickupAt().isAfter(now.plusDays(c.rules().maxHorizonDays()))) {
            throw ChannelError.INVALID_DATE.ex("Bookings are accepted up to " + c.rules().maxHorizonDays() + " days ahead");
        }
        int days = OtaXml.rentalDays(s.pickupAt(), s.returnAt(), c.rules().graceMinutes());
        if (days > c.rules().maxRentalDays()) throw ChannelError.INVALID_DATE.ex("The longest rental is " + c.rules().maxRentalDays() + " days");
        ChannelCommercial com = ChannelCommercial.of(c.channel().raw().path("bookingRules"));
        if (days < com.minRentalDays()) throw ChannelError.INVALID_DATE.ex("The shortest rental is " + com.minRentalDays() + " days");
        if (com.closedToArrival().contains(s.pickupAt().toLocalDate())) throw ChannelError.INVALID_DATE.ex("No pick-ups on " + s.pickupAt().toLocalDate());
        if (com.closedToDeparture().contains(s.returnAt().toLocalDate())) throw ChannelError.INVALID_DATE.ex("No returns on " + s.returnAt().toLocalDate());
        ChannelRules.Location p = c.rules().location(s.pickupLocation());
        ChannelRules.Location r = c.rules().location(s.returnLocation());
        if (p == null) throw ChannelError.INVALID_LOCATION.ex("Unknown pick-up location " + s.pickupLocation());
        if (r == null) throw ChannelError.INVALID_LOCATION.ex("Unknown return location " + s.returnLocation());
        if (!p.pickup()) throw ChannelError.INVALID_LOCATION.ex(p.code() + " does not allow pick-ups");
        if (!r.dropOff()) throw ChannelError.INVALID_LOCATION.ex(r.code() + " does not allow returns");
        closedDay(p, s.pickupAt(), "pick-up");
        closedDay(r, s.returnAt(), "return");
        if (!p.openAt(s.pickupAt()) && !p.afterHoursPickup()) {
            throw ChannelError.INVALID_DATE.ex(p.code() + " is closed at " + s.pickupAt().toLocalTime() + " on " + s.pickupAt().getDayOfWeek() + hoursText(p, s.pickupAt()));
        }
        if (!r.openAt(s.returnAt()) && !r.afterHoursReturn()) {
            throw ChannelError.INVALID_DATE.ex(r.code() + " is closed at " + s.returnAt().toLocalTime() + " on " + s.returnAt().getDayOfWeek() + hoursText(r, s.returnAt()));
        }
        if (s.driverAge() != null) checkAge(c, s.driverAge());
    }

    /** A branch closed for a holiday takes no pick-ups or returns that day, not even after hours. */
    private static void closedDay(ChannelRules.Location l, LocalDateTime t, String what) {
        ChannelRules.SpecialDay sd = l.specialDays().get(t.toLocalDate());
        if (sd != null && sd.closed()) {
            throw ChannelError.INVALID_DATE.ex(l.code() + " is closed on " + t.toLocalDate() + (sd.note().isEmpty() ? "" : " (" + sd.note() + ")") + ": no " + what + " that day");
        }
    }

    private static String hoursText(ChannelRules.Location l, LocalDateTime t) {
        ChannelRules.SpecialDay sd = l.specialDays().get(t.toLocalDate());
        if (sd != null) return " (" + (sd.note().isEmpty() ? "special hours" : sd.note()) + ": open " + sd.open() + "-" + sd.close() + ")";
        ChannelRules.Hours h = l.hours().get(t.getDayOfWeek());
        return h == null ? " (closed all day)" : " (open " + h.open() + "-" + h.close() + ")";
    }

    /** The driver's age at pick-up from the date of birth, when the search did not give one. */
    static Search withDriverAge(Search s, Driver d) {
        if (s.driverAge() != null || d == null || trim(d.dateOfBirth()).length() < 10) return s;
        try {
            return s.with(Period.between(LocalDate.parse(d.dateOfBirth().trim().substring(0, 10)), s.pickupAt().toLocalDate()).getYears());
        } catch (Exception e) {
            return s;   // validateDriver reports the bad date
        }
    }

    private static void checkAge(ChannelBookingService.Ctx c, int age) {
        if (age < c.rules().minDriverAge()) throw ChannelError.POLICY_VIOLATION.ex("The driver must be at least " + c.rules().minDriverAge());
        if (c.rules().maxDriverAge() > 0 && age > c.rules().maxDriverAge()) throw ChannelError.POLICY_VIOLATION.ex("The driver must be at most " + c.rules().maxDriverAge());
    }

    static void validateCustomer(Customer cu) {
        if (cu == null || trim(cu.lastName()).isEmpty()) throw ChannelError.INVALID_REQUEST.ex("Customer last name is required");
        if (trim(cu.firstName()).length() > 100 || trim(cu.lastName()).length() > 100) throw ChannelError.INVALID_REQUEST.ex("Customer name is too long");
        String email = trim(cu.email());
        if (!email.isEmpty() && !email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) throw ChannelError.INVALID_REQUEST.ex("Customer email is not valid");
    }

    static void validateDriver(ChannelBookingService.Ctx c, Driver d, LocalDateTime pickup) {
        if (d == null || trim(d.dateOfBirth()).isEmpty()) return;
        try {
            LocalDate dob = LocalDate.parse(d.dateOfBirth().trim().substring(0, 10));
            checkAge(c, Period.between(dob, pickup.toLocalDate()).getYears());
        } catch (ChannelException e) {
            throw e;
        } catch (Exception e) {
            throw ChannelError.INVALID_REQUEST.ex("Driver date of birth must be YYYY-MM-DD");
        }
    }

    private static String trim(String s) { return s == null ? "" : s.trim(); }
}
