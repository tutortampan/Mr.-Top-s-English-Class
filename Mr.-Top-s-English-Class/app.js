const STORAGE_EXAM = "cec_exam_v1";
const STORAGE_RESULT = "cec_result_v1";
const STORAGE_EXAMS = "cec_exams_v2";
const STORAGE_RESULTS = "cec_results_v2";
const STORAGE_ACTIVE_EXAM = "cec_active_exam_v2";
const STORAGE_STUDENTS = "cec_students_v1";
const STORAGE_STUDENT_PHOTOS = "cec_student_photos_v1";
const STORAGE_PROGRAMS = "cec_programs_v1";
const STORAGE_LEVELS = "cec_levels_v1";
const STORAGE_CLASSES = "cec_classes_v1";
const STORAGE_TUTOR_SESSION = "cec_tutor_session_v1";
const TUTOR_PASSWORD = "tutortampan";
let loadedQuestions = [];
let loadedStudents = [];
let loadedExamMetadata = {};

function isTutorAuthenticated() {
  return sessionStorage.getItem(STORAGE_TUTOR_SESSION) === "authenticated";
}

function displayName(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase());
}

function sentenceCase(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function authenticateTutor(password) {
  if (password !== TUTOR_PASSWORD) return false;
  sessionStorage.setItem(STORAGE_TUTOR_SESSION, "authenticated");
  return true;
}

function initProtectedShortcutPage() {
  if (!document.body.hasAttribute("data-admin-shortcut")) return;
  if (!isTutorAuthenticated()) window.location.href = "admin.html";
  document.querySelectorAll("[data-admin-logout]").forEach(button => {
    button.addEventListener("click", () => {
      sessionStorage.removeItem(STORAGE_TUTOR_SESSION);
      window.location.href = "index.html";
    });
  });
}

function initManagement() {
  const fileInput = document.getElementById("managementStudentFile");
  if (!fileInput) return;
  const authScreen = document.getElementById("managementAuthScreen");
  const content = document.getElementById("managementContent");

  function openManagement() {
    authScreen.classList.add("hidden");
    content.classList.remove("hidden");
    renderManagement();
  }

  const alreadyAuthenticated = isTutorAuthenticated();
  if (!alreadyAuthenticated) {
    document.getElementById("managementLoginForm").addEventListener("submit", event => {
      event.preventDefault();
      const password = document.getElementById("managementPassword");
      const error = document.getElementById("managementLoginError");
      if (!authenticateTutor(password.value)) {
        error.classList.remove("hidden");
        password.select();
        return;
      }
      openManagement();
    });
    return;
  }
  openManagement();

  function renderManagement() {
    let students = [];
    try {
      students = JSON.parse(localStorage.getItem(STORAGE_STUDENTS) || "[]");
    } catch (error) {
      students = [];
    }

    const optionLists = [
      ["managementProgramList", STORAGE_PROGRAMS, "program"],
      ["managementClassList", STORAGE_CLASSES, "class"],
      ["managementLevelList", STORAGE_LEVELS, "level"]
    ];
    optionLists.forEach(([elementId, key]) => {
      const element = document.getElementById(elementId);
      const values = getOptions(key, []).sort((a, b) => String(a).localeCompare(String(b)));
      element.innerHTML = values.length
        ? values.map(value => key === STORAGE_CLASSES
          ? `<div class="management-item class-management-item"><span>${escapeHtml(value)}</span><span class="option-edit-actions"><button class="btn warning small class-rename-btn hidden" data-value="${escapeHtml(value)}" type="button">Rename</button><button class="btn danger small class-delete-students-btn hidden" data-value="${escapeHtml(value)}" type="button">Delete Students</button></span></div>`
          : `<div class="management-item"><span>${escapeHtml(value)}</span><button class="btn danger small management-delete-option hidden" data-key="${key}" data-value="${escapeHtml(value)}" type="button">Delete</button></div>`).join("")
        : "<p class=\"small-note\">No stored options.</p>";
    });

    const filterIds = [
      ["managementFilterProgram", STORAGE_PROGRAMS, "All programs"],
      ["managementFilterClass", STORAGE_CLASSES, "All classes"],
      ["managementFilterLevel", STORAGE_LEVELS, "All levels"]
    ];
    filterIds.forEach(([id, key, label]) => {
      const select = document.getElementById(id);
      const current = select.value;
      const values = getOptions(key, []).sort((a, b) => String(a).localeCompare(String(b)));
      select.innerHTML = `<option value="">${label}</option>${values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
      select.value = values.includes(current) ? current : "";
    });

    const program = document.getElementById("managementFilterProgram").value;
    const className = document.getElementById("managementFilterClass").value;
    const level = document.getElementById("managementFilterLevel").value;
    const filtered = [...students].reverse().filter(student =>
      (!program || student.program === program) &&
      (!className || student.className === className) &&
      (!level || student.level === level)
    );
    const list = document.getElementById("managementStudentList");
    list.innerHTML = filtered.length
      ? filtered.map(student => `<div class="student-management-item"><span><strong>${escapeHtml(displayName(student.name))}</strong><small>${escapeHtml(student.program || "-")} · ${escapeHtml(student.className || "-")} · ${escapeHtml(student.level || "-")}</small></span><button class="btn danger small management-delete-student edit-only-control hidden" data-name="${escapeHtml(student.name)}" type="button">Delete</button></div>`).join("")
      : "<p class=\"small-note\">No stored students.</p>";

    document.querySelectorAll(".management-delete-option").forEach(button => {
      button.onclick = () => {
        if (!confirmThreeTimes(`Delete ${button.dataset.value}?`)) return;
        const remaining = getOptions(button.dataset.key, []).filter(value => value !== button.dataset.value);
        localStorage.setItem(button.dataset.key, JSON.stringify(remaining));
        renderManagement();
      };
    });
    document.querySelectorAll(".management-delete-student").forEach(button => {
      button.onclick = () => {
        if (!confirmThreeTimes(`Delete student ${button.dataset.name} and their saved photo?`)) return;
        const remaining = students.filter(student => student.name !== button.dataset.name);
        localStorage.setItem(STORAGE_STUDENTS, JSON.stringify(remaining));
        renderManagement();
      };
    });
    document.querySelectorAll(".class-rename-btn").forEach(button => {
      button.onclick = () => {
        const currentValue = button.dataset.value;
        const replacement = prompt("Rename this class:", currentValue);
        if (replacement === null || !replacement.trim() || replacement.trim() === currentValue) return;
        const nextValue = replacement.trim();
        const values = getOptions(STORAGE_CLASSES, []);
        if (values.some(value => value.toLowerCase() === nextValue.toLowerCase())) {
          alert("That class already exists.");
          return;
        }
        localStorage.setItem(STORAGE_CLASSES, JSON.stringify(values.map(value => value === currentValue ? nextValue : value)));
        const storedStudents = readStoredArray(STORAGE_STUDENTS);
        storedStudents.forEach(student => { if (student.className === currentValue) student.className = nextValue; });
        localStorage.setItem(STORAGE_STUDENTS, JSON.stringify(storedStudents));
        renderManagement();
      };
    });
    document.querySelectorAll(".class-delete-students-btn").forEach(button => {
      button.onclick = () => {
        const className = button.dataset.value;
        if (!confirmThreeTimes(`Delete all students in class ${className}?`)) return;
        localStorage.setItem(STORAGE_STUDENTS, JSON.stringify(readStoredArray(STORAGE_STUDENTS).filter(student => student.className !== className)));
        renderManagement();
      };
    });
    document.getElementById("editStudentsBtn").onclick = () => {
      document.querySelectorAll(".management-delete-student").forEach(button => button.classList.toggle("hidden"));
      document.getElementById("managementClearStudentsBtn").classList.toggle("hidden");
    };
    document.getElementById("editClassesBtn").onclick = () => {
      const enteringEditMode = button.dataset.editing !== "true";
      button.dataset.editing = enteringEditMode ? "true" : "false";
      button.textContent = enteringEditMode ? "OK" : "Edit Classes";
      button.classList.toggle("success", enteringEditMode);
      button.classList.toggle("secondary", !enteringEditMode);
      document.querySelectorAll(".management-delete-option,.class-rename-btn,.class-delete-students-btn").forEach(control => control.classList.toggle("hidden", !enteringEditMode));
    };
  }

  function addOption(key, inputId) {
    const input = document.getElementById(inputId);
    const value = input.value.trim();
    if (!value) return;
    saveOption(key, value);
    input.value = "";
    renderManagement();
  }

  document.getElementById("managementAddProgram").onclick = () => addOption(STORAGE_PROGRAMS, "managementNewProgram");
  document.getElementById("managementAddClass").onclick = () => addOption(STORAGE_CLASSES, "managementNewClass");
  document.getElementById("managementAddLevel").onclick = () => addOption(STORAGE_LEVELS, "managementNewLevel");
  ["managementFilterProgram", "managementFilterClass", "managementFilterLevel"].forEach(id => {
    document.getElementById(id).onchange = renderManagement;
  });
  document.getElementById("managementLogoutBtn").onclick = () => {
    sessionStorage.removeItem(STORAGE_TUTOR_SESSION);
    window.location.href = "index.html";
  };
  document.getElementById("managementDemoStudentsBtn").onclick = () => {
    localStorage.setItem(STORAGE_STUDENTS, JSON.stringify(demoStudents()));
    demoStudents().forEach(student => {
      if (student.program) saveOption(STORAGE_PROGRAMS, student.program);
      if (student.className) saveOption(STORAGE_CLASSES, student.className);
      if (student.level) saveOption(STORAGE_LEVELS, student.level);
    });
    renderManagement();
  };
  document.getElementById("managementClearStudentsBtn").onclick = () => {
    if (!confirmThreeTimes("Clear all students?")) return;
    localStorage.removeItem(STORAGE_STUDENTS);
    localStorage.removeItem(STORAGE_STUDENT_PHOTOS);
    renderManagement();
  };
  fileInput.onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), {type: "array"});
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {defval: ""});
      const imported = rows.map(row => {
        const normalized = normalizedSpreadsheetRow(row);
        return {
          name: normalized.NAME || normalized.STUDENT_NAME || normalized.STUDENT,
          className: normalized.CLASS || normalized.CLASS_NAME,
          program: normalized.PROGRAM,
          level: normalized.LEVEL || normalized.PROFICIENCY_LEVEL,
          photo: safePhotoUrl(normalized.PHOTO || normalized.PHOTO_URL)
        };
      }).filter(student => student.name);
      if (!imported.length) throw new Error("No student names found.");
      localStorage.setItem(STORAGE_STUDENTS, JSON.stringify(imported));
      imported.forEach(student => {
        if (student.program) saveOption(STORAGE_PROGRAMS, String(student.program).trim());
        if (student.className) saveOption(STORAGE_CLASSES, String(student.className).trim());
        if (student.level) saveOption(STORAGE_LEVELS, String(student.level).trim());
      });
      document.getElementById("managementStudentStatus").textContent = `Loaded: ${file.name}`;
      renderManagement();
    } catch (error) {
      document.getElementById("managementStudentStatus").textContent = "Error: Please check the student database format.";
      alert("The student database could not be read. Make sure it contains a NAME column.");
    }
  };
  if (alreadyAuthenticated) openManagement();
}

function initLanding() {
  const roleSelect = document.getElementById("userRole");
  const continueButton = document.getElementById("continueRoleBtn");
  if (!roleSelect || !continueButton) return;
  const passwordBox = document.getElementById("tutorPasswordBox");
  const passwordInput = document.getElementById("tutorPassword");
  const error = document.getElementById("roleError");

  function updateRole() {
    const tutorSelected = roleSelect.value === "tutor";
    passwordBox.classList.toggle("hidden", !tutorSelected);
    passwordInput.required = tutorSelected;
    continueButton.textContent = tutorSelected ? "Open Tutor Panel" : "Continue as Student";
    error.classList.add("hidden");
  }

  roleSelect.addEventListener("change", updateRole);
  continueButton.addEventListener("click", () => {
    if (roleSelect.value === "student") {
      window.location.href = "exam.html";
      return;
    }
    if (!authenticateTutor(passwordInput.value)) {
      error.textContent = "Incorrect tutor password.";
      error.classList.remove("hidden");
      passwordInput.select();
      return;
    }
    window.location.href = "admin.html";
  });
  updateRole();
}

function normalize(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function editDistance(first, second) {
  const previous = Array.from({length: second.length + 1}, (_, index) => index);
  for (let row = 1; row <= first.length; row++) {
    const current = [row];
    for (let column = 1; column <= second.length; column++) {
      current[column] = first[row - 1] === second[column - 1]
        ? previous[column - 1]
        : Math.min(previous[column - 1], previous[column], current[column - 1]) + 1;
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[second.length];
}

function answerValue(studentAnswer, correctAnswer) {
  const student = normalize(studentAnswer);
  const correct = normalize(correctAnswer);
  if (!student || !correct) return 0;
  if (student === correct) return 1;
  return editDistance(student, correct) <= 2 ? 0.5 : 0;
}

function getGrade(score) {
  const percentage = Number(score) || 0;
  if (percentage >= 100) return "S";
  if (percentage >= 90) return "A";
  if (percentage >= 70) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 30) return "D";
  if (percentage >= 10) return "E";
  return "F";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function safePhotoUrl(value) {
  const photo = String(value ?? "").trim();
  return /^(https?:\/\/|data:image\/)/i.test(photo) ? photo : "";
}

function normalizeQuestionType(value) {
  const type = String(value || "VOCABULARY").trim().toUpperCase();
  return ["IDIOM", "PROVERB", "EXPRESSION", "EXPRESSIONS_PROVERBS_IDIOMS"].includes(type)
    ? (type === "EXPRESSIONS_PROVERBS_IDIOMS" ? type : "EXPRESSIONS_PROVERBS_IDIOMS")
    : "VOCABULARY";
}

function readStoredArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (error) {
    return [];
  }
}

function getExams() {
  const exams = readStoredArray(STORAGE_EXAMS);
  if (exams.length) return exams.map(exam => ({
    ...exam,
    examType: normalizeQuestionType(exam.examType),
    minimumScore: Number.isFinite(Number(exam.minimumScore)) ? Number(exam.minimumScore) : 60
  }));
  const legacy = localStorage.getItem(STORAGE_EXAM);
  if (!legacy) return [];
  try {
    const exam = JSON.parse(legacy);
    return [{...exam, id: exam.id || `exam-${Date.now()}`, examType: normalizeQuestionType(exam.examType), prerequisiteExamId: "", minimumScore: 60, randomizeQuestions: false}];
  } catch (error) {
    return [];
  }
}

function getResults() {
  const results = readStoredArray(STORAGE_RESULTS);
  if (results.length) return results;
  const legacy = localStorage.getItem(STORAGE_RESULT);
  if (!legacy) return [];
  try { return [JSON.parse(legacy)]; } catch (error) { return []; }
}

function questionFromRow(row, index, defaultType) {
  const normalizedRow = {};
  Object.keys(row).forEach(key => normalizedRow[String(key).trim().toUpperCase().replace(/\s+/g, "_")] = row[key]);
  const options = "ABCDEFGHIJ".split("").map(letter => normalizedRow[`OPTION_${letter}`]).filter(Boolean);
  const type = normalizeQuestionType(normalizedRow.TYPE || defaultType);
  const correctOption = normalizedRow.CORRECT_OPTION || normalizedRow.CORRECT_ANSWER;
  const correctOptionIndex = /^[A-J]$/i.test(String(correctOption || "")) ? String(correctOption).toUpperCase().charCodeAt(0) - 65 : -1;
  return {
    week: normalizedRow.WEEK,
    day: normalizedRow.DAY,
    type,
    no: normalizedRow.NO || index + 1,
    indonesia: normalizedRow.QUESTION || normalizedRow.INDONESIA,
    english: normalizedRow.ENGLISH || normalizedRow.ANSWER || normalizedRow.CORRECT_ANSWER,
    options: options.length ? options : String(normalizedRow.OPTIONS || "").split("|").map(option => option.trim()).filter(Boolean),
    correctOption: correctOptionIndex >= 0 ? options[correctOptionIndex] : correctOption
  };
}

function normalizedSpreadsheetRow(row) {
  const normalized = {};
  Object.keys(row).forEach(key => {
    normalized[String(key).trim().toUpperCase().replace(/\s+/g, "_")] = row[key];
  });
  return normalized;
}

function firstSpreadsheetValue(rows, keys) {
  for (const row of rows) {
    for (const key of keys) {
      if (row[key] !== undefined && String(row[key]).trim()) return String(row[key]).trim();
    }
  }
  return "";
}

function demoStudents() {
  return [
    {name:"Alex Johnson", className:"10A", program:"General English", level:"Intermediate", photo:""},
    {name:"Maria Santos", className:"10B", program:"General English", level:"Intermediate", photo:""},
    {name:"Rizky Pratama", className:"11A", program:"Business English", level:"Upper-Intermediate", photo:""}
  ];
}

function getOptions(key, defaults) {
  const stored = readStoredArray(key);
  return stored.length ? stored : defaults;
}

function saveOption(key, value) {
  const values = getOptions(key, []);
  if (!values.some(item => String(item).toLowerCase() === value.toLowerCase())) {
    values.push(value);
    localStorage.setItem(key, JSON.stringify(values));
  }
  return values;
}

function confirmThreeTimes(message) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (!confirm(`${message}\n\nConfirmation ${attempt} of 3.`)) return false;
  }
  return true;
}

function examTypeLabel(type) {
  return normalizeQuestionType(type) === "EXPRESSIONS_PROVERBS_IDIOMS"
    ? "Expressions, Proverbs, and Idioms"
    : "Vocabulary";
}

function demoQuestions() {
  return [
    {week:"4TH",day:"1",type:"VERB",no:1,indonesia:"MEMPEROLEH",english:"ACQUIRE"},
    {week:"4TH",day:"1",type:"VERB",no:2,indonesia:"BERADAPTASI",english:"ADAPT"},
    {week:"4TH",day:"1",type:"VERB",no:3,indonesia:"MENGANTISIPASI",english:"ANTICIPATE"},
    {week:"4TH",day:"1",type:"VERB",no:4,indonesia:"MENCAPAI",english:"ACHIEVE"},
    {week:"4TH",day:"1",type:"VERB",no:5,indonesia:"MENGHINDARI",english:"AVOID"}
  ];
}

/* ================= ADMIN ================= */
function initAdmin() {
  const fileInput = document.getElementById("excelFile");
  if (!fileInput) return;
  const authScreen = document.getElementById("adminAuthScreen");
  const adminContent = document.getElementById("adminContent");
  if (!isTutorAuthenticated()) {
    authScreen.classList.remove("hidden");
    adminContent.classList.add("hidden");
    document.getElementById("adminLoginForm").addEventListener("submit", event => {
      event.preventDefault();
      const password = document.getElementById("adminPassword");
      const error = document.getElementById("adminLoginError");
      if (!authenticateTutor(password.value)) {
        error.classList.remove("hidden");
        password.select();
        return;
      }
      authScreen.classList.add("hidden");
      adminContent.classList.remove("hidden");
      initAdmin();
    });
    return;
  }
  authScreen.classList.add("hidden");
  adminContent.classList.remove("hidden");

  const status = document.getElementById("fileStatus");
  const count = document.getElementById("questionCount");
  const preview = document.getElementById("previewTable");
  const studentFile = document.getElementById("studentFile");
  const studentStatus = document.getElementById("studentFileStatus");
  const studentCount = document.getElementById("studentCount");
  const studentPreview = document.getElementById("studentPreviewTable");
  document.getElementById("adminLogoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem(STORAGE_TUTOR_SESSION);
    window.location.href = "index.html";
  });

  function refreshManagedOptions() {
    const programs = getOptions(STORAGE_PROGRAMS, []).sort((first, second) => String(first).localeCompare(String(second)));
    const levels = getOptions(STORAGE_LEVELS, []).sort((first, second) => String(first).localeCompare(String(second)));
    const classes = getOptions(STORAGE_CLASSES, []).sort((first, second) => String(first).localeCompare(String(second)));
    const programSelect = document.getElementById("examProgram");
    const levelSelect = document.getElementById("examLevel");
    const classSelect = document.getElementById("examClass");
    const selectedProgram = programSelect.value;
    const selectedLevel = levelSelect.value;
    const selectedClass = classSelect.value;
    programSelect.innerHTML = `<option value="">All programs</option>${programs.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
    levelSelect.innerHTML = `<option value="">All levels</option>${levels.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
    classSelect.innerHTML = `<option value="">All classes</option>${classes.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
    programSelect.value = programs.includes(selectedProgram) ? selectedProgram : "";
    levelSelect.value = levels.includes(selectedLevel) ? selectedLevel : "";
    classSelect.value = classes.includes(selectedClass) ? selectedClass : "";
  }

  function addManagedOption(key, inputId) {
    const input = document.getElementById(inputId);
    const value = input.value.trim();
    if (!value) return;
    saveOption(key, value);
    input.value = "";
    refreshManagedOptions();
    refreshManagementFilters();
    renderManagedLists();
  }

  function renderManagedLists() {
    const lists = [
      ["programManagementList", STORAGE_PROGRAMS, "program"],
      ["classManagementList", STORAGE_CLASSES, "class"],
      ["levelManagementList", STORAGE_LEVELS, "level"]
    ];
    lists.forEach(([elementId, storageKey, label]) => {
      const element = document.getElementById(elementId);
      const values = getOptions(storageKey, []).sort((first, second) => String(first).localeCompare(String(second)));
      element.innerHTML = values.length
        ? values.map(value => `<div class="management-item"><span>${escapeHtml(value)}</span><button class="btn danger small delete-option-btn hidden" data-storage-key="${storageKey}" data-option-value="${escapeHtml(value)}" type="button">Delete</button></div>`).join("")
        : "<p class=\"small-note\">No stored options.</p>";
    });

    document.querySelectorAll(".delete-option-btn").forEach(button => {
      button.addEventListener("click", () => {
        const value = button.dataset.optionValue;
        if (!confirmThreeTimes(`Delete ${value} from the stored ${button.dataset.storageKey.replace("cec_", "").replace("_v1", "")} list?`)) return;
        const remaining = getOptions(button.dataset.storageKey, []).filter(item => item !== value);
        localStorage.setItem(button.dataset.storageKey, JSON.stringify(remaining));
        refreshManagedOptions();
        renderManagedLists();
      });
    });
  }

  function renderStudentManagementList() {
    const element = document.getElementById("studentManagementList");
    const programFilter = document.getElementById("studentManagementProgram").value;
    const classFilter = document.getElementById("studentManagementClass").value;
    const levelFilter = document.getElementById("studentManagementLevel").value;
    const students = loadedStudents.filter(student =>
      (!programFilter || student.program === programFilter) &&
      (!classFilter || student.className === classFilter) &&
      (!levelFilter || student.level === levelFilter)
    ).sort((first, second) => String(first.name).localeCompare(String(second.name)));
    element.innerHTML = students.length
      ? students.map(student => `<div class="student-management-item"><span><strong>${escapeHtml(displayName(student.name))}</strong><small>${escapeHtml(student.program || "-")} · ${escapeHtml(student.className || "-")} · ${escapeHtml(student.level || "-")}</small></span><button class="btn danger small delete-student-btn" data-student-name="${escapeHtml(student.name)}" type="button">Delete</button></div>`).join("")
      : "<p class=\"small-note\">No stored students.</p>";

    element.querySelectorAll(".delete-student-btn").forEach(button => {
      button.addEventListener("click", () => {
        const name = button.dataset.studentName;
        if (!confirmThreeTimes(`Delete student ${name} and their saved photo?`)) return;
        loadedStudents = loadedStudents.filter(student => student.name !== name);
        localStorage.setItem(STORAGE_STUDENTS, JSON.stringify(loadedStudents));
        try {
          const photos = JSON.parse(localStorage.getItem(STORAGE_STUDENT_PHOTOS) || "{}");
          delete photos[name];
          localStorage.setItem(STORAGE_STUDENT_PHOTOS, JSON.stringify(photos));
        } catch (error) {
          localStorage.removeItem(STORAGE_STUDENT_PHOTOS);
        }
        showStudentPreview();
        renderStudentManagementList();
        showCurrentExam();
      });
    });
  }

  function refreshManagementFilters() {
    const options = [
      ["studentManagementProgram", STORAGE_PROGRAMS, "All programs"],
      ["studentManagementClass", STORAGE_CLASSES, "All classes"],
      ["studentManagementLevel", STORAGE_LEVELS, "All levels"],
      ["examManagementProgram", STORAGE_PROGRAMS, "All programs"],
      ["examManagementClass", STORAGE_CLASSES, "All classes"],
      ["examManagementLevel", STORAGE_LEVELS, "All levels"]
    ];
    options.forEach(([id, key, emptyLabel]) => {
      const select = document.getElementById(id);
      const current = select.value;
      const values = getOptions(key, []).sort((first, second) => String(first).localeCompare(String(second)));
      select.innerHTML = `<option value="">${emptyLabel}</option>${values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
      select.value = values.includes(current) ? current : "";
    });
  }

  function getExamManagementFilters() {
    return {
      program: document.getElementById("examManagementProgram").value,
      className: document.getElementById("examManagementClass").value,
      level: document.getElementById("examManagementLevel").value
    };
  }

  function showPreview() {
    count.textContent = loadedQuestions.length;
    if (!loadedQuestions.length) {
      preview.innerHTML = "";
      return;
    }
    const rows = loadedQuestions.slice(0, 8).map(q => `
      <tr><td>${escapeHtml(q.no)}</td><td>${escapeHtml(q.type)}</td>
      <td>${escapeHtml(q.indonesia)}</td><td>${escapeHtml((q.options || []).join(" / ") || q.english)}</td></tr>`).join("");
    preview.innerHTML = `<table class="preview-table">
      <thead><tr><th>No</th><th>Type</th><th>Indonesia</th><th>English</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p class="small-note">Showing the first ${Math.min(8, loadedQuestions.length)} questions.</p>`;
  }

  function showStudentPreview() {
    studentCount.textContent = loadedStudents.length;
    if (!loadedStudents.length) {
      studentPreview.innerHTML = "";
      return;
    }
    const rows = [...loadedStudents].reverse().slice(0, 8).map(student => `
      <tr><td>${escapeHtml(student.program)}</td><td>${escapeHtml(student.className)}</td>
      <td>${escapeHtml(student.level)}</td><td>${escapeHtml(displayName(student.name))}</td>
      <td>${student.photo ? `<img class="roster-photo" src="${escapeHtml(student.photo)}" alt="">` : "-"}</td></tr>`).join("");
    studentPreview.innerHTML = `<table class="preview-table roster-table">
      <thead><tr><th>Program</th><th>Class</th><th>Level</th><th>Name</th><th>Photo</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p class="small-note">Showing the first ${Math.min(8, loadedStudents.length)} students.</p>`;
    renderStudentManagementList();
  }

  function loadStoredStudents() {
    try {
      loadedStudents = JSON.parse(localStorage.getItem(STORAGE_STUDENTS) || "[]");
    } catch (error) {
      loadedStudents = [];
    }
    loadedStudents.forEach(student => {
      if (student.program) saveOption(STORAGE_PROGRAMS, String(student.program).trim());
      if (student.level) saveOption(STORAGE_LEVELS, String(student.level).trim());
      if (student.className) saveOption(STORAGE_CLASSES, String(student.className).trim());
    });
    showStudentPreview();
    renderStudentManagementList();
    if (loadedStudents.length) studentStatus.textContent = "Saved student database loaded.";
  }

  fileInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    status.textContent = "Reading Excel file...";
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, {type:"array"});
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, {defval:""});
      const normalizedRows = rows.map(normalizedSpreadsheetRow);
      const importedType = firstSpreadsheetValue(normalizedRows, ["TYPE"]);
      loadedExamMetadata = {
        program: firstSpreadsheetValue(normalizedRows, ["PROGRAM"]),
        level: firstSpreadsheetValue(normalizedRows, ["LEVEL"]),
        className: firstSpreadsheetValue(normalizedRows, ["CLASS", "CLASS_NAME"]),
        examType: importedType
      };

      loadedQuestions = rows.map((row, index) => questionFromRow(row, index, document.getElementById("examType").value))
        .filter(q => q.indonesia && (q.english || q.options.length));

      if (!loadedQuestions.length) throw new Error("No valid questions found.");
      if (loadedExamMetadata.program) saveOption(STORAGE_PROGRAMS, loadedExamMetadata.program);
      if (loadedExamMetadata.level) saveOption(STORAGE_LEVELS, loadedExamMetadata.level);
      if (loadedExamMetadata.className) saveOption(STORAGE_CLASSES, loadedExamMetadata.className);
      refreshManagedOptions();
      refreshManagementFilters();
      refreshManagementFilters();
      if (loadedExamMetadata.program) document.getElementById("examProgram").value = loadedExamMetadata.program;
      if (loadedExamMetadata.level) document.getElementById("examLevel").value = loadedExamMetadata.level;
      if (loadedExamMetadata.className) document.getElementById("examClass").value = loadedExamMetadata.className;
      if (loadedExamMetadata.examType) {
        const importedExamType = normalizeQuestionType(loadedExamMetadata.examType);
        document.getElementById("examType").value = importedExamType;
      }
      updateGeneratedTitle();
      status.innerHTML = `Loaded: <strong>${escapeHtml(file.name)}</strong>`;
      showPreview();
    } catch (error) {
      loadedQuestions = [];
      loadedExamMetadata = {};
      status.textContent = "Error: Please check the Excel format.";
      alert("The Excel file could not be read. Make sure it contains INDONESIA and ENGLISH columns.");
      showPreview();
    }
  });

  studentFile.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    studentStatus.textContent = "Reading student database...";
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, {type:"array"});
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, {defval:""});

      loadedStudents = rows.map(row => {
        const normalizedRow = {};
        Object.keys(row).forEach(key => normalizedRow[String(key).trim().toUpperCase().replace(/\s+/g, "_")] = row[key]);
        return {
          name: normalizedRow.NAME || normalizedRow.STUDENT_NAME || normalizedRow.STUDENT,
          className: normalizedRow.CLASS || normalizedRow.CLASS_NAME,
          program: normalizedRow.PROGRAM,
          level: normalizedRow.LEVEL || normalizedRow.PROFICIENCY_LEVEL,
          photo: safePhotoUrl(normalizedRow.PHOTO || normalizedRow.PHOTO_URL)
        };
      }).filter(student => student.name);

      if (!loadedStudents.length) throw new Error("No student names found.");
      localStorage.setItem(STORAGE_STUDENTS, JSON.stringify(loadedStudents));
      loadedStudents.forEach(student => {
        if (student.program) saveOption(STORAGE_PROGRAMS, String(student.program).trim());
        if (student.level) saveOption(STORAGE_LEVELS, String(student.level).trim());
        if (student.className) saveOption(STORAGE_CLASSES, String(student.className).trim());
      });
      refreshManagedOptions();
      studentStatus.innerHTML = `Loaded: <strong>${escapeHtml(file.name)}</strong>`;
      showStudentPreview();
    } catch (error) {
      loadedStudents = [];
      studentStatus.textContent = "Error: Please check the student database format.";
      alert("The student database could not be read. Make sure it contains a NAME column.");
      showStudentPreview();
    }
  });

  document.getElementById("loadDemoBtn").addEventListener("click", () => {
    loadedQuestions = demoQuestions();
    loadedExamMetadata = {};
    status.textContent = "Demo data loaded.";
    updateGeneratedTitle();
    showPreview();
  });

  function refreshPrerequisites() {
    const select = document.getElementById("prerequisiteExam");
    const exams = getExams();
    select.innerHTML = `<option value="">No prerequisite</option>${exams.map(exam =>
      `<option value="${escapeHtml(exam.id)}">${escapeHtml(exam.title)}</option>`).join("")}`;
  }

  function refreshExamEditorSelect() {
    const select = document.getElementById("editExamSelect");
    select.innerHTML = `<option value="">Select an exam</option>${getExams().map(exam =>
      `<option value="${escapeHtml(exam.id)}">${escapeHtml(exam.title)}</option>`).join("")}`;
  }

  document.getElementById("loadDemoStudentsBtn").addEventListener("click", () => {
    loadedStudents = demoStudents();
    localStorage.setItem(STORAGE_STUDENTS, JSON.stringify(loadedStudents));
    studentStatus.textContent = "Demo students loaded.";
    showStudentPreview();
  });

  document.getElementById("clearStudentsBtn").addEventListener("click", () => {
    if (confirmThreeTimes("Delete the student database and saved student photos?")) {
      loadedStudents = [];
      localStorage.removeItem(STORAGE_STUDENTS);
      localStorage.removeItem(STORAGE_STUDENT_PHOTOS);
      studentStatus.textContent = "No student database loaded.";
      showStudentPreview();
    }
  });

  document.getElementById("addProgramBtn").addEventListener("click", () => addManagedOption(STORAGE_PROGRAMS, "newProgram"));
  document.getElementById("addLevelBtn").addEventListener("click", () => addManagedOption(STORAGE_LEVELS, "newLevel"));
  document.getElementById("addClassBtn").addEventListener("click", () => addManagedOption(STORAGE_CLASSES, "newClass"));

  function updateGeneratedTitle() {
    const program = document.getElementById("examProgram").value || "All Programs";
    const level = document.getElementById("examLevel").value || "All Levels";
    const className = document.getElementById("examClass").value || "All Classes";
    document.getElementById("examTitle").value = `${program} - ${level} - ${className} - ${examTypeLabel(document.getElementById("examType").value)}`;
  }

  ["examProgram", "examLevel", "examClass", "examType"].forEach(id => {
    document.getElementById(id).addEventListener("change", updateGeneratedTitle);
  });

  document.getElementById("createExamBtn").addEventListener("click", () => {
    if (!loadedQuestions.length) {
      alert("Please upload an Excel file first.");
      return;
    }
    const title = document.getElementById("examTitle").value.trim() || "Mr. Top's English Class - Vocabulary Examination";
    const duration = Number(document.getElementById("duration").value);
    if (!duration || duration < 1) {
      alert("Please enter a valid duration.");
      return;
    }
    const exam = {
      id: `exam-${Date.now()}`,
      title,
      duration,
      examType: normalizeQuestionType(document.getElementById("examType").value),
      randomizeQuestions: document.getElementById("questionOrder").value === "random",
      program: document.getElementById("examProgram").value.trim(),
      level: document.getElementById("examLevel").value.trim(),
      className: document.getElementById("examClass").value.trim(),
      prerequisiteExamId: document.getElementById("prerequisiteExam").value,
      minimumScore: Math.min(100, Math.max(0, Number(document.getElementById("minimumScore").value) || 0)),
      createdAt: new Date().toISOString(),
      questions: loadedQuestions
    };
    const exams = getExams().filter(item => item.id !== exam.id);
    exams.push(exam);
    localStorage.setItem(STORAGE_EXAMS, JSON.stringify(exams));
    localStorage.setItem(STORAGE_ACTIVE_EXAM, exam.id);
    alert(`Exam created successfully with ${loadedQuestions.length} questions!`);
    refreshPrerequisites();
    refreshExamEditorSelect();
    showCurrentExam();
  });

  document.getElementById("clearExamBtn").addEventListener("click", () => {
    if (confirmThreeTimes("Delete all exams? Student results will be kept.")) {
      localStorage.removeItem(STORAGE_EXAM);
      localStorage.removeItem(STORAGE_EXAMS);
      localStorage.removeItem(STORAGE_ACTIVE_EXAM);
      document.getElementById("examEditor").innerHTML = "";
      refreshPrerequisites();
      refreshExamEditorSelect();
      showCurrentExam();
    }
  });

  function showCurrentExam() {
    const box = document.getElementById("currentExamInfo");
    const filters = getExamManagementFilters();
    const exams = getExams().filter(exam =>
      (!filters.program || exam.program === filters.program) &&
      (!filters.className || exam.className === filters.className) &&
      (!filters.level || exam.level === filters.level)
    );
    if (!exams.length) {
      box.textContent = "No exams have been created yet.";
      return;
    }
    box.innerHTML = `<div class="exam-library">${exams.map(exam => {
      const prerequisite = exams.find(item => item.id === exam.prerequisiteExamId);
      return `<article class="exam-library-item"><strong>${escapeHtml(exam.title)}</strong>
        <span>${escapeHtml(exam.program || "All programs")} · ${escapeHtml(exam.level || "All levels")} · ${escapeHtml(exam.className || "All classes")} · ${escapeHtml(examTypeLabel(exam.examType))} · ${exam.questions.length} questions · ${exam.duration} minutes</span>
        <span>${prerequisite ? `Requires ${escapeHtml(prerequisite.title)} at ${exam.minimumScore}%` : "No prerequisite"}</span>
        <button class="btn danger small delete-exam-btn edit-only-control hidden" data-exam-id="${escapeHtml(exam.id)}" type="button">Delete This Exam</button></article>`;
    }).join("")}</div>
    <p class="small-note">${loadedStudents.length} registered students</p>`;

    box.querySelectorAll(".delete-exam-btn").forEach(button => {
      button.addEventListener("click", () => {
        const examId = button.dataset.examId;
        const target = exams.find(item => item.id === examId);
        if (!target) return;
        const dependent = exams.find(item => item.prerequisiteExamId === examId);
        if (dependent) {
          alert(`Cannot delete this exam because ${dependent.title} uses it as a prerequisite.`);
          return;
        }
        if (!confirmThreeTimes(`Delete ${target.title}? Student results will be kept.`)) return;
        const remaining = exams.filter(item => item.id !== examId);
        localStorage.setItem(STORAGE_EXAMS, JSON.stringify(remaining));
        if (localStorage.getItem(STORAGE_ACTIVE_EXAM) === examId) {
          localStorage.setItem(STORAGE_ACTIVE_EXAM, remaining[0]?.id || "");
        }
        refreshPrerequisites();
        refreshExamEditorSelect();
        showCurrentExam();
        renderStudentResults();
      });
      });
      document.getElementById("editExamsBtn").onclick = () => {
        box.querySelectorAll(".delete-exam-btn").forEach(button => button.classList.toggle("hidden"));
        document.getElementById("clearExamBtn").classList.toggle("hidden");
      };
  }

  function renderStudentResults() {
    const box = document.getElementById("studentResultsTable");
    const results = getResults();
    if (!results.length) {
      box.innerHTML = "<p class=\"small-note\">No student results yet.</p>";
      return;
    }
    box.innerHTML = `<div class="results-table-wrap"><table class="preview-table results-table">
      <thead><tr><th>Student</th><th>Program</th><th>Class</th><th>Level</th><th>Exam</th><th>Correct / Total</th><th>Points</th><th>Score</th><th>Grade</th></tr></thead>
      <tbody>${results.map(result => `<tr>
        <td>${escapeHtml(displayName(result.studentName))}</td><td>${escapeHtml(result.studentProgram || "-")}</td>
        <td>${escapeHtml(result.studentClass || "-")}</td><td>${escapeHtml(result.studentLevel || "-")}</td>
        <td>${escapeHtml(result.examTitle)}</td><td>${result.correct} / ${result.total}</td>
        <td>${result.points ?? result.correct} / ${result.total}</td><td>${result.score}%</td>
        <td><strong class="grade-${escapeHtml(result.grade || getGrade(result.score))}">${escapeHtml(result.grade || getGrade(result.score))}</strong></td>
      </tr>`).join("")}</tbody></table></div>`;
  }
  loadStoredStudents();
  refreshManagedOptions();
  refreshManagementFilters();
  renderManagedLists();
  renderStudentManagementList();
  updateGeneratedTitle();
  refreshPrerequisites();
  refreshExamEditorSelect();
  showCurrentExam();
  renderStudentResults();

  ["studentManagementProgram", "studentManagementClass", "studentManagementLevel"].forEach(id => {
    document.getElementById(id).addEventListener("change", renderStudentManagementList);
  });
  ["examManagementProgram", "examManagementClass", "examManagementLevel"].forEach(id => {
    document.getElementById(id).addEventListener("change", showCurrentExam);
  });

  document.getElementById("exportResultsBtn").addEventListener("click", () => {
    const results = getResults();
    if (!results.length) {
      alert("There are no results to export yet.");
      return;
    }
    const rows = results.map(result => ({
      EXAM: result.examTitle,
      PROGRAM: result.studentProgram || "",
      LEVEL: result.studentLevel || "",
      STUDENT: result.studentName,
      CLASS: result.studentClass || "",
      SCORE: result.score,
      POINTS: `${result.points ?? result.correct} / ${result.total}`,
      GRADE: result.grade || getGrade(result.score),
      CORRECT: result.correct,
      HALF_CREDIT: result.halfCredit || 0,
      WRONG: result.wrong,
      TOTAL: result.total,
      EXAM_DATE: result.examDate || "",
      SUBMITTED_AT: result.submittedAt || ""
    }));
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, "Results");
    XLSX.writeFile(workbook, "mr-tops-english-class-results.xlsx");
  });

  document.getElementById("loadExamEditorBtn").addEventListener("click", () => {
    const exam = getExams().find(item => item.id === document.getElementById("editExamSelect").value);
    const editor = document.getElementById("examEditor");
    if (!exam) {
      editor.innerHTML = "<p class=\"small-note\">Choose an exam first.</p>";
      return;
    }
    const programs = getOptions(STORAGE_PROGRAMS, []);
    const levels = getOptions(STORAGE_LEVELS, []);
    const classes = getOptions(STORAGE_CLASSES, []);
    editor.innerHTML = `<label>Exam Title</label><input id="editTitle" value="${escapeHtml(exam.title)}">
      <label>Program</label><select id="editProgram"><option value="">All programs</option>${programs.map(value => `<option value="${escapeHtml(value)}" ${value === exam.program ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select>
      <label>Level</label><select id="editLevel"><option value="">All levels</option>${levels.map(value => `<option value="${escapeHtml(value)}" ${value === exam.level ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select>
      <label>Class</label><select id="editClass"><option value="">All classes</option>${classes.map(value => `<option value="${escapeHtml(value)}" ${value === exam.className ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select>
      <label>Duration (minutes)</label><input id="editDuration" type="number" min="1" value="${exam.duration}">
      <label>Question Order</label><select id="editQuestionOrder"><option value="ordered" ${exam.randomizeQuestions ? "" : "selected"}>Show questions in order</option><option value="random" ${exam.randomizeQuestions ? "selected" : ""}>Randomize questions</option></select>
      <label>Clearance Score (%)</label><input id="editMinimumScore" type="number" min="0" max="100" value="${Number(exam.minimumScore ?? 60)}">
      <div class="editor-questions">${exam.questions.map((question, index) => `<div class="editor-question" data-index="${index}">
        <strong>Question ${index + 1}</strong>
        <input class="edit-question" value="${escapeHtml(question.indonesia)}" placeholder="Question">
        <input class="edit-answer" value="${escapeHtml(question.english || "")}" placeholder="Correct answer">
        <input class="edit-options" value="${escapeHtml((question.options || []).join(" | "))}" placeholder="Options separated by |">
      </div>`).join("")}</div>
      <button id="saveExamEditorBtn" class="btn primary">Save Exam Changes</button>`;

    document.getElementById("saveExamEditorBtn").addEventListener("click", () => {
      const exams = getExams();
      const target = exams.find(item => item.id === exam.id);
      target.title = document.getElementById("editTitle").value.trim() || target.title;
      target.program = document.getElementById("editProgram").value.trim();
      target.level = document.getElementById("editLevel").value.trim();
      target.className = document.getElementById("editClass").value.trim();
      target.duration = Math.max(1, Number(document.getElementById("editDuration").value) || target.duration);
      target.randomizeQuestions = document.getElementById("editQuestionOrder").value === "random";
      target.minimumScore = Math.min(100, Math.max(0, Number(document.getElementById("editMinimumScore").value) || 0));
      target.questions = Array.from(editor.querySelectorAll(".editor-question")).map((row, index) => ({
        ...target.questions[index],
        indonesia: row.querySelector(".edit-question").value.trim(),
        english: row.querySelector(".edit-answer").value.trim(),
        options: row.querySelector(".edit-options").value.split("|").map(option => option.trim()).filter(Boolean)
      }));
      localStorage.setItem(STORAGE_EXAMS, JSON.stringify(exams));
      refreshPrerequisites();
      refreshExamEditorSelect();
      showCurrentExam();
      renderStudentResults();
      alert("Exam changes saved.");
    });
  });
}

/* ================= EXAM ================= */
function initExam() {
  const startScreen = document.getElementById("startScreen");
  if (!startScreen) return;

  const exams = getExams();
  if (!exams.length) {
    startScreen.classList.add("hidden");
    document.getElementById("noExamScreen").classList.remove("hidden");
    return;
  }

  let exam = exams.find(item => item.id === localStorage.getItem(STORAGE_ACTIVE_EXAM)) || exams[0];
  let activeQuestions = exam.questions;
  const examSelect = document.getElementById("examSelect");
  const studentProgress = document.getElementById("studentProgress");
  const studentHistory = document.getElementById("studentHistory");

  function updateExamSummary() {
    exam = exams.find(item => item.id === examSelect.value) || exams[0];
    activeQuestions = exam.questions;
    document.getElementById("startTitle").textContent = exam.title;
    document.getElementById("startDescription").textContent =
      `${exam.examType || "VOCABULARY"} · ${exam.questions.length} questions · ${exam.duration} minutes`;
    updateStudentProgress();
  }

  let students = [];
  try {
    students = JSON.parse(localStorage.getItem(STORAGE_STUDENTS) || "[]");
  } catch (error) {
    students = [];
  }

  function matchesStudent(examItem, student) {
    if (!student) return true;
    const programMatches = !examItem.program || String(examItem.program).toLowerCase() === String(student.program || "").toLowerCase();
    return programMatches;
  }

  function refreshExamOptions() {
    const student = students[Number(studentSelect.value)];
    const available = exams.filter(item => matchesStudent(item, student));
    if (!available.length) {
      examSelect.innerHTML = "<option value=\"\">No exam for this program and level</option>";
      studentProgress.textContent = "No exam is available for this program and level.";
      return;
    }
    if (!available.some(item => item.id === exam.id)) exam = available[0];
    examSelect.innerHTML = available.map(item =>
      `<option value="${escapeHtml(item.id)}" ${item.id === exam.id ? "selected" : ""}>${escapeHtml(item.title)}</option>`).join("");
    updateExamSummary();
  }

  const studentSelect = document.getElementById("studentName");
  const studentProfile = document.getElementById("studentProfile");
  const studentPhoto = document.getElementById("studentPhoto");
  const studentProfileName = document.getElementById("studentProfileName");
  const studentProfileClass = document.getElementById("studentProfileClass");
  const studentProfileProgram = document.getElementById("studentProfileProgram");
  const studentProfileLevel = document.getElementById("studentProfileLevel");
  const studentPhotoUpload = document.getElementById("studentPhotoUpload");
  const studentPhotoLabel = document.getElementById("studentPhotoLabel");
  const studentPhotoHint = document.getElementById("studentPhotoHint");
  const examStudentPhoto = document.getElementById("examStudentPhoto");
  let photoOverrides = {};
  try {
    photoOverrides = JSON.parse(localStorage.getItem(STORAGE_STUDENT_PHOTOS) || "{}");
  } catch (error) {
    photoOverrides = {};
  }

  studentSelect.innerHTML = students.length
    ? `<option value="">Select your name</option>${students.map((student, index) =>
      `<option value="${index}">${escapeHtml(displayName(student.name))}</option>`).join("")}`
    : "<option value=\"\">No students registered yet</option>";

  function updateStudentPhotoRequirement() {
    const student = students[Number(studentSelect.value)];
    const hasUploadedPhoto = Boolean(student && safePhotoUrl(photoOverrides[student.name]));
    studentPhotoUpload.required = Boolean(student && !hasUploadedPhoto);
    studentPhotoLabel.textContent = hasUploadedPhoto ? "Replace Your Photo (optional)" : "Upload Your Photo (required)";
    studentPhotoHint.textContent = hasUploadedPhoto
      ? "Your photo is saved. You can upload a replacement if you want."
      : "Please upload a photo before starting. It will be saved for future exams.";
  }

  function updateStudentProfile() {
    const student = students[Number(studentSelect.value)];
    if (!student) {
      studentProfile.classList.add("hidden");
      updateStudentPhotoRequirement();
      updateStudentProgress();
      return;
    }
    studentProfileName.textContent = displayName(student.name);
    studentProfileClass.textContent = student.className || "-";
    studentProfileProgram.textContent = student.program || "-";
    studentProfileLevel.textContent = student.level || "-";
    const photo = safePhotoUrl(photoOverrides[student.name] || student.photo);
    if (photo) {
      studentPhoto.src = photo;
      studentPhoto.classList.remove("hidden");
    } else {
      studentPhoto.removeAttribute("src");
      studentPhoto.classList.add("hidden");
    }
    studentProfile.classList.remove("hidden");
    updateStudentPhotoRequirement();
    updateStudentProgress();
  }

  studentSelect.addEventListener("change", () => {
    updateStudentProfile();
    refreshExamOptions();
  });
  examSelect.addEventListener("change", updateExamSummary);
  updateStudentPhotoRequirement();
  refreshExamOptions();
  updateExamSummary();

  function updateStudentProgress() {
    const student = students[Number(studentSelect.value)];
    if (!student) {
      studentProgress.textContent = "Select your name to see your progress.";
      studentHistory.innerHTML = "";
      return;
    }
    const history = getResults().filter(result => result.studentName === student.name);
    const result = history.find(item => item.examId === exam.id);
    const completed = history.length;
    studentHistory.innerHTML = history.length
      ? `<strong>Previous exam records</strong>${history.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)).map(item => { const grade = item.grade || getGrade(item.score); return `<div class="history-row"><span>${escapeHtml(item.examTitle)}<small>${item.correct} / ${item.total} correct · ${item.points ?? item.correct} points</small></span><strong>${escapeHtml(item.score)}% · <span class="grade-${grade}">Grade ${escapeHtml(grade)}</span></strong></div>`; }).join("")}`
      : "";
    studentProgress.innerHTML = result
      ? `<strong>Previous result:</strong> ${escapeHtml(result.score)}% on ${escapeHtml(result.examTitle)}<br><span>${completed} exam(s) completed. You can review results after submission.</span>`
      : `<strong>${completed} exam(s) completed.</strong><br><span>No result yet for this exam.</span>`;
    const prerequisite = exams.find(item => item.id === exam.prerequisiteExamId);
    if (prerequisite) {
      const prerequisiteResult = history.find(item => item.examId === prerequisite.id);
      studentProgress.innerHTML += prerequisiteResult
        ? `<br><span>Clearance: ${escapeHtml(prerequisiteResult.score)}% / ${exam.minimumScore}% required.</span>`
        : `<br><span>Clearance required: complete ${escapeHtml(prerequisite.title)} with ${exam.minimumScore}%.</span>`;
    }
  }

  studentPhotoUpload.addEventListener("change", () => {
    const student = students[Number(studentSelect.value)];
    const file = studentPhotoUpload.files[0];
    if (!student || !file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file.");
      studentPhotoUpload.value = "";
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      photoOverrides[student.name] = reader.result;
      localStorage.setItem(STORAGE_STUDENT_PHOTOS, JSON.stringify(photoOverrides));
      updateStudentProfile();
    });
    reader.readAsDataURL(file);
  });

  let state = {
    current: 0,
    answers: Array(activeQuestions.length).fill(""),
    endTime: null,
    timerInterval: null,
    studentName: "",
    studentClass: "",
    studentProgram: "",
    studentLevel: "",
    studentPhoto: "",
    examDate: "",
    submitAttempts: 0,
    submitted: false,
    examStarted: false,
    leaveCountdown: null,
    leaveWarningOpen: false,
    leaveReason: ""
  };

  const examScreen = document.getElementById("examScreen");
  const questionsList = document.getElementById("questionsList");

  document.getElementById("startExamBtn").addEventListener("click", () => {
    const student = students[Number(studentSelect.value)];
    if (!student) {
      alert("Please choose your name from the student list.");
      return;
    }
    if (!safePhotoUrl(photoOverrides[student.name])) {
      alert("Please upload your photo before starting the exam.");
      studentPhotoUpload.focus();
      return;
    }
    const history = getResults().filter(result => result.studentName === student.name);
    const prerequisite = exams.find(item => item.id === exam.prerequisiteExamId);
    const prerequisiteResult = prerequisite && history.find(item => item.examId === prerequisite.id);
    if (prerequisite && (!prerequisiteResult || Number(prerequisiteResult.score) < Number(exam.minimumScore || 0))) {
      alert(`You need at least ${exam.minimumScore}% on ${prerequisite.title} before taking this exam.`);
      return;
    }
    state.studentName = student.name;
    state.studentClass = student.className || "";
    state.studentProgram = student.program || "";
    state.studentLevel = student.level || "";
    state.studentPhoto = safePhotoUrl(photoOverrides[student.name] || student.photo);
    activeQuestions = exam.randomizeQuestions ? [...exam.questions].sort(() => Math.random() - 0.5) : exam.questions;
    state.answers = Array(activeQuestions.length).fill("");
    state.examDate = new Intl.DateTimeFormat("en-US", {
      year: "numeric", month: "long", day: "numeric"
    }).format(new Date());
    state.examStarted = true;
    state.endTime = Date.now() + exam.duration * 60 * 1000;
    startScreen.classList.add("hidden");
    examScreen.classList.remove("hidden");
    document.getElementById("examStudentName").textContent = displayName(student.name);
    document.getElementById("examStudentProgram").textContent = student.program || "-";
    document.getElementById("examStudentClass").textContent = student.className || "-";
    document.getElementById("examStudentLevel").textContent = student.level || "-";
    document.getElementById("examTitleHeader").textContent = exam.title;
    document.getElementById("examDate").textContent = state.examDate;
    const previousResult = getResults().find(item => item.examId === exam.id && item.studentName === student.name);
    const examGrade = document.getElementById("examGrade");
    const currentGrade = previousResult ? (previousResult.grade || getGrade(previousResult.score)) : "";
    examGrade.textContent = currentGrade || "-";
    examGrade.className = `exam-grade ${currentGrade ? `grade-${currentGrade}` : ""}`;
    if (state.studentPhoto) {
      examStudentPhoto.src = state.studentPhoto;
      examStudentPhoto.classList.remove("hidden");
    }
    renderQuestions();
    updateTimer();
    state.timerInterval = setInterval(updateTimer, 1000);
  });

  function autoSubmitForLeaving(reason) {
    if (!state.examStarted || state.submitted) return;
    if (state.leaveWarningOpen) return;
    state.leaveWarningOpen = true;
    state.leaveReason = reason;
    let secondsLeft = 10;
    const leaveModal = document.getElementById("leaveWarningModal");
    const countdown = document.getElementById("leaveCountdown");
    document.getElementById("leaveWarningText").textContent = `${reason} Are you sure you want to leave?`;
    countdown.textContent = secondsLeft;
    leaveModal.classList.remove("hidden");
    state.leaveCountdown = setInterval(() => {
      secondsLeft--;
      countdown.textContent = secondsLeft;
      if (secondsLeft <= 0) {
        clearInterval(state.leaveCountdown);
        state.leaveCountdown = null;
        leaveModal.classList.add("hidden");
        submitExam(true, state.leaveReason);
      }
    }, 1000);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") autoSubmitForLeaving("The exam was automatically submitted because the page was left.");
  });

  window.addEventListener("blur", () => {
    autoSubmitForLeaving("The exam was automatically submitted because the exam window lost focus.");
  });

  ["copy", "cut", "paste", "contextmenu"].forEach(eventName => {
    document.addEventListener(eventName, event => {
      if (state.examStarted) event.preventDefault();
    });
  });

  document.addEventListener("keydown", event => {
    if (!state.examStarted) return;
    const blockedShortcut = (event.ctrlKey || event.metaKey) && ["c", "x", "v", "a", "p", "s"].includes(event.key.toLowerCase());
    if (blockedShortcut || event.key === "F12") event.preventDefault();
  });

  document.getElementById("stayOnExamBtn").addEventListener("click", () => {
    clearInterval(state.leaveCountdown);
    state.leaveCountdown = null;
    state.leaveWarningOpen = false;
    document.getElementById("leaveWarningModal").classList.add("hidden");
  });

  document.getElementById("leaveSubmitBtn").addEventListener("click", () => {
    clearInterval(state.leaveCountdown);
    state.leaveCountdown = null;
    document.getElementById("leaveWarningModal").classList.add("hidden");
    submitExam(true, state.leaveReason);
  });

  function renderQuestions() {
    document.getElementById("questionNumber").textContent =
      `ALL ${activeQuestions.length} QUESTIONS`;
    document.getElementById("questionType").textContent = exam.examType || "VOCABULARY";
    questionsList.innerHTML = activeQuestions.map((q, index) => {
      const options = Array.isArray(q.options) ? q.options : [];
        const isDropdown = options.length > 0 && normalizeQuestionType(q.type) === "EXPRESSIONS_PROVERBS_IDIOMS";
      const answerControl = isDropdown
        ? `<select id="answer-${index}" class="answer-input" data-index="${index}"><option value="">Choose an answer</option>${options.map(option => `<option value="${escapeHtml(option)}" ${state.answers[index] === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>`
        : `<input id="answer-${index}" class="answer-input" data-index="${index}" type="text" autocomplete="off" placeholder="Type your English answer here..." value="${escapeHtml(state.answers[index])}">`;
      return `
      <article class="question-card" id="question-${index}">
        <div class="question-card-heading">
          <span class="question-index">Question ${index + 1}</span>
          <span class="question-source">Week ${escapeHtml(q.week || "-")} · Day ${escapeHtml(q.day || "-")}</span>
          <span class="badge">${escapeHtml(q.type || "VOCABULARY")}</span>
        </div>
        <p class="instruction">${isDropdown ? `Choose the correct ${escapeHtml(normalizeQuestionType(q.type).toLowerCase())}:` : "Write the correct English answer:"}</p>
        <h1>${escapeHtml(q.indonesia)}</h1>
        <label for="answer-${index}">Your Answer</label>
        ${answerControl}
      </article>`;
    }).join("");

    questionsList.querySelectorAll(".answer-input").forEach(input => {
      input.addEventListener("input", () => {
        state.answers[Number(input.dataset.index)] = input.value.trim();
        renderNavigation();
      });
    });
    renderNavigation();
  }

  function renderNavigation() {
    const nav = document.getElementById("questionNav");
    nav.innerHTML = activeQuestions.map((q, i) => {
      const answered = state.answers[i].trim() !== "";
      const cls = answered ? "answered" : "empty";
      return `<button class="q-nav-btn ${cls}" data-index="${i}">${i + 1}</button>`;
    }).join("");

    nav.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        document.getElementById(`question-${btn.dataset.index}`).scrollIntoView({behavior: "smooth", block: "start"});
      });
    });

    const answeredCount = state.answers.filter(a => a.trim() !== "").length;
    document.getElementById("progressText").textContent =
      `${answeredCount} / ${activeQuestions.length} answered`;
  }

  function updateTimer() {
    const remaining = Math.max(0, state.endTime - Date.now());
    const totalDuration = exam.duration * 60 * 1000;
    const remainingRatio = remaining / totalDuration;
    const totalSeconds = Math.ceil(remaining / 1000);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    const timer = document.getElementById("timer");
    timer.textContent = `${hours}:${minutes}:${seconds}`;
    timer.classList.toggle("time-green", remainingRatio > 0.5);
    timer.classList.toggle("time-yellow", remainingRatio <= 0.5 && remainingRatio > 0.2);
    timer.classList.toggle("time-red", remainingRatio <= 0.2);

    if (remaining <= 0) {
      clearInterval(state.timerInterval);
      submitExam(true);
    }
  }

  const modal = document.getElementById("confirmModal");

  function requestSubmit() {
    const unanswered = state.answers.filter(a => !a.trim()).length;
    state.submitAttempts++;
    if (state.submitAttempts <= 3) {
      const messages = [
        unanswered
          ? `${unanswered} question(s) are unanswered. Are you sure you want to submit? Please check your answers once more.`
          : "Are you sure you want to submit? Please check your answers once more.",
        "Would you like to check your answers again before submitting?",
        "This is your last chance to change your mind. Do you want to submit now?"
      ];
      document.getElementById("confirmText").textContent = messages[state.submitAttempts - 1];
      modal.classList.remove("hidden");
      return;
    }
    submitExam(false);
  }

  document.getElementById("submitExamBtn").addEventListener("click", requestSubmit);

  document.getElementById("cancelSubmitBtn").addEventListener("click", () => {
    state.submitAttempts = 0;
    modal.classList.add("hidden");
  });
  document.getElementById("confirmSubmitBtn").addEventListener("click", () => {
    modal.classList.add("hidden");
    requestSubmit();
  });

  function submitExam(autoSubmitted, submissionMessage) {
    if (state.submitted && !autoSubmitted) return;
    state.submitted = true;
    clearInterval(state.timerInterval);
    const review = activeQuestions.map((q, i) => {
      const studentAnswer = state.answers[i];
      const points = answerValue(studentAnswer, q.correctOption || q.english);
      return {
        no: i + 1,
        type: q.type,
        question: q.indonesia,
        studentAnswer,
        correctAnswer: q.english,
        correct: points > 0,
        partial: points === 0.5,
        points
      };
    });

    const correctCount = review.filter(r => r.points === 1).length;
    const halfCreditCount = review.filter(r => r.points === 0.5).length;
    const points = review.reduce((total, item) => total + item.points, 0);
    const score = Number((points / activeQuestions.length * 100).toFixed(2));

    const result = {
      examId: exam.id,
      examTitle: exam.title,
      studentName: state.studentName,
      studentClass: state.studentClass,
      studentProgram: state.studentProgram,
      studentLevel: state.studentLevel,
      studentPhoto: state.studentPhoto,
      examDate: state.examDate,
      submittedAt: new Date().toISOString(),
      autoSubmitted,
      submissionMessage: submissionMessage || "",
      total: activeQuestions.length,
      correct: correctCount,
      halfCredit: halfCreditCount,
      wrong: activeQuestions.length - correctCount,
      points,
      score,
      grade: getGrade(score),
      review
    };

    const results = getResults().filter(item => !(item.examId === result.examId && item.studentName === result.studentName));
    results.push(result);
    localStorage.setItem(STORAGE_RESULTS, JSON.stringify(results));
    localStorage.setItem(STORAGE_RESULT, JSON.stringify(result));
    window.location.href = "result.html";
  }
}

/* ================= RESULT ================= */
function initResult() {
  const summary = document.getElementById("resultSummary");
  if (!summary) return;

  const raw = localStorage.getItem(STORAGE_RESULT);
  if (!raw) {
    summary.innerHTML = "<p>No result is available yet.</p>";
    return;
  }

  const result = JSON.parse(raw);
  summary.innerHTML = `
    <p><strong>${escapeHtml(result.examTitle)}</strong></p>
    <p class="result-student-name">Student: <strong>${escapeHtml(displayName(result.studentName))}</strong></p>
    <p>Class: <strong>${escapeHtml(result.studentClass || "-")}</strong> ·
      Program: <strong>${escapeHtml(result.studentProgram || "-")}</strong> ·
      Level: <strong>${escapeHtml(result.studentLevel || "-")}</strong></p>
    <p>Exam date: <strong>${escapeHtml(result.examDate || "-")}</strong></p>
    <div class="result-visuals">
      ${result.studentPhoto ? `<img class="result-photo" src="${escapeHtml(safePhotoUrl(result.studentPhoto))}" alt="">` : ""}
      <div class="score-circle">${result.score}%</div>
    </div>
    <div class="result-grade grade-${result.grade || getGrade(result.score)}">Grade ${escapeHtml(result.grade || getGrade(result.score))}</div>
    <p class="score-breakdown"><strong>${result.points ?? result.correct}</strong> / ${result.total} points</p>
    <div class="stats">
      <div class="stat total-stat"><strong>${result.total}</strong>Total</div>
      <div class="stat correct-stat"><strong>${result.correct}</strong>Correct</div>
      <div class="stat half-credit-stat"><strong>${result.halfCredit || 0}</strong>Half credit</div>
      <div class="stat wrong-stat"><strong>${result.wrong}</strong>Wrong</div>
    </div>
    <p>${escapeHtml(result.submissionMessage || (result.autoSubmitted ? "Automatically submitted because time expired." : "Exam submitted successfully."))}</p>`;

  const reviewList = document.getElementById("reviewList");
  reviewList.innerHTML = result.review.map(item => `
    <article class="review-item ${item.partial ? "partial" : (item.correct ? "correct" : "wrong")}">
      <h3>${item.no}. ${escapeHtml(sentenceCase(item.question))}</h3>
      <p>Type: ${escapeHtml(item.type || "-")}</p>
      <p>Your answer: <strong>${escapeHtml(item.studentAnswer || "(No answer)")}</strong></p>
      <p>Correct answer: <strong>${escapeHtml(item.correctAnswer)}</strong></p>
      <strong class="review-status">${item.partial ? "✓ CORRECT - HALF CREDIT" : (item.correct ? "✓ CORRECT" : "✗ WRONG")}</strong>
    </article>`).join("");

  const resultHistory = document.getElementById("resultHistory");
  if (resultHistory) {
    const history = getResults().filter(item => item.studentName === result.studentName)
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    resultHistory.innerHTML = history.map(item => `
      <div class="history-row"><span>${escapeHtml(item.examTitle)}<small>${escapeHtml(item.examDate || "")}</small></span>
      <strong>${escapeHtml(item.score)}%</strong></div>`).join("");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  if (window.cecCloudReady) await window.cecCloudReady;
  initProtectedShortcutPage();
  initLanding();
  initAdmin();
  initManagement();
  initExam();
  initResult();
});