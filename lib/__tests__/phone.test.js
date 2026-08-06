import { describe, it, expect } from "vitest";
import { normalizePhoneToE164 } from "../phone";

describe("normalizePhoneToE164", () => {
  it("passes through a UY number already in dial+number form (no +)", () => {
    expect(normalizePhoneToE164("59899111222")).toBe("+59899111222");
  });

  it("passes through an Argentina number already in dial+number form", () => {
    expect(normalizePhoneToE164("5491112345678")).toBe("+5491112345678");
  });

  it("normalizes a number already prefixed with +", () => {
    expect(normalizePhoneToE164("+598 99 111 222")).toBe("+59899111222");
  });

  it("normalizes legacy Uruguay-local format with leading trunk 0", () => {
    expect(normalizePhoneToE164("099 111 222")).toBe("+59899111222");
  });

  it("normalizes legacy Uruguay-local format with dashes", () => {
    expect(normalizePhoneToE164("099-111-222")).toBe("+59899111222");
  });

  it("strips trunk 0 when dial is followed by a leading 0 (UY)", () => {
    // El PhoneInput concatena dial + lo tipeado por el usuario; si tipea "099..."
    // termina en "598099...", que no es E.164 válido y no matchea el wa_id de Meta.
    expect(normalizePhoneToE164("598099111222")).toBe("+59899111222");
  });

  it("strips trunk 0 for Argentina numbers with the dial+0 shape", () => {
    // AR móvil: 11 1234 5678 con trunk 0 = "01112345678", con dial 54 = "5401112345678"
    expect(normalizePhoneToE164("5401112345678")).toBe("+541112345678");
  });

  it("normalizes a bare 8-digit number with no dial and no leading 0 as Uruguay", () => {
    expect(normalizePhoneToE164("99111222")).toBe("+59899111222");
  });

  it("does not misdetect a Uruguay number as US (dial '1')", () => {
    expect(normalizePhoneToE164("59899111222")).toBe("+59899111222");
  });

  it("returns null for a bare dial code with no number attached", () => {
    expect(normalizePhoneToE164("598")).toBeNull();
  });

  it("returns null for a number that doesn't match any known format", () => {
    expect(normalizePhoneToE164("12345")).toBeNull();
  });

  it("returns null for empty or missing input", () => {
    expect(normalizePhoneToE164("")).toBeNull();
    expect(normalizePhoneToE164(null)).toBeNull();
    expect(normalizePhoneToE164(undefined)).toBeNull();
  });
});
