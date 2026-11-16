import { describe, expect, it } from "vitest";
import { isQuiet, localTime } from "../src/quiet";

describe("localTime", () => {
  it("converts to Amsterdam time (winter UTC+1, summer UTC+2)", () => {
    expect(localTime(Date.UTC(2026, 10, 16, 6, 0))).toBe("07:00");
    expect(localTime(Date.UTC(2026, 6, 16, 5, 30))).toBe("07:30");
  });
});

describe("isQuiet", () => {
  const s = { quietEnabled: true, quietStart: "23:00", quietEnd: "07:00" };
  it("handles a window over midnight", () => {
    expect(isQuiet(s, "23:00")).toBe(true);
    expect(isQuiet(s, "02:15")).toBe(true);
    expect(isQuiet(s, "06:59")).toBe(true);
    expect(isQuiet(s, "07:00")).toBe(false);
    expect(isQuiet(s, "12:00")).toBe(false);
  });
  it("handles a window within one day", () => {
    expect(isQuiet({ ...s, quietStart: "13:00", quietEnd: "14:00" }, "13:30")).toBe(true);
    expect(isQuiet({ ...s, quietStart: "13:00", quietEnd: "14:00" }, "14:30")).toBe(false);
  });
  it("is never quiet when disabled or start equals end", () => {
    expect(isQuiet({ ...s, quietEnabled: false }, "02:00")).toBe(false);
    expect(isQuiet({ ...s, quietEnd: "23:00" }, "23:30")).toBe(false);
  });
});
