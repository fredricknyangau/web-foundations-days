# School Database Design

## Tables

### `students`

One row per student.

- `id`: primary key.
- `name`: required (`NOT NULL`).
- `email`: required and `UNIQUE`, so two students can't share an email address.

### `courses`

One row per course.

- `id`: primary key.
- `title`: required.
- `teacher`: optional.

### `enrolments`

One row each time a student joins a course. This is the join table.

- `id`: primary key.
- `student_id`: foreign key to `students(id)`, required.
- `course_id`: foreign key to `courses(id)`, required.
- `grade`: can be empty (`NULL`) until the course is marked.
- `UNIQUE (student_id, course_id)` stops the same student from enrolling on the same course twice.

## Relationships

- **Student → enrolments: one-to-many.** One student can have many enrolment rows, but each enrolment belongs to exactly one student.
- **Course → enrolments: one-to-many.** One course can have many enrolment rows, but each enrolment is for exactly one course.
- **Students ↔ courses: many-to-many.** A student takes many courses, and a course has many students.

### Why a join table is needed

A relational table can't store a list in a single column. If `students` had a `course_id` column, each student could only take one course. If `courses` had a `student_id` column, each course could only have one student. The `enrolments` table splits the many-to-many relationship into two one-to-many relationships. Each pairing becomes its own row, and the join table is also the natural place to keep data that belongs to the pairing rather than to either side, such as the **grade**.

## Index

```sql
CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);
```

**Reason:** "all students on one course" and "number of students per course" both look up enrolments by `course_id`. Without an index, the database has to scan every enrolment row. The `UNIQUE (student_id, course_id)` rule already creates an index that starts with `student_id`, so lookups by student are fast. Lookups by course are not, because `course_id` is the second column in that index. This new index fixes that.

## SQL or NoSQL?

I would choose **SQL** for this system. The data has a clear, fixed structure (every student has a name and email, every course has a title) and is all about relationships between students and courses. That is exactly what JOINs are built for. SQL also lets the database itself enforce the important rules: foreign keys stop an enrolment from pointing at a student who doesn't exist, `UNIQUE` blocks duplicate emails and double enrolments, and `NOT NULL` blocks missing data. With a NoSQL document store, I would probably end up copying course details into each student document, or the other way round, and my own application code would have to keep those copies in sync and enforce the rules. NoSQL is a better fit for huge volumes of loosely structured data or rapidly changing schemas, and a school's enrolment records are neither.
