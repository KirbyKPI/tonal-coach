import { describe, expect, it } from "vitest";
import { MAX_CLIENT_LABEL_LENGTH, validateClientLabel } from "./clientProfiles";

describe("validateClientLabel", () => {
  it("returns the trimmed label on the happy path", () => {
    expect(validateClientLabel("Adam Kofinas")).toBe("Adam Kofinas");
  });

  it("strips leading and trailing whitespace", () => {
    expect(validateClientLabel("   Adam Kofinas   ")).toBe("Adam Kofinas");
    expect(validateClientLabel("\t Eunice Reger\n")).toBe("Eunice Reger");
  });

  it("rejects empty strings", () => {
    expect(() => validateClientLabel("")).toThrow("Client name cannot be empty");
  });

  it("rejects whitespace-only input", () => {
    expect(() => validateClientLabel("   ")).toThrow("Client name cannot be empty");
    expect(() => validateClientLabel("\t\n")).toThrow("Client name cannot be empty");
  });

  it(`rejects labels longer than ${MAX_CLIENT_LABEL_LENGTH} characters after trimming`, () => {
    const tooLong = "a".repeat(MAX_CLIENT_LABEL_LENGTH + 1);
    expect(() => validateClientLabel(tooLong)).toThrow(/too long/);
  });

  it(`accepts labels exactly ${MAX_CLIENT_LABEL_LENGTH} characters long`, () => {
    const maxLabel = "a".repeat(MAX_CLIENT_LABEL_LENGTH);
    expect(validateClientLabel(maxLabel)).toHaveLength(MAX_CLIENT_LABEL_LENGTH);
  });

  it("uses trimmed length for the max check, not raw length", () => {
    const withPadding = "   " + "a".repeat(MAX_CLIENT_LABEL_LENGTH) + "   ";
    expect(validateClientLabel(withPadding)).toHaveLength(MAX_CLIENT_LABEL_LENGTH);
  });
});
