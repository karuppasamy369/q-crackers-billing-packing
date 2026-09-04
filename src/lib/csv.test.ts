import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("prepends a UTF-8 BOM", () => {
    const csv = toCsv(["a"], [["1"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("joins headers and rows with CRLF", () => {
    const csv = toCsv(["a", "b"], [["1", "2"]]);
    expect(csv).toBe("﻿a,b\r\n1,2\r\n");
  });

  it("quotes cells containing commas, quotes, or newlines", () => {
    const csv = toCsv(["name"], [['O"Brien'], ["a,b"], ["line1\nline2"]]);
    expect(csv).toContain('"O""Brien"');
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"line1\nline2"');
  });

  it("renders null/undefined cells as empty strings", () => {
    const csv = toCsv(["a", "b"], [[null, undefined]]);
    expect(csv).toBe("﻿a,b\r\n,\r\n");
  });

  it("stringifies numbers", () => {
    const csv = toCsv(["n"], [[42]]);
    expect(csv).toContain("42");
  });
});
