import { describe, expect, it } from "vitest";
import { createCsrfToken, csrfCookieOptions, CsrfError, isCsrfToken, validateCsrfToken } from "@/lib/csrf";

describe("CSRF-beveiliging", () => {
  it("maakt cryptografisch willekeurige tokens met een vast veilig formaat", () => {
    const first = createCsrfToken();
    const second = createCsrfToken();
    expect(isCsrfToken(first)).toBe(true);
    expect(first).not.toBe(second);
  });

  it("configureert de productiecookie veilig", () => {
    expect(csrfCookieOptions(true)).toMatchObject({ httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 28800, priority: "high" });
  });

  it("accepteert een geldig gelijk token en dezelfde origin", () => {
    const token = createCsrfToken();
    expect(() => validateCsrfToken(token, token, "https://attendance.sv-realtime-gaming.nl", "https://attendance.sv-realtime-gaming.nl")).not.toThrow();
  });

  it.each([
    [undefined, null, "ontbrekende cookie en header"],
    [undefined, createCsrfToken(), "ontbrekende cookie"],
    [createCsrfToken(), null, "ontbrekende header"],
    [createCsrfToken(), createCsrfToken(), "ongelijk token"],
    ["te-kort", "te-kort", "ongeldig tokenformaat"]
  ])("weigert %s / %s: %s", (cookie, supplied, description) => {
    void description;
    expect(() => validateCsrfToken(cookie, supplied, null, "https://attendance.sv-realtime-gaming.nl")).toThrow(CsrfError);
  });

  it("weigert een afwijkende of ongeldige origin", () => {
    const token = createCsrfToken();
    expect(() => validateCsrfToken(token, token, "https://evil.example", "https://attendance.sv-realtime-gaming.nl")).toThrow(CsrfError);
    expect(() => validateCsrfToken(token, token, "geen-url", "https://attendance.sv-realtime-gaming.nl")).toThrow(CsrfError);
  });
});
