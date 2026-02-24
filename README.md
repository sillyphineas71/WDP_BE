-- =========================================================
-- Smart Edu LMS - PostgreSQL DDL (PK/FK/Constraints/Types)
-- =========================================================

-- 0) EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) ENUM TYPES (để enforce các trạng thái)
DO $$ BEGIN
CREATE TYPE role_code AS ENUM ('ADMIN', 'TEACHER', 'STUDENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE user_status AS ENUM ('active', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE class_status AS ENUM ('active', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE enrollment_status AS ENUM ('active', 'dropped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE session_status AS ENUM ('scheduled', 'cancelled', 'done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late', 'excused');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE material_type AS ENUM ('pdf', 'slide', 'video', 'link');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE assessment_type AS ENUM ('QUIZ', 'ESSAY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE assessment_status AS ENUM ('draft', 'published', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE submission_status AS ENUM ('in_progress', 'submitted', 'graded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE import_job_type AS ENUM ('SCHEDULE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE import_job_status AS ENUM ('processing', 'success', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE import_row_status AS ENUM ('ok', 'error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE grade_status AS ENUM ('ai_drafted', 'finalized');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE notification_channel AS ENUM ('email', 'in_app');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE notification_ref_type AS ENUM ('SESSION', 'ASSESSMENT', 'GRADE', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
CREATE TYPE notification_status AS ENUM ('scheduled', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) TABLES

---

-- roles

---

CREATE TABLE IF NOT EXISTS roles (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
code role_code NOT NULL UNIQUE,
name TEXT NOT NULL
);

---

-- users

---

CREATE TABLE IF NOT EXISTS users (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
email TEXT NOT NULL UNIQUE,
password_hash TEXT NOT NULL,
full_name TEXT NOT NULL,
phone TEXT,
avatar_url TEXT,
bio TEXT,
status user_status NOT NULL DEFAULT 'active',
must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
password_changed_at TIMESTAMPTZ,
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

---

-- password_reset_tokens (UC_STU_03)

---

CREATE TABLE IF NOT EXISTS password_reset_tokens (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
token_hash TEXT NOT NULL,
expires_at TIMESTAMPTZ NOT NULL,
used_at TIMESTAMPTZ,
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
CONSTRAINT chk_prt_expires_after_created CHECK (expires_at > created_at)
);

-- (tùy chọn nhưng rất nên có) tránh tạo quá nhiều token giống nhau
CREATE INDEX IF NOT EXISTS idx_prt_user_expires ON password_reset_tokens(user_id, expires_at);

---

-- courses

---

CREATE TABLE IF NOT EXISTS courses (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
code TEXT NOT NULL UNIQUE,
name TEXT NOT NULL,
description TEXT,
expected_sessions INT,
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
CONSTRAINT chk_courses_expected_sessions CHECK (expected_sessions IS NULL OR expected_sessions > 0)
);

---

-- classes

---

CREATE TABLE IF NOT EXISTS classes (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
name TEXT NOT NULL,
start_date DATE NOT NULL,
end_date DATE,
status class_status NOT NULL DEFAULT 'active',
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
CONSTRAINT chk_classes_date_range CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_classes_course ON classes(course_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id);

---

-- enrollments (junction: class <-> student)

---

CREATE TABLE IF NOT EXISTS enrollments (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
student_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
status enrollment_status NOT NULL DEFAULT 'active',
joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
CONSTRAINT uq_enrollments UNIQUE (class_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);

---

-- class_sessions
-- (đã bỏ teacher_id để tránh dữ liệu lặp với classes.teacher_id)

---

CREATE TABLE IF NOT EXISTS class_sessions (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
start_time TIMESTAMPTZ NOT NULL,
end_time TIMESTAMPTZ NOT NULL,
room TEXT,
topic TEXT,
status session_status NOT NULL DEFAULT 'scheduled',
CONSTRAINT chk_sessions_time CHECK (end_time > start_time)
);

-- indexes phục vụ check trùng phòng / lọc lịch
CREATE INDEX IF NOT EXISTS idx_sessions_class_time ON class_sessions(class_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_sessions_room_time ON class_sessions(room, start_time, end_time);

---

-- attendance_records

---

CREATE TABLE IF NOT EXISTS attendance_records (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
session_id UUID NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
student_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
status attendance_status NOT NULL,
note TEXT,
marked_by UUID REFERENCES users(id) ON DELETE RESTRICT,
marked_at TIMESTAMPTZ,
CONSTRAINT uq_attendance UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records(student_id);

---

-- materials

---

CREATE TABLE IF NOT EXISTS materials (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
session_id UUID REFERENCES class_sessions(id) ON DELETE CASCADE,
class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
type material_type NOT NULL,
title TEXT NOT NULL,
description TEXT,
file_url TEXT NOT NULL,
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_materials_class ON materials(class_id);
CREATE INDEX IF NOT EXISTS idx_materials_session ON materials(session_id);

---

-- assessments

---

CREATE TABLE IF NOT EXISTS assessments (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
type assessment_type NOT NULL,
title TEXT NOT NULL,
instructions TEXT,
due_at TIMESTAMPTZ,
time_limit_minutes INT,
attempt_limit INT,
status assessment_status NOT NULL DEFAULT 'draft',
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
CONSTRAINT chk_assess_time_limit CHECK (time_limit_minutes IS NULL OR time_limit_minutes > 0),
CONSTRAINT chk_assess_attempt_limit CHECK (attempt_limit IS NULL OR attempt_limit > 0)
);

CREATE INDEX IF NOT EXISTS idx_assessments_class ON assessments(class_id);
CREATE INDEX IF NOT EXISTS idx_assessments_due ON assessments(due_at);

---

-- assessment_files (UC_TEA_11)

---

CREATE TABLE IF NOT EXISTS assessment_files (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
file_url TEXT NOT NULL,
original_name TEXT NOT NULL,
mime_type TEXT NOT NULL,
uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessment_files_assessment ON assessment_files(assessment_id);

---

-- quiz_questions

---

CREATE TABLE IF NOT EXISTS quiz_questions (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
question_text TEXT NOT NULL,
points INT NOT NULL DEFAULT 1,
display_order INT NOT NULL,
CONSTRAINT chk_question_points CHECK (points > 0)
);

-- (khuyến nghị) tránh trùng order trong cùng assessment
CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_questions_order
ON quiz_questions(assessment_id, display_order);

---

-- quiz_options

---

CREATE TABLE IF NOT EXISTS quiz_options (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
option_text TEXT NOT NULL,
is_correct BOOLEAN NOT NULL DEFAULT FALSE,
display_order INT NOT NULL
);

-- (khuyến nghị) tránh trùng order trong cùng question
CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_options_order
ON quiz_options(question_id, display_order);

---

-- import_jobs

---

CREATE TABLE IF NOT EXISTS import_jobs (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
type import_job_type NOT NULL DEFAULT 'SCHEDULE',
source_file_url TEXT NOT NULL,
status import_job_status NOT NULL DEFAULT 'processing',
result_log_file_url TEXT,
summary_json JSONB,
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
finished_at TIMESTAMPTZ,
CONSTRAINT chk_import_finished_after_created CHECK (finished_at IS NULL OR finished_at >= created_at)
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status, created_at);

---

-- import_rows

---

CREATE TABLE IF NOT EXISTS import_rows (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
job_id UUID NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
row_number INT NOT NULL,
payload_json JSONB NOT NULL,
status import_row_status NOT NULL,
error_message TEXT,
created_entity_id UUID, -- session_id nếu tạo thành công
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
CONSTRAINT chk_import_row_number CHECK (row_number > 0)
);

CREATE INDEX IF NOT EXISTS idx_import_rows_job ON import_rows(job_id, status);

---

-- submissions

---

CREATE TABLE IF NOT EXISTS submissions (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
student_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
attempt_no INT NOT NULL DEFAULT 1,
status submission_status NOT NULL DEFAULT 'in_progress',
started_at TIMESTAMPTZ,
submitted_at TIMESTAMPTZ,
content_text TEXT,
CONSTRAINT chk_submission_attempt CHECK (attempt_no > 0),
CONSTRAINT chk_submission_submit_time CHECK (submitted_at IS NULL OR started_at IS NULL OR submitted_at >= started_at),
CONSTRAINT uq_submission_attempt UNIQUE (assessment_id, student_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_submissions_assessment_student ON submissions(assessment_id, student_id);

---

-- submission_answers

---

CREATE TABLE IF NOT EXISTS submission_answers (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
selected_option_id UUID REFERENCES quiz_options(id) ON DELETE SET NULL,
answer_text TEXT,
is_correct BOOLEAN,
score INT,
CONSTRAINT chk_answer_score CHECK (score IS NULL OR score >= 0)
);

CREATE INDEX IF NOT EXISTS idx_submission_answers_submission ON submission_answers(submission_id);

---

-- submission_files (UC_STU_10)

---

CREATE TABLE IF NOT EXISTS submission_files (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
file_url TEXT NOT NULL,
original_name TEXT NOT NULL,
mime_type TEXT NOT NULL,
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submission_files_submission ON submission_files(submission_id);

---

-- grades

---

CREATE TABLE IF NOT EXISTS grades (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
submission_id UUID NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
ai_score_draft NUMERIC(6,2),
ai_feedback_json JSONB,
final_score NUMERIC(6,2),
final_feedback TEXT,
graded_by UUID REFERENCES users(id) ON DELETE RESTRICT,
graded_at TIMESTAMPTZ,
status grade_status NOT NULL DEFAULT 'ai_drafted',
is_published BOOLEAN NOT NULL DEFAULT FALSE,
published_at TIMESTAMPTZ,
CONSTRAINT chk_grade_publish_time CHECK (published_at IS NULL OR published_at >= graded_at OR graded_at IS NULL)
);

---

-- notifications

---

CREATE TABLE IF NOT EXISTS notifications (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
channel notification_channel NOT NULL,
title TEXT NOT NULL,
body TEXT NOT NULL,
scheduled_at TIMESTAMPTZ,
sent_at TIMESTAMPTZ,
is_read BOOLEAN NOT NULL DEFAULT FALSE,
ref_type notification_ref_type NOT NULL DEFAULT 'SYSTEM',
ref_id UUID,
status notification_status NOT NULL DEFAULT 'scheduled',
error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_status_time
ON notifications(user_id, status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
ON notifications(user_id, is_read);

-- =========================================================
-- END
-- =========================================================
