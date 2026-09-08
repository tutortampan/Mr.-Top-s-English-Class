MR. TOP'S ENGLISH CLASS - VOCABULARY EXAMINATION SYSTEM

EXCEL FORMAT:
WEEK | DAY | TYPE | NO | INDONESIA | ENGLISH

Example:
4TH | 1 | VERB | 1 | MEMPEROLEH | ACQUIRE

STUDENT DATABASE FORMAT:
STUDENT_ID | PROGRAM | CLASS | LEVEL | NAME | DATE_OF_BIRTH | GENDER | PHOTO

PHOTO is optional and can contain an image URL or data URL. Students can also
choose their own image before starting an exam. Their photo appears at the
top right of the exam page.

STUDENT_ID and NAME are required. Student imports are validated and merged:
existing students are preserved, matching Student IDs are updated, and possible
duplicates are rejected for administrator review. DATE_OF_BIRTH is optional and
should use YYYY-MM-DD when possible. If it is missing, the student must enter it
before their first exam.
The tutor can later update the name and date of birth from Classes & Students.

MULTIPLE EXAMS AND QUESTION TYPES:
The Admin Panel can create multiple exams. Each exam can have an optional
prerequisite exam and minimum clearance score. Students see their previous
scores and can only start an exam after meeting its clearance requirement.
Each exam can also be assigned to a specific PROGRAM, LEVEL, and CLASS, so
students only see exams intended for their program, level, and class. Exam
titles are generated from those fields and the exam type.

Results can be exported from the Admin Panel as an XLSX spreadsheet. Existing
exam questions can be edited in the Admin Panel without uploading a new file.

GRADING:
S = 100%, A = 90-99%, B = 70-89%, C = 50-69%, D = 30-49%,
E = 10-29%, F = below 10%.

For IDIOM, PROVERB, or EXPRESSION dropdown questions, use these optional
columns in the exam spreadsheet:
QUESTION | OPTION_A | OPTION_B | OPTION_C | OPTION_D | OPTION_E | OPTION_F | OPTION_G | OPTION_H | OPTION_I | OPTION_J | CORRECT_OPTION

Dropdown questions can contain up to 10 options. CORRECT_OPTION can be A-J or
the exact correct answer text.

The Admin Panel lets you choose whether questions appear in file order or are
randomized for each exam attempt. Prerequisite clearance scores can be
adjusted from 0% to 100% when creating or editing an exam.

When an exam spreadsheet includes PROGRAM, LEVEL, CLASS, or TYPE columns, the
Admin Panel reads those values automatically and fills the exam settings.

HOW TO RUN:
1. Keep all files in the same folder.
2. Open index.html in Google Chrome.
3. Click Enter Student Exam to open the student exam.
4. Tutors can use the Admin Panel button at the top left and enter the tutor password.
5. Open Students & Classes from the Admin Panel to manage the roster and class options.
6. Upload your Excel file.
7. Set the exam duration.
8. Click Create Exam.

ROLE ACCESS:
The home page opens in Student mode by default. Choose Tutor (Admin) to enter the
tutor password. The default tutor password for this local Version 1 app is:
123
Tutors can change it later from Classes & Students. The password is stored
as a SHA-256 hash in the browser, not as plaintext.
Tutor access remains active for the current browser tab until Log Out is selected.
This is a local browser access gate; a production online system should use server-side
authentication.

The admin navigation is split into compact Student Management, Class Management, and
Exam Management pages. These pages redirect to the tutor login when opened without
tutor authentication.

Student login uses Program, Class, Name, and a Supabase Auth password. Level
remains part of the student's academic record and the server-side hierarchy,
but is not required on the student login form.
Deploy the `supabase/functions/student-auth` Edge Function and run the updated
SQL setup before using student account login. Student profiles and configured
progress summaries are shown on `dashboard.html`.
New student accounts are provisioned with the initial password `123`. Students
should change it from their profile dashboard after signing in.

PHASE 3 PROGRESS STRUCTURE:
The Supabase setup creates configurable Programs, Classes, Levels, Requirements,
Achievement Targets, explicit Requirement-to-Target links, and separate student
completion records. Requirements support mandatory flags and flexible completion
criteria. Exam completion is not automatically treated as progress completion.
Run the complete `supabase-setup.sql` again in the Supabase SQL Editor after
upgrading an existing database. The local tutor management page also provides
offline requirement and achievement-target lists for development.

PHASE 4 AUTOMATIC ADVANCEMENT:
The updated Supabase setup adds configurable advancement thresholds,
transaction-safe sequential level advancement, ownership validation,
idempotent progression history, and recalculation after login/profile access.
Advancement requires the configured completion percentage, all mandatory
requirements, and all active achievement targets. Completing or starting an
exam alone does not advance a student. Run the updated
`supabase-setup.sql` in the Supabase SQL Editor to add the progression
history table, threshold column, and advancement function.

PHASE 5 EXAM SAFETY:
Exam access is filtered by the authenticated student's Program, Class, and
current Level. Entry photos require explicit student capture and confirmation;
profile photos are not overwritten. Active exam state, answers, question order,
and the timestamp-based timer are persisted locally for refresh recovery.
Screen Wake Lock is used when supported, and released on completion. The SQL
setup also defines ownership-protected exam session and answer tables for the
server-backed exam session implementation.

PHASE 7 SUBJECT EXAMS:
Exams use the Program, Class, Level, and configurable Subject hierarchy. Exam names are
read-only and generated as "Program Class Level Subject" with spaces only. Vocabulary exams
can use Spoken answer mode, which uses browser speech recognition without recording or storing
audio; typed answer fields are not shown in that mode.

STUDENT PROFILE / PROGRESS / EXAM HUB:
The authenticated student dashboard is the single student-facing hub for
average result, grade, profile identity, progress, and the alphabetized exam
list. Student Name, Program, Class, Level, results, and progress are read-only.
Only profile photo and password can be edited, and both controls are located at
the bottom of the page. The exam page remains an internal attempt screen.

PHASE 8 BACKUP AND SECURITY HARDENING:
Tutors can download a versioned local JSON backup from the Admin Panel. Restore requires a
selected file, schema and relationship validation, explicit confirmation, and a safety backup
download before replacing local data. Restore failures do not commit partial changes. Backup
files exclude tutor password hashes and session tokens. Backup downloads, rejected restores,
successful restores, failed restores, and result exports are recorded in the local audit log.
The Supabase setup also defines a tutor-only audit_logs table.

PHASE 9 REPORTING AND ANALYTICS:
The Admin Panel includes compact operational summaries for students, active students,
programs, levels, completed exams, eligibility, and available progress data. Tutors can
filter a student progress table by program, class, level, status, and name search, view
level distribution, and review exam attempts, completion, pass counts, averages, subjects,
and answer modes. Analytics uses existing roster, result, and configuration data and does
not invent speech-recognition or eligibility events that are not stored.

PHASE 12-13 TEACHER/STAFF AND DATA QUALITY:
The tutor-protected Classes & Students workspace now includes a compact Data Quality & Audit
section. It detects duplicate Student IDs, possible duplicate name/date-of-birth identities,
missing student hierarchy fields, empty exams, exams without subjects, and results referencing
unknown exams. Administrative imports, student edits/deletions, master-option changes, password
changes, exports, and backup/restore operations are recorded in the local audit log. Issues are
reported for human review; historical data is not automatically deleted or rewritten.

The current browser application has a local tutor role rather than deployed Teacher/Staff role
claims. Server-side authorization remains required for production multi-user Teacher/Staff
workspace access.

PHASE 14-15 PERFORMANCE AND ACCESSIBILITY:
The registered-student management list uses compact client pagination (50 records per page)
instead of rendering the complete roster at once. Filtering and sorting reset to the first page,
and the existing data and authorization behavior are unchanged. Keyboard focus-visible outlines
were added for buttons, links, fields, selects, and disclosure controls. Browser smoke testing
confirmed tutor management initialization, data-quality rendering, and the empty-state behavior.
The local application still requires server-side Supabase deployment before production-scale
server-side filtering, pagination, monitoring, and concurrency guarantees can be claimed.

PHASE 10-17 RELEASE STATUS:
The local browser fallback and tutor/student smoke flows remain usable, but the application is
NOT READY FOR PRODUCTION until the Supabase student-auth Edge Function is deployed, the Supabase
401 synchronization errors are resolved, HTTPS hosting is configured, and server-side backup,
monitoring, notification, and concurrency tests are completed. LocalStorage backup/restore is
an administrative safety feature, not a replacement for scheduled database backups.

IMPORTANT:
The app now synchronizes its browser data with Supabase when the database table is configured.
To enable it, open the Supabase SQL Editor and run every statement in supabase-setup.sql,
then deploy all project files to Netlify. Local Storage remains available as an offline fallback.
Never add a Supabase service-role key to this browser app.

PHASE 16-17 RELEASE-CANDIDATE ACCEPTANCE:
The current source has been reviewed as a release candidate without changing the business
hierarchy or adding a parallel data path. Local smoke checks confirm that the student login,
exam entry, camera-verification, recovery, backup, reporting, data-quality, and tutor-protected
management surfaces load and retain their existing safeguards. The browser console still reports
the expected cloud-synchronization fallback while the configured Supabase endpoint returns 401.

RELEASE DECISION: NOT READY FOR PRODUCTION.

Blocking P0/P1 items:
1. Deploy and verify supabase/functions/student-auth/index.ts.
2. Run the complete supabase-setup.sql migration in the target Supabase project.
3. Resolve the 401 responses for the configured Supabase REST/RPC requests and verify RLS
   policies with separate student, tutor, and unauthenticated sessions.
4. Host the application over HTTPS and verify camera, microphone, SpeechRecognition, and
   Wake Lock permissions in the deployed origin.
5. Add server-side scheduled backups, monitoring/health checks, operational notifications, and
   a tested recovery procedure.
6. Run controlled multi-user, multi-tab, duplicate-submission, ownership/tampering, and
   concurrent-advancement tests against the deployed backend.
7. Implement and verify authoritative server-side Teacher/Staff roles and resource scoping
   before granting those roles access.

The local fallback is suitable for development and controlled offline demonstrations only. Do
not represent this release candidate as production-ready until every blocker above is verified
in the deployed environment. Historical records must be preserved while blockers are resolved.

DEPLOYMENT RUNBOOK:
1. Install the Supabase CLI and log in with the project owner account.
2. Link the project, then apply supabase-setup.sql in the Supabase SQL Editor. Review the
   migration output and verify that no statement failed.
3. Deploy the function with:
   supabase functions deploy student-auth --no-verify-jwt
4. Set these function secrets in the Supabase dashboard or CLI:
   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, and APP_ORIGINS.
   APP_ORIGINS must contain only the exact HTTPS origins that host this application.
5. Never expose SUPABASE_SERVICE_ROLE_KEY in browser code, static files, or client-side
   environment variables.
6. Verify the function preflight, valid login, invalid password, profile, password change,
   expired token, and account-isolation responses from the deployed HTTPS origin.
7. Configure scheduled Supabase database backups and an external uptime/alerting check.
   Record a restore test before changing the release decision.
