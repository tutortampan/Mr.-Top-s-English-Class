MR. TOP'S ENGLISH CLASS - VOCABULARY EXAMINATION SYSTEM

EXCEL FORMAT:
WEEK | DAY | TYPE | NO | INDONESIA | ENGLISH

Example:
4TH | 1 | VERB | 1 | MEMPEROLEH | ACQUIRE

STUDENT DATABASE FORMAT:
PROGRAM | CLASS | LEVEL | NAME | PHOTO

PHOTO is optional and can contain an image URL or data URL. Students can also
choose their own image before starting an exam. Their photo appears at the
top right of the exam page.

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
tutortampan
Tutor access remains active for the current browser tab until Log Out is selected.
This is a local browser access gate; a production online system should use server-side
authentication.

The admin navigation is split into compact Student Management, Class Management, and
Exam Management pages. These pages redirect to the tutor login when opened without
tutor authentication.

IMPORTANT:
The app now synchronizes its browser data with Supabase when the database table is configured.
To enable it, open the Supabase SQL Editor and run every statement in supabase-setup.sql,
then deploy all project files to Netlify. Local Storage remains available as an offline fallback.
Never add a Supabase service-role key to this browser app.
