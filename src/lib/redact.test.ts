import { describe, it, expect } from "vitest";
import { redact } from "./redact";

describe("redact", () => {
  it("masks sensitive keys at any depth", () => {
    const out = redact({
      email: "a@b.com",
      password: "hunter2",
      nested: { newPassword: "x", tokenHash: "abc", keep: 1 },
      list: [{ secret: "s" }, { ok: true }],
    }) as Record<string, unknown>;

    expect(out.email).toBe("a@b.com");
    expect(out.password).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).newPassword).toBe(
      "[redacted]",
    );
    expect((out.nested as Record<string, unknown>).tokenHash).toBe(
      "[redacted]",
    );
    expect((out.nested as Record<string, unknown>).keep).toBe(1);
    expect((out.list as Record<string, unknown>[])[0]?.secret).toBe(
      "[redacted]",
    );
  });

  it("is case-insensitive on key names", () => {
    const out = redact({ PassWord: "x", Authorization: "Bearer y" }) as Record<
      string,
      unknown
    >;
    expect(out.PassWord).toBe("[redacted]");
    expect(out.Authorization).toBe("[redacted]");
  });

  it("passes primitives through unchanged", () => {
    expect(redact("hello")).toBe("hello");
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBe(null);
  });
});
