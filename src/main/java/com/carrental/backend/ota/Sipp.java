package com.carrental.backend.ota;

import java.util.Locale;

/**
 * Typical vehicle details read from an ACRISS (SIPP) code, used when staff have not entered the
 * group's details for a channel: category (1st letter) gives seats and bags, type (2nd) gives
 * doors, and fuel/air-con (4th) gives the fuel type.
 */
final class Sipp {
    private Sipp() {}

    record Spec(int seats, int doors, int largeBags, int smallBags, String fuel) {}

    static Spec spec(String code) {
        String c = code == null ? "" : code.toUpperCase(Locale.ROOT);
        char cat = c.length() > 0 ? c.charAt(0) : 'C';
        char type = c.length() > 1 ? c.charAt(1) : 'D';
        char fuel = c.length() > 3 ? c.charAt(3) : 'R';
        int seats = 5, large = 2, small = 1;
        switch (cat) {
            case 'M', 'N' -> { seats = 4; large = 1; small = 1; }
            case 'E', 'H' -> { large = 1; small = 2; }
            case 'C', 'D' -> { large = 2; small = 1; }
            case 'I', 'J' -> { large = 2; small = 2; }
            case 'S', 'R' -> { large = 3; small = 1; }
            case 'F', 'G', 'P', 'U', 'L', 'W', 'O', 'X' -> { large = 3; small = 2; }
            default -> { }
        }
        int doors = switch (type) {
            case 'B', 'S', 'T', 'N' -> 2;   // 2/3 door, sports, convertible, roadster
            case 'W', 'V', 'F', 'J', 'G', 'K', 'P', 'Q' -> 5;   // wagon, van, SUV, crossover, pick-up
            default -> 4;
        };
        if (type == 'V') { seats = cat == 'M' || cat == 'E' || cat == 'C' ? 7 : 9; large = 4; small = 2; }
        if (type == 'S' || type == 'T' || type == 'N') seats = Math.min(seats, 4);
        String f = switch (fuel) {
            case 'D', 'Q' -> "Diesel";
            case 'H', 'I' -> "Hybrid";
            case 'E', 'C' -> "Electric";
            case 'L', 'S' -> "LPGCompressedGas";
            case 'A', 'B' -> "Hydrogen";
            case 'M', 'F' -> "MultiFuel";
            case 'V', 'Z' -> "Petrol";
            case 'U', 'X' -> "Ethanol";
            default -> "Unspecified";
        };
        return new Spec(seats, doors, large, small, f);
    }
}
