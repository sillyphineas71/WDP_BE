import { describe, expect, test } from "@jest/globals";

import { validateLogin } from "../../src/validators/authValidator.js";
import { VALIDATION_MESSAGES } from "../../src/constants/messages.js";

describe("validateLogin", () => {
  test("accepts valid email and password", () => {
    const result = validateLogin({
      email: "student@example.com",
      password: "secret123",
    });

    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({
      email: "student@example.com",
      password: "secret123",
    });
  });

  test("rejects invalid email format", () => {
    const result = validateLogin({
      email: "invalid-email",
      password: "secret123",
    });

    expect(result.error).toBeDefined();
    expect(result.error.details.map((item) => item.message)).toContain(
      VALIDATION_MESSAGES.EMAIL_INVALID,
    );
  });

  test("rejects missing email", () => {
    const result = validateLogin({
      password: "secret123",
    });

    expect(result.error).toBeDefined();
    expect(result.error.details.map((item) => item.message)).toContain(
      VALIDATION_MESSAGES.EMAIL_REQUIRED,
    );
  });

  test("rejects missing password", () => {
    const result = validateLogin({
      email: "student@example.com",
    });

    expect(result.error).toBeDefined();
    expect(result.error.details.map((item) => item.message)).toContain(
      VALIDATION_MESSAGES.PASSWORD_REQUIRED,
    );
  });

  test("returns multiple errors when both email and password are invalid", () => {
    const result = validateLogin({
      email: "bad-email",
    });

    expect(result.error).toBeDefined();
    const messages = result.error.details.map((item) => item.message);

    expect(messages).toContain(VALIDATION_MESSAGES.EMAIL_INVALID);
    expect(messages).toContain(VALIDATION_MESSAGES.PASSWORD_REQUIRED);
  });
});
