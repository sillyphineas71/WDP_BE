import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockUserFindOne = jest.fn();
const mockComparePassword = jest.fn();
const mockJwtSign = jest.fn();

await jest.unstable_mockModule("../../src/models/User.js", () => ({
  User: {
    findOne: mockUserFindOne,
  },
}));

await jest.unstable_mockModule("../../src/models/Role.js", () => ({
  Role: {},
}));

await jest.unstable_mockModule("../../src/utils/passwordUtils.js", () => ({
  comparePassword: mockComparePassword,
  hashPassword: jest.fn(),
}));

await jest.unstable_mockModule("../../src/services/emailService.js", () => ({
  sendEmail: jest.fn(),
}));

await jest.unstable_mockModule("../../src/models/PasswordResetToken.js", () => ({
  PasswordResetToken: {
    create: jest.fn(),
    findOne: jest.fn(),
  },
}));

await jest.unstable_mockModule("jsonwebtoken", () => ({
  default: {
    sign: mockJwtSign,
  },
}));

const { loginUser } = await import("../../src/services/authService.js");
const { UnauthorizedError } = await import("../../src/errors/AppError.js");
const { ERROR_MESSAGES } = await import("../../src/constants/messages.js");

describe("loginUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockJwtSign.mockReturnValue("mock-jwt-token");
    delete process.env.JWT_SECRET;
    delete process.env.JWT_EXPIRE;
  });

  test("returns token and formatted user data when credentials are valid", async () => {
    mockUserFindOne.mockResolvedValue({
      id: "user-1",
      email: "teacher@example.com",
      password_hash: "hashed-password",
      full_name: "Teacher One",
      phone: "0123456789",
      status: "active",
      must_change_password: false,
      created_at: new Date("2026-03-01T00:00:00Z"),
      role: {
        code: "TEACHER",
      },
    });
    mockComparePassword.mockResolvedValue(true);

    const result = await loginUser({
      email: "teacher@example.com",
      password: "correct-password",
    });

    expect(mockUserFindOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "teacher@example.com" },
      }),
    );
    expect(mockComparePassword).toHaveBeenCalledWith(
      "correct-password",
      "hashed-password",
    );
    expect(mockJwtSign).toHaveBeenCalledWith(
      {
        id: "user-1",
        email: "teacher@example.com",
        role: "TEACHER",
      },
      "your-secret-key",
      { expiresIn: "7d" },
    );
    expect(result).toEqual({
      token: "mock-jwt-token",
      user: expect.objectContaining({
        id: "user-1",
        email: "teacher@example.com",
        full_name: "Teacher One",
        role: "TEACHER",
        status: "active",
      }),
    });
  });

  test("throws UnauthorizedError when email is not found", async () => {
    mockUserFindOne.mockResolvedValue(null);

    await expect(
      loginUser({
        email: "missing@example.com",
        password: "anything",
      }),
    ).rejects.toMatchObject({
      name: UnauthorizedError.name,
      message: ERROR_MESSAGES.EMAIL_NOT_FOUND,
      statusCode: 401,
    });
  });

  test("throws UnauthorizedError when account is blocked", async () => {
    mockUserFindOne.mockResolvedValue({
      status: "blocked",
    });

    await expect(
      loginUser({
        email: "blocked@example.com",
        password: "anything",
      }),
    ).rejects.toMatchObject({
      name: UnauthorizedError.name,
      message: ERROR_MESSAGES.USER_BLOCKED,
      statusCode: 401,
    });
  });

  test("throws UnauthorizedError when password comparison fails", async () => {
    mockUserFindOne.mockResolvedValue({
      password_hash: "hashed-password",
      status: "active",
      role: { code: "STUDENT" },
    });
    mockComparePassword.mockResolvedValue(false);

    await expect(
      loginUser({
        email: "student@example.com",
        password: "wrong-password",
      }),
    ).rejects.toMatchObject({
      name: UnauthorizedError.name,
      message: ERROR_MESSAGES.INVALID_PASSWORD,
      statusCode: 401,
    });
  });
});
