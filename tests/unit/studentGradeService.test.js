import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockEnrollmentFindOne = jest.fn();
const mockClassFindByPk = jest.fn();
const mockAssessmentFindAll = jest.fn();
const mockSubmissionFindOne = jest.fn();

const mockOp = { ne: Symbol("ne") };

await jest.unstable_mockModule("../../src/models/Enrollment.js", () => ({
  Enrollment: {
    findOne: mockEnrollmentFindOne,
    findAll: jest.fn(),
  },
}));

await jest.unstable_mockModule("../../src/models/Class.js", () => ({
  Class: {
    findByPk: mockClassFindByPk,
  },
}));

await jest.unstable_mockModule("../../src/models/Course.js", () => ({
  Course: {},
}));

await jest.unstable_mockModule("../../src/models/Assessment.js", () => ({
  Assessment: {
    findAll: mockAssessmentFindAll,
  },
}));

await jest.unstable_mockModule("../../src/models/Submission.js", () => ({
  Submission: {
    findOne: mockSubmissionFindOne,
  },
}));

await jest.unstable_mockModule("../../src/models/Grade.js", () => ({
  Grade: {},
}));

await jest.unstable_mockModule("../../src/models/User.js", () => ({
  User: {},
}));

await jest.unstable_mockModule("sequelize", () => ({
  Sequelize: {},
  Op: mockOp,
}));

const { studentGradeService } = await import("../../src/services/studentGradeService.js");
const { NotFoundError } = await import("../../src/errors/AppError.js");

describe("studentGradeService.getClassGrades", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("throws NotFoundError when the student is not enrolled in the class", async () => {
    mockEnrollmentFindOne.mockResolvedValue(null);

    await expect(
      studentGradeService.getClassGrades("student-1", "class-1"),
    ).rejects.toMatchObject({
      name: NotFoundError.name,
      statusCode: 404,
    });
  });

  test("returns class grades with published and hidden items plus weighted course total", async () => {
    mockEnrollmentFindOne.mockResolvedValue({
      id: "enrollment-1",
    });

    mockClassFindByPk.mockResolvedValue({
      id: "class-1",
      name: "SE1234",
      course: { name: "Software Testing" },
      teacher: { full_name: "Teacher A" },
    });

    mockAssessmentFindAll.mockResolvedValue([
      {
        id: "assessment-1",
        title: "Quiz 1",
        type: "QUIZ",
        weight: 40,
        max_score: 10,
        due_at: new Date("2026-03-10T00:00:00Z"),
      },
      {
        id: "assessment-2",
        title: "Essay 1",
        type: "ESSAY",
        settings_json: { weight: 60 },
        max_score: 10,
        due_at: new Date("2026-03-15T00:00:00Z"),
      },
    ]);

    mockSubmissionFindOne
      .mockResolvedValueOnce({
        id: "submission-1",
        submitted_at: new Date("2026-03-09T00:00:00Z"),
        grade: {
          is_published: true,
          final_score: 8.5,
          final_feedback: "Well done",
          ai_feedback_json: { summary: "good" },
        },
      })
      .mockResolvedValueOnce({
        id: "submission-2",
        submitted_at: new Date("2026-03-14T00:00:00Z"),
        grade: {
          is_published: false,
          final_score: 9.0,
          final_feedback: "Pending publish",
        },
      });

    const result = await studentGradeService.getClassGrades("student-1", "class-1");

    expect(mockAssessmentFindAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          class_id: "class-1",
          status: { [mockOp.ne]: "draft" },
        }),
      }),
    );

    expect(result.class).toEqual({
      id: "class-1",
      name: "SE1234",
      course: "Software Testing",
      teacher: "Teacher A",
    });

    expect(result.grade_items).toHaveLength(2);
    expect(result.grade_items[0]).toEqual(
      expect.objectContaining({
        assessment_id: "assessment-1",
        title: "Quiz 1",
        weight: 40,
        score: 8.5,
        status: "published",
        feedback: "Well done",
        ai_feedback: { summary: "good" },
      }),
    );
    expect(result.grade_items[1]).toEqual(
      expect.objectContaining({
        assessment_id: "assessment-2",
        title: "Essay 1",
        weight: 60,
        score: null,
        status: "hidden",
        feedback: null,
      }),
    );

    expect(result.course_total).toBe("8.50");
    expect(result.total_weight).toBe(40);
  });
});
