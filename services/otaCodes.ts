/**
 * OpenTravel code values the broker XML uses (the same list as the server's OtaCodes.java), taken from the
 * OpenTravel Alliance's own sample messages. Covers not listed here need the code the broker gives.
 */
export const KNOWN_COVERAGE_TYPES: Record<string, string> = {
  ALI: '1', CDW: '7', PDW: '31', PAI: '32', PEP: '35', SLI: '42',
};

/** A value OpenTravel accepts as a code (e.g. 7, 101, 101.EQP). */
export const isOtaCode = (value: string): boolean => /^[0-9A-Z]{1,3}(\.[A-Z]{3}(\.X)?)?$/.test(value);

/** The OTA coverage type a cover is sent with: the broker's code, else the official one, else none. */
export const coverageTypeFor = (code: string, channelCodes?: Record<string, string>): string | null => {
  const key = (code || '').trim().toUpperCase();
  const own = channelCodes?.[key]?.trim();
  if (own && isOtaCode(own)) return own;
  return KNOWN_COVERAGE_TYPES[key] ?? null;
};
