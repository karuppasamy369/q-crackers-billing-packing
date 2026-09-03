import { describe, it, expect } from "vitest";
import { slugify, isValidSlug } from "./slug";

describe("slugify", () => {
  it("lower-cases, replaces runs of non-alphanumerics with a hyphen", () => {
    expect(slugify("1000 Wala")).toBe("1000-wala");
    expect(slugify("30 cm Colour Sparklers (Pkt of 10)")).toBe(
      "30-cm-colour-sparklers-pkt-of-10",
    );
  });

  it("strips leading/trailing separators and diacritics", () => {
    expect(slugify("  --Hello--  ")).toBe("hello");
    expect(slugify("Café Crème")).toBe("cafe-creme");
  });

  it("truncates to 80 chars without a trailing hyphen", () => {
    const s = slugify("a".repeat(100));
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("isValidSlug", () => {
  it("accepts clean slugs, rejects malformed ones", () => {
    expect(isValidSlug("1000-wala")).toBe(true);
    expect(isValidSlug("abc")).toBe(true);
    expect(isValidSlug("-abc")).toBe(false);
    expect(isValidSlug("abc-")).toBe(false);
    expect(isValidSlug("abc--def")).toBe(false);
    expect(isValidSlug("Abc")).toBe(false);
    expect(isValidSlug("a b")).toBe(false);
  });
});
