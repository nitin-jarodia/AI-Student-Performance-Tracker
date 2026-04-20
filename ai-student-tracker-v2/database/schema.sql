-- schema.sql - PostgreSQL Database Schema
-- Run in pgAdmin Query Tool after creating ai_student_tracker database

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    email       VARCHAR(255) UNIQUE NOT NULL,
    full_name   VARCHAR(255) NOT NULL,
    password    VARCHAR(255) NOT NULL,
    role        VARCHAR(50) NOT NULL DEFAULT 'teacher',
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Students Table
CREATE TABLE IF NOT EXISTS students (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) UNIQUE,
    roll_number     VARCHAR(50) UNIQUE NOT NULL,
    class_name      VARCHAR(50) NOT NULL,
    section         VARCHAR(10) NOT NULL,
    parent_name     VARCHAR(255),
    parent_phone    VARCHAR(20),
    parent_email    VARCHAR(255),
    address         TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Subjects Table
CREATE TABLE IF NOT EXISTS subjects (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    code        VARCHAR(50) UNIQUE NOT NULL,
    class_name  VARCHAR(50) NOT NULL,
    teacher_id  INTEGER REFERENCES users(id),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Performance Table
CREATE TABLE IF NOT EXISTS performance (
    id          SERIAL PRIMARY KEY,
    student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    subject_id  INTEGER NOT NULL REFERENCES subjects(id),
    score       DECIMAL(5,2) NOT NULL,
    max_score   DECIMAL(5,2) NOT NULL,
    exam_type   VARCHAR(100) NOT NULL,
    exam_date   DATE NOT NULL,
    remarks     TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
    id          SERIAL PRIMARY KEY,
    student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    status      VARCHAR(20) NOT NULL,
    remarks     TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, date)
);

-- Predictions Table
CREATE TABLE IF NOT EXISTS predictions (
    id              SERIAL PRIMARY KEY,
    student_id      INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    risk_level      VARCHAR(20) NOT NULL,
    risk_score      DECIMAL(5,2) NOT NULL,
    recommendation  TEXT,
    predicted_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_performance_student ON performance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_predictions_student ON predictions(student_id);
