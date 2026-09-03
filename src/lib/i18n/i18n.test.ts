import { describe, it, expect } from "vitest";
import { resolveLocale, isLocale, getDictionary, LOCALES } from "./index";

describe("resolveLocale", () => {
  it("uses the cookie when it names an enabled locale", () => {
    expect(
      resolveLocale({
        cookieValue: "ta",
        enabled: ["en", "ta"],
        fallback: "en",
      }),
    ).toBe("ta");
  });

  it("falls back when the cookie is missing, invalid, or disabled", () => {
    expect(
      resolveLocale({
        cookieValue: null,
        enabled: ["en", "ta"],
        fallback: "ta",
      }),
    ).toBe("ta");
    expect(
      resolveLocale({ cookieValue: "xx", enabled: ["en"], fallback: "en" }),
    ).toBe("en");
    expect(
      resolveLocale({ cookieValue: "ta", enabled: ["en"], fallback: "en" }),
    ).toBe("en");
  });

  it("never returns a disabled fallback", () => {
    expect(
      resolveLocale({ cookieValue: null, enabled: ["ta"], fallback: "en" }),
    ).toBe("ta");
  });
});

describe("dictionaries", () => {
  it("isLocale guards", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("English and Tamil dictionaries have identical key structure", () => {
    const flatten = (o: unknown, prefix = ""): string[] =>
      o && typeof o === "object"
        ? Object.entries(o).flatMap(([k, v]) =>
            flatten(v, prefix ? `${prefix}.${k}` : k),
          )
        : [prefix];

    const en = flatten(getDictionary("en")).sort();
    const ta = flatten(getDictionary("ta")).sort();
    expect(ta).toEqual(en);
  });

  it("every locale resolves to a non-empty site name", () => {
    for (const loc of LOCALES) {
      expect(getDictionary(loc).siteName.length).toBeGreaterThan(0);
    }
  });
});
