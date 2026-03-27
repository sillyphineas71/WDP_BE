import { describe, expect, test } from "@jest/globals";

import { getEffectiveClassStatus } from "../../src/utils/classStatusHelper.js";

describe("getEffectiveClassStatus", () => {
  test("returns null when class input is missing", () => {
    expect(getEffectiveClassStatus(null)).toBeNull();
  });

  test("keeps manually closed or cancelled statuses", () => {
    expect(
      getEffectiveClassStatus({
        status: "closed",
        start_date: "2099-01-01",
        end_date: "2099-12-31",
      }),
    ).toBe("closed");

    expect(
      getEffectiveClassStatus({
        status: "cancelled",
        start_date: "2099-01-01",
        end_date: "2099-12-31",
      }),
    ).toBe("cancelled");
  });

  test("auto closes classes whose end date has passed", () => {
    expect(
      getEffectiveClassStatus({
        status: "active",
        start_date: "2025-01-01",
        end_date: "2025-01-31",
      }),
    ).toBe("closed");
  });

  test("auto activates an upcoming class when start date is reached", () => {
    expect(
      getEffectiveClassStatus({
        status: "upcoming",
        start_date: "2025-01-01",
        end_date: "2099-12-31",
      }),
    ).toBe("active");
  });

  test("keeps the current status when no special transition applies", () => {
    expect(
      getEffectiveClassStatus({
        status: "active",
        start_date: "2099-01-01",
        end_date: "2099-12-31",
      }),
    ).toBe("active");
  });
});
