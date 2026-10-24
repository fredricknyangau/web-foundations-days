-- School database: students, courses and enrolments
-- SQLite only enforces foreign keys when this is switched on.
PRAGMA foreign_keys = ON;

-- Lets the script be run again from the top
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- ---------- Tables ----------

CREATE TABLE students (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    teacher TEXT
);

CREATE TABLE enrolments (
    id INTEGER PRIMARY KEY,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    grade TEXT, -- empty until the course is marked
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (course_id) REFERENCES courses(id),
    UNIQUE (student_id, course_id) -- a student can't enrol on the same course twice
);

-- ---------- Sample data ----------

INSERT INTO students (id, name, email) VALUES
    (1, 'Amina Otieno', 'amina@example.com'),
    (2, 'Brian Kamau', 'brian@example.com'),
    (3, 'Cynthia Wanjiru', 'cynthia@example.com'),
    (4, 'David Mwangi', 'david@example.com'); -- no enrolments

INSERT INTO courses (id, title, teacher) VALUES
    (1, 'Web Foundations', 'Ms. Njeri'),
    (2, 'Databases', 'Mr. Ochieng'),
    (3, 'JavaScript Basics', 'Ms. Akinyi');

INSERT INTO enrolments (student_id, course_id, grade) VALUES
    (1, 1, 'A'),
    (1, 2, 'B'),
    (2, 1, 'C'),
    (2, 3, NULL),
    (3, 2, 'A'),
    (3, 3, 'B');

-- ---------- Queries ----------

-- 1. All courses for one student (by name)
SELECT c.title, e.grade
FROM enrolments e
JOIN students s ON s.id = e.student_id
JOIN courses c ON c.id = e.course_id
WHERE s.name = 'Amina Otieno';

-- 2. All students on one course
SELECT s.name, s.email, e.grade
FROM enrolments e
JOIN students s ON s.id = e.student_id
JOIN courses c ON c.id = e.course_id
WHERE c.title = 'Web Foundations';

-- 3. Number of students per course (LEFT JOIN keeps courses with 0 students)
SELECT c.title, COUNT(e.student_id) AS student_count
FROM courses c
LEFT JOIN enrolments e ON e.course_id = c.id
GROUP BY c.id, c.title
ORDER BY student_count DESC;

-- 4. Students who have no enrolments
SELECT s.name, s.email
FROM students s
LEFT JOIN enrolments e ON e.student_id = s.id
WHERE e.id IS NULL;

-- 5. Update one enrolment's grade (Brian on JavaScript Basics)
UPDATE enrolments
SET grade = 'B'
WHERE student_id = 2 AND course_id = 3;

-- Check the update
SELECT student_id, course_id, grade
FROM enrolments
WHERE student_id = 2 AND course_id = 3;
