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
const STORAGE_REQUIREMENTS = "cec_requirements_v1";
const STORAGE_TARGETS = "cec_targets_v1";
const STORAGE_SUBJECTS = "cec_subjects_v1";
const STORAGE_AUDIT_LOG = "cec_audit_log_v1";
const BACKUP_SCHEMA_VERSION = 1;
const STORAGE_TUTOR_SESSION = "cec_tutor_session_v1";
const STORAGE_TUTOR_PASSWORD_HASH = "cec_tutor_password_hash_v1";
const STORAGE_REMEMBERED_STUDENT = "cec_remembered_student_v1";
const DEFAULT_TUTOR_PASSWORD = "123";
let loadedQuestions = [];
let loadedStudents = [];
let loadedExamMetadata = {};

function isTutorAuthenticated() {
  return sessionStorage.getItem(STORAGE_TUTOR_SESSION) === "authenticated";
}

function displayName(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase());
}

function readRememberedStudentSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_REMEMBERED_STUDENT) || "null");
  } catch (error) {
    return null;
  }
}

function setRememberedStudentSession(session, profile, progress, remember) {
  if (!remember || !session) {
    localStorage.removeItem(STORAGE_REMEMBERED_STUDENT);
    return;
  }
  localStorage.setItem(STORAGE_REMEMBERED_STUDENT, JSON.stringify({
    session,
    profile: profile || null,
    progress: progress ?? null,
    rememberedAt: Date.now()
  }));
}

function restoreRememberedStudentSession() {
  const remembered = readRememberedStudentSession();
  if (!remembered || !remembered.session) return false;
  sessionStorage.setItem("cec_student_session", JSON.stringify(remembered.session));
  if (remembered.profile) sessionStorage.setItem("cec_student_profile", JSON.stringify(remembered.profile));
  if (remembered.progress !== undefined) sessionStorage.setItem("cec_student_progress", JSON.stringify(remembered.progress));
  return true;
}

function formatStudentName(value, gender = "") {
  const words = displayName(value).split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  if (["male", "female"].includes(String(gender).toLowerCase())) {
    words.unshift(gender.toLowerCase() === "male" ? "Mr." : "Miss");
  }
  return words.join(" ");
}

function sentenceCase(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function normalizeDateOfBirth(value) {
  if (value === undefined || value === null || String(value).trim() === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const [year, month, day] = text.split("-").map(Number);
    return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function normalizeStudentImportRow(row) {
  const normalized = {};
  Object.keys(row).forEach(key => {
    normalized[String(key).trim().toUpperCase().replace(/\s+/g, "_")] = row[key];
  });
  return {
    studentId: String(normalized.STUDENT_ID || normalized.ID || "").trim(),
    name: String(normalized.NAME || normalized.FULL_NAME || normalized.STUDENT_NAME || normalized.STUDENT || "").trim(),
    className: String(normalized.CLASS || normalized.CLASS_NAME || "").trim(),
    program: String(normalized.PROGRAM || "").trim(),
    level: String(normalized.LEVEL || normalized.PROFICIENCY_LEVEL || "").trim(),
    gender: String(normalized.GENDER || "").trim().toLowerCase(),
    status: String(normalized.STATUS || "active").trim().toLowerCase(),
    photo: safePhotoUrl(normalized.PHOTO || normalized.PHOTO_URL),
    dateOfBirth: normalizeDateOfBirth(normalized.DATE_OF_BIRTH || normalized.DOB || normalized.BIRTH_DATE || normalized.BIRTHDAY)
  };
}

function mergeStudentsSafely(importedStudents, commit = false) {
  const existing = readStoredArray(STORAGE_STUDENTS);
  const byId = new Map(existing.filter(student => student.studentId).map(student => [String(student.studentId).trim().toLowerCase(), student]));
  const byNameDob = new Map(existing.map(student => [`${String(student.name || "").trim().toLowerCase()}|${normalizeDateOfBirth(student.dateOfBirth)}`, student]));
  const errors = [];
  let inserted = 0;
  let updated = 0;
  const merged = [...existing];
  importedStudents.forEach((student, index) => {
    if (!student.name) {
      errors.push(`Row ${index + 2}: Full name is required.`);
      return;
    }
    if (student.gender && !["male", "female", "other"].includes(student.gender)) {
      errors.push(`Row ${index + 2}: Gender must be Male, Female, or Other.`);
      return;
    }
    if (student.status && !["active", "inactive", "graduated", "archived"].includes(student.status)) {
      errors.push(`Row ${index + 2}: Invalid student status.`);
      return;
    }
    const idKey = String(student.studentId || "").trim().toLowerCase();
    const nameKey = `${student.name.toLowerCase()}|${student.dateOfBirth}`;
    if (idKey && importedStudents.slice(0, index).some(previous => String(previous.studentId || "").trim().toLowerCase() === idKey)) {
      errors.push(`Row ${index + 2}: Duplicate Student ID ${student.studentId} in this file.`);
      return;
    }
    const matched = idKey ? (byId.get(idKey) || byNameDob.get(nameKey)) : byNameDob.get(nameKey);
    if (matched && idKey && matched.studentId && String(matched.studentId).toLowerCase() !== idKey) {
      errors.push(`Row ${index + 2}: Possible duplicate for ${student.name} (matching name and date of birth).`);
      return;
    }
    if (matched) {
      Object.assign(matched, student);
      updated += 1;
    } else {
      const record = {...student};
      merged.push(record);
      byId.set(idKey, record);
      byNameDob.set(nameKey, record);
      inserted += 1;
    }
  });
  if (errors.length) return {errors, inserted: 0, updated: 0, students: existing};
  if (commit) localStorage.setItem(STORAGE_STUDENTS, JSON.stringify(merged));
  return {errors, inserted, updated, students: merged};
}

function studentImportPayload(students) {
  return students.map(student => ({
    student_id: student.studentId,
    full_name: student.name,
    date_of_birth: student.dateOfBirth || null,
    gender: student.gender || null,
    photo_url: student.photo || null,
    program: student.program || null,
    class_name: student.className || null,
    current_level: student.level || null,
    status: student.status || "active"
  }));
}

function calculateAge(dateOfBirth, today = new Date()) {
  const value = normalizeDateOfBirth(dateOfBirth);
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  let age = today.getFullYear() - year;
  const birthdayPassed = today.getMonth() + 1 > month ||
    (today.getMonth() + 1 === month && today.getDate() >= day);
  if (!birthdayPassed) age--;
  return age >= 0 ? age : "";
}

function calculateAgeDetails(dateOfBirth, today = new Date()) {
  const value = normalizeDateOfBirth(dateOfBirth);
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let years = current.getFullYear() - year;
  let months = current.getMonth() + 1 - month;
  let days = current.getDate() - day;
  if (days < 0) {
    months--;
    days += new Date(current.getFullYear(), current.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  return years >= 0 ? `${years} years, ${months} months, ${days} days` : "";
}

function daysUntilNextBirthday(dateOfBirth, today = new Date()) {
  const value = normalizeDateOfBirth(dateOfBirth);
  if (!value) return "";
  const [, month, day] = value.split("-").map(Number);
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let nextBirthday = new Date(current.getFullYear(), month - 1, day);
  if (nextBirthday < current) nextBirthday = new Date(current.getFullYear() + 1, month - 1, day);
  return Math.round((nextBirthday - current) / 86400000);
}

function formatDateOfBirth(value) {
  const normalized = normalizeDateOfBirth(value);
  if (!normalized) return "-";
  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
}

async function hashTutorPassword(password) {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function authenticateTutor(password) {
  const storedHash = localStorage.getItem(STORAGE_TUTOR_PASSWORD_HASH) ||
    await hashTutorPassword(DEFAULT_TUTOR_PASSWORD);
  if (!localStorage.getItem(STORAGE_TUTOR_PASSWORD_HASH)) {
    localStorage.setItem(STORAGE_TUTOR_PASSWORD_HASH, storedHash);
  }
  if (await hashTutorPassword(password) !== storedHash) return false;
  sessionStorage.setItem(STORAGE_TUTOR_SESSION, "authenticated");
  return true;
}

async function changeTutorPassword(currentPassword, newPassword) {
  if (newPassword.length < 3) throw new Error("The new password must contain at least 3 characters.");
  if (!await authenticateTutor(currentPassword)) throw new Error("The current password is incorrect.");
  localStorage.setItem(STORAGE_TUTOR_PASSWORD_HASH, await hashTutorPassword(newPassword));
}

function initTutorPasswordChangeForm() {
  const changePasswordForm = document.getElementById("changeTutorPasswordForm");
  if (!changePasswordForm || changePasswordForm.dataset.initialized === "true") return;
  changePasswordForm.dataset.initialized = "true";
  changePasswordForm.addEventListener("submit", async event => {
    event.preventDefault();
    const currentPassword = document.getElementById("currentTutorPassword");
    const newPassword = document.getElementById("newTutorPassword");
    const confirmPassword = document.getElementById("confirmTutorPassword");
    const status = document.getElementById("changeTutorPasswordStatus");
    if (newPassword.value !== confirmPassword.value) {
      status.textContent = "The new passwords do not match.";
      return;
    }
    try {
      await changeTutorPassword(currentPassword.value, newPassword.value);
      recordAudit("tutor_password_changed");
      status.textContent = "Tutor password changed successfully.";
      changePasswordForm.reset();
    } catch (error) {
      status.textContent = error.message;
    }
  });
}

function renderProgressStructure() {
  const requirementList = document.getElementById("requirementList");
  const targetList = document.getElementById("targetList");
  if (!requirementList || !targetList) return;
  const renderList = (element, storageKey, label) => {
    const values = getOptions(storageKey, []);
    element.innerHTML = values.length
      ? values.map(value => `<div class="management-item"><span>${escapeHtml(value)}</span><button class="btn danger small delete-config-item" data-key="${storageKey}" data-value="${escapeHtml(value)}" type="button">Delete</button></div>`).join("")
      : `<p class="small-note">No ${label.toLowerCase()} configured.</p>`;
  };
  renderList(requirementList, STORAGE_REQUIREMENTS, "requirements");
  renderList(targetList, STORAGE_TARGETS, "achievement targets");
}

function initProgressStructureControls() {
  const requirementList = document.getElementById("requirementList");
  const targetList = document.getElementById("targetList");
  if (!requirementList || !targetList || requirementList.dataset.initialized === "true") return;
  requirementList.dataset.initialized = "true";
  targetList.dataset.initialized = "true";
  renderProgressStructure();
  document.getElementById("addRequirementBtn").onclick = () => {
    const input = document.getElementById("newRequirement");
    const value = input.value.trim();
    if (!value) return;
    saveOption(STORAGE_REQUIREMENTS, value);
    input.value = "";
    renderProgressStructure();
  };
  document.getElementById("addTargetBtn").onclick = () => {
    const input = document.getElementById("newTarget");
    const value = input.value.trim();
    if (!value) return;
    saveOption(STORAGE_TARGETS, value);
    input.value = "";
    renderProgressStructure();
  };
  [requirementList, targetList].forEach(list => {
    list.onclick = event => {
      const button = event.target.closest(".delete-config-item");
      if (!button) return;
      const values = getOptions(button.dataset.key, []).filter(value => value !== button.dataset.value);
      localStorage.setItem(button.dataset.key, JSON.stringify(values));
      renderProgressStructure();
    };
  });
}

function initAdminManualDatabaseControls() {
  const studentForm = document.getElementById("adminManualStudentForm");
  if (!studentForm || studentForm.dataset.initialized === "true") return;
  studentForm.dataset.initialized = "true";
  const studentStatus = document.getElementById("adminManualStudentStatus");
  const optionStatus = document.getElementById("adminManualOptionStatus");
  const fields = {
    program: document.getElementById("adminManualStudentProgram"),
    className: document.getElementById("adminManualStudentClass"),
    level: document.getElementById("adminManualStudentLevel")
  };
  const refreshStudentOptions = () => {
    [
      [fields.program, STORAGE_PROGRAMS, "Select program"],
      [fields.className, STORAGE_CLASSES, "Select class"],
      [fields.level, STORAGE_LEVELS, "Select level"]
    ].forEach(([select, key, emptyLabel]) => {
      const current = select.value;
      const values = getOptions(key, []).sort((first, second) => String(first).localeCompare(String(second)));
      select.innerHTML = `<option value="">${emptyLabel}</option>${values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
      select.value = values.includes(current) ? current : "";
    });
  };
  const addOption = (key, inputId, label) => {
    const input = document.getElementById(inputId);
    const value = input.value.trim();
    if (!value) {
      optionStatus.textContent = `${label} name is required.`;
      input.focus();
      return;
    }
    const existing = getOptions(key, []);
    if (existing.some(item => String(item).toLowerCase() === value.toLowerCase())) {
      optionStatus.textContent = `${label} already exists.`;
      input.focus();
      return;
    }
    saveOption(key, value);
    input.value = "";
    optionStatus.textContent = `${label} added successfully.`;
    refreshStudentOptions();
  };
  refreshStudentOptions();
  studentForm.addEventListener("submit", event => {
    event.preventDefault();
    const student = {
      studentId: document.getElementById("adminManualStudentId").value.trim(),
      name: document.getElementById("adminManualStudentName").value.trim(),
      program: fields.program.value,
      className: fields.className.value,
      level: fields.level.value,
      gender: "",
      dateOfBirth: "",
      status: "active",
      photo: ""
    };
    if (!student.name) {
      studentStatus.textContent = "Full name is required.";
      return;
    }
    if (student.studentId && readStoredArray(STORAGE_STUDENTS).some(item => String(item.studentId || "").trim().toLowerCase() === student.studentId.toLowerCase())) {
      studentStatus.textContent = "That Student ID is already in use.";
      return;
    }
    const preview = mergeStudentsSafely([student]);
    if (preview.errors.length) {
      studentStatus.textContent = preview.errors.join(" ");
      return;
    }
    [student.program && [STORAGE_PROGRAMS, student.program], student.className && [STORAGE_CLASSES, student.className], student.level && [STORAGE_LEVELS, student.level]]
      .filter(Boolean)
      .forEach(([key, value]) => saveOption(key, value));
    mergeStudentsSafely([student], true);
    recordAudit("student_created", {name: student.name, studentId: student.studentId || ""});
    studentForm.reset();
    refreshStudentOptions();
    studentStatus.textContent = `${displayName(student.name)} was added successfully.`;
  });
  document.getElementById("adminAddProgramBtn").onclick = () => addOption(STORAGE_PROGRAMS, "adminManualProgram", "Program");
  document.getElementById("adminAddClassBtn").onclick = () => addOption(STORAGE_CLASSES, "adminManualClass", "Class");
  document.getElementById("adminAddLevelBtn").onclick = () => addOption(STORAGE_LEVELS, "adminManualLevel", "Level");
}

function initBackupControls() {
  const downloadButton = document.getElementById("downloadBackupBtn");
  const fileInput = document.getElementById("restoreBackupFile");
  const backupValidation = document.getElementById("backupValidation");
  const restoreButton = document.getElementById("restoreBackupBtn");
  if (!downloadButton || !fileInput || !backupValidation || !restoreButton || downloadButton.dataset.initialized === "true") return;
  downloadButton.dataset.initialized = "true";
  let pendingBackup = null;
  downloadButton.addEventListener("click", () => {
    if (!isTutorAuthenticated()) {
      alert("Tutor authentication is required.");
      return;
    }
    const backup = createLocalBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], {type: "application/json"});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `mr-tops-english-class-backup-${backup.createdAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    recordAudit("download_backup", {schemaVersion: backup.schemaVersion});
  });
  fileInput.addEventListener("change", event => {
    const file = event.target.files[0];
    pendingBackup = null;
    restoreButton.disabled = true;
    if (!file) {
      backupValidation.textContent = "No backup selected.";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(String(reader.result || ""));
        const validation = validateLocalBackup(backup);
        backupValidation.textContent = validation.message;
        if (validation.valid) {
          pendingBackup = backup;
          restoreButton.disabled = false;
        } else {
          recordAudit("restore_rejected", {reason: validation.message});
        }
      } catch (error) {
        backupValidation.textContent = "The selected file is not valid JSON.";
        recordAudit("restore_rejected", {reason: "invalid_json"});
      }
    };
    reader.readAsText(file);
  });
  restoreButton.addEventListener("click", () => {
    if (!pendingBackup || !isTutorAuthenticated()) {
      alert("Select a valid backup while authenticated as tutor.");
      return;
    }
    const validation = validateLocalBackup(pendingBackup);
    if (!validation.valid) {
      backupValidation.textContent = validation.message;
      restoreButton.disabled = true;
      return;
    }
    const safetyBackup = createLocalBackup();
    const confirmed = confirm(`Restore this backup?\n\n${validation.message}\n\nCurrent local data will be replaced. A safety copy will be downloaded first.`);
    if (!confirmed) return;
    const safetyBlob = new Blob([JSON.stringify(safetyBackup, null, 2)], {type: "application/json"});
    const safetyLink = document.createElement("a");
    safetyLink.href = URL.createObjectURL(safetyBlob);
    safetyLink.download = `mr-tops-english-class-safety-backup-${safetyBackup.createdAt.slice(0, 10)}.json`;
    safetyLink.click();
    URL.revokeObjectURL(safetyLink.href);
    const previousValues = {};
    Object.keys(pendingBackup.data).forEach(key => {
      previousValues[key] = localStorage.getItem(key);
    });
    try {
      Object.entries(pendingBackup.data).forEach(([key, value]) => {
        localStorage.setItem(key, key === STORAGE_ACTIVE_EXAM ? String(value) : JSON.stringify(value));
      });
      recordAudit("restore_backup", {createdAt: pendingBackup.createdAt, schemaVersion: pendingBackup.schemaVersion});
      alert("Backup restored successfully. The page will reload.");
      window.location.reload();
    } catch (error) {
      Object.entries(previousValues).forEach(([key, value]) => {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      });
      backupValidation.textContent = `Restore failed: ${error.message}`;
      recordAudit("restore_failed", {message: error.message});
    }
  });
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

function initManagementTabs() {
  const panels = [...document.querySelectorAll("[data-management-panel]")];
  const tabs = [...document.querySelectorAll("[data-management-tab]")];
  if (!panels.length || !tabs.length) return;

  const currentPage = window.location.pathname.split("/").pop();
  const availableTabs = new Set(panels.map(panel => panel.dataset.managementPanel));
  const defaultTab = currentPage === "admin.html" ? "exams" : "classes";
  const requestedTab = window.location.hash.replace(/^#/, "");
  const activeTab = availableTabs.has(requestedTab) ? requestedTab : defaultTab;

  panels.forEach(panel => {
    panel.classList.toggle("hidden", panel.dataset.managementPanel !== activeTab);
  });
  tabs.forEach(tab => {
    tab.classList.toggle("active", tab.dataset.managementTab === activeTab);
  });

  if (!window.__cecManagementTabsInitialized) {
    window.__cecManagementTabsInitialized = true;
    window.addEventListener("hashchange", initManagementTabs);
  }
}

function initManagement() {
  const fileInput = document.getElementById("managementStudentFile");
  if (!fileInput) return;
  const authScreen = document.getElementById("managementAuthScreen");
  const content = document.getElementById("managementContent");
  let managementPage = 1;
  const managementPageSize = 50;

  function openManagement() {
    authScreen.classList.add("hidden");
    content.classList.remove("hidden");
    renderManagement();
  }

  const alreadyAuthenticated = isTutorAuthenticated();
  if (!alreadyAuthenticated) {
    document.getElementById("managementLoginForm").addEventListener("submit", async event => {
      event.preventDefault();
      const password = document.getElementById("managementPassword");
      const error = document.getElementById("managementLoginError");
      if (!await authenticateTutor(password.value)) {
        error.classList.remove("hidden");
        password.select();
        return;
      }
      initManagement();
    });
    return;
  }
  openManagement();
  initTutorPasswordChangeForm();
  initProgressStructureControls();
  initBackupControls();

  const managementStudentFile = document.getElementById("managementStudentFile");
  const managementStudentStatus = document.getElementById("managementStudentStatus");
  const manualStudentForm = document.getElementById("manualStudentForm");
  const manualStudentStatus = document.getElementById("manualStudentStatus");
  const manualStudentFields = {
    program: document.getElementById("manualStudentProgram"),
    className: document.getElementById("manualStudentClass"),
    level: document.getElementById("manualStudentLevel")
  };
  const refreshManualStudentOptions = () => {
    [
      [manualStudentFields.program, STORAGE_PROGRAMS, "Select program"],
      [manualStudentFields.className, STORAGE_CLASSES, "Select class"],
      [manualStudentFields.level, STORAGE_LEVELS, "Select level"]
    ].forEach(([select, key, emptyLabel]) => {
      const current = select.value;
      const values = getOptions(key, []).sort((first, second) => String(first).localeCompare(String(second)));
      select.innerHTML = `<option value="">${emptyLabel}</option>${values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
      select.value = values.includes(current) ? current : "";
    });
  };
  refreshManualStudentOptions();
  manualStudentForm.addEventListener("submit", event => {
    event.preventDefault();
    const student = {
      studentId: document.getElementById("manualStudentId").value.trim(),
      name: document.getElementById("manualStudentName").value.trim(),
      dateOfBirth: normalizeDateOfBirth(document.getElementById("manualStudentDob").value),
      gender: document.getElementById("manualStudentGender").value,
      program: manualStudentFields.program.value,
      className: manualStudentFields.className.value,
      level: manualStudentFields.level.value,
      status: "active",
      photo: ""
    };
    if (!student.name) {
      manualStudentStatus.textContent = "Full name is required.";
      return;
    }
    if (student.studentId && readStoredArray(STORAGE_STUDENTS).some(item => String(item.studentId || "").trim().toLowerCase() === student.studentId.toLowerCase())) {
      manualStudentStatus.textContent = "That Student ID is already in use.";
      return;
    }
    const result = mergeStudentsSafely([student]);
    if (result.errors.length) {
      manualStudentStatus.textContent = result.errors.join(" ");
      return;
    }
    [student.program && [STORAGE_PROGRAMS, student.program], student.className && [STORAGE_CLASSES, student.className], student.level && [STORAGE_LEVELS, student.level]]
      .filter(Boolean)
      .forEach(([key, value]) => saveOption(key, value));
    mergeStudentsSafely([student], true);
    recordAudit("student_created", {name: student.name, studentId: student.studentId || ""});
    manualStudentForm.reset();
    refreshManualStudentOptions();
    manualStudentStatus.textContent = `${displayName(student.name)} was added successfully.`;
    renderManagement();
  });
  document.getElementById("loadStudentDatabaseBtn").addEventListener("click", async () => {
    const file = managementStudentFile.files[0];
    if (!file) {
      alert("Choose a student database file first.");
      managementStudentFile.focus();
      return;
    }
    managementStudentStatus.textContent = "Reading student database...";
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), {type:"array"});
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {defval:""});
      const importedStudents = rows.map(normalizeStudentImportRow);
      if (!importedStudents.length) throw new Error("No student names found.");
      const preview = mergeStudentsSafely(importedStudents);
      if (preview.errors.length) {
        managementStudentStatus.innerHTML = `<strong>Import stopped:</strong> ${escapeHtml(preview.errors.join(" "))}`;
        alert(`Import stopped. ${preview.errors.join(" ")}`);
        return;
      }
      const confirmed = confirm(`Validated ${importedStudents.length} students.\n\nNew: ${preview.inserted}\nUpdates: ${preview.updated}\nExisting students will be preserved.\n\nCommit this import?`);
      if (!confirmed) {
        managementStudentStatus.textContent = "Import cancelled. No student data was changed.";
        return;
      }
      if (window.cecCloudAuth && window.cecCloudAuth.getAccessToken()) {
        try {
          await window.cecCloudRpc("merge_student_import", {
            import_filename: file.name,
            records: studentImportPayload(importedStudents)
          });
        } catch (error) {
          managementStudentStatus.textContent = "Cloud import failed. No local data was changed.";
          alert("The cloud student import failed. Please try again or contact the tutor.");
          return;
        }
      }
      mergeStudentsSafely(importedStudents, true);
      recordAudit("student_import", {filename: file.name, inserted: preview.inserted, updated: preview.updated});
      managementStudentStatus.innerHTML = `Loaded: <strong>${escapeHtml(file.name)}</strong> (${preview.inserted} new, ${preview.updated} updated)`;
      renderManagement();
    } catch (error) {
      managementStudentStatus.textContent = "Error: Please check the student database format.";
      alert("The student database could not be read. Make sure it contains NAME and optional STUDENT_ID columns.");
    }
  });

  function renderManagement() {
    let students = [];
    try {
      students = JSON.parse(localStorage.getItem(STORAGE_STUDENTS) || "[]");
    } catch (error) {
      students = [];
    }
    const qualityIssues = collectDataQualityIssues();
    const qualitySummary = document.getElementById("dataQualitySummary");
    const qualityList = document.getElementById("dataQualityList");
    const auditList = document.getElementById("auditActivityList");
    if (qualitySummary && qualityList && auditList) {
      const errors = qualityIssues.filter(issue => issue.severity === "error").length;
      const warnings = qualityIssues.filter(issue => issue.severity === "warning").length;
      qualitySummary.innerHTML = `<div class="summary-card"><span>Errors</span><strong>${errors}</strong></div><div class="summary-card"><span>Warnings</span><strong>${warnings}</strong></div><div class="summary-card"><span>Checked students</span><strong>${students.length}</strong></div><div class="summary-card"><span>Checked exams</span><strong>${getExams().length}</strong></div>`;
      qualityList.innerHTML = qualityIssues.length
        ? qualityIssues.map(issue => `<div class="management-item"><span><strong>${escapeHtml(issue.severity.toUpperCase())}</strong> ${escapeHtml(issue.message)}</span></div>`).join("")
        : "<p class=\"small-note\">No data-quality issues detected.</p>";
      const audit = getAuditLog().slice(-10).reverse();
      auditList.innerHTML = audit.length
        ? audit.map(entry => `<div class="management-item"><span><strong>${escapeHtml(entry.action)}</strong><small>${escapeHtml(entry.createdAt || "")}</small></span></div>`).join("")
        : "<p class=\"small-note\">No local administrative activity recorded.</p>";
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
        ? values.map(value => `<div class="management-item"><span>${escapeHtml(value)}</span><span class="option-edit-actions"><button class="btn warning small management-rename-option hidden" data-key="${key}" data-value="${escapeHtml(value)}" type="button">Rename</button><button class="btn danger small management-delete-option hidden" data-key="${key}" data-value="${escapeHtml(value)}" type="button">Delete</button></span></div>`).join("")
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
      const field = key === STORAGE_PROGRAMS ? "program" : key === STORAGE_CLASSES ? "className" : "level";
      const values = [...new Set(students.map(student => String(student[field] || "").trim()).filter(Boolean))]
        .sort((a, b) => String(a).localeCompare(String(b)));
      select.innerHTML = `<option value="">${label}</option>${values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
      select.value = values.includes(current) ? current : "";
    });

    const program = document.getElementById("managementFilterProgram").value;
    const className = document.getElementById("managementFilterClass").value;
    const level = document.getElementById("managementFilterLevel").value;
    const sortBy = document.getElementById("managementSort").value;
    const resultsByStudent = new Map();
    getResults().forEach(result => {
      const key = String(result.studentName || "").trim().toLowerCase();
      const score = Number(result.score);
      if (!key || !Number.isFinite(score)) return;
      const previous = resultsByStudent.get(key);
      if (!previous || new Date(result.submittedAt || 0) > new Date(previous.submittedAt || 0)) {
        resultsByStudent.set(key, result);
      }
    });
    const matchesFilter = (value, filter) => !filter ||
      String(value || "").trim().toLowerCase() === String(filter).trim().toLowerCase();
    const filtered = [...students].reverse().filter(student =>
      matchesFilter(student.program, program) &&
      matchesFilter(student.className, className) &&
      matchesFilter(student.level, level)
    );
    filtered.sort((first, second) => {
      const firstResult = resultsByStudent.get(String(first.name || "").trim().toLowerCase());
      const secondResult = resultsByStudent.get(String(second.name || "").trim().toLowerCase());
      const [field, direction = "asc"] = sortBy.split("-");
      const firstValue = field === "score" ? Number(firstResult?.score ?? -1) : field === "age" ? calculateAge(first.dateOfBirth) || -1 : field === "program" ? first.program : field === "class" ? first.className : field === "level" ? first.level : field === "grade" ? (firstResult?.grade || getGrade(firstResult?.score ?? 0)) : first.name;
      const secondValue = field === "score" ? Number(secondResult?.score ?? -1) : field === "age" ? calculateAge(second.dateOfBirth) || -1 : field === "program" ? second.program : field === "class" ? second.className : field === "level" ? second.level : field === "grade" ? (secondResult?.grade || getGrade(secondResult?.score ?? 0)) : second.name;
      const comparison = typeof firstValue === "number" && typeof secondValue === "number"
        ? firstValue - secondValue
        : String(firstValue || "").localeCompare(String(secondValue || ""));
      if (comparison) return direction === "desc" ? -comparison : comparison;
      return String(first.name || "").localeCompare(String(second.name || ""));
    });
    const pageCount = Math.max(1, Math.ceil(filtered.length / managementPageSize));
    managementPage = Math.min(managementPage, pageCount);
    const pageStudents = filtered.slice((managementPage - 1) * managementPageSize, managementPage * managementPageSize);
    const list = document.getElementById("managementStudentList");
    list.innerHTML = filtered.length
      ? pageStudents.map(student => {
        const result = resultsByStudent.get(String(student.name || "").trim().toLowerCase());
        const score = result && Number.isFinite(Number(result.score)) ? `${Number(result.score)}%` : "-";
        const grade = result ? (result.grade || getGrade(result.score)) : "-";
        const dateOfBirth = normalizeDateOfBirth(student.dateOfBirth);
        const gender = String(student.gender || "").toLowerCase() === "male" ? "M" : String(student.gender || "").toLowerCase() === "female" ? "F" : "-";
        return `<div class="student-management-item"><span class="student-select-cell"><input class="student-select edit-only-control hidden" type="checkbox" value="${escapeHtml(student.name)}" aria-label="Select ${escapeHtml(formatStudentName(student.name, student.gender))}"></span><strong title="${escapeHtml(displayName(student.name))}">${escapeHtml(displayName(student.name))}</strong><span class="student-age">${escapeHtml(calculateAge(dateOfBirth) === "" ? "-" : calculateAge(dateOfBirth))}</span><span>${gender}</span><span>${escapeHtml(student.program || "-")}</span><span>${escapeHtml(student.className || "-")}</span><span>${escapeHtml(student.level || "-")}</span><span class="student-score grade-${escapeHtml(grade)}">${escapeHtml(score)}</span><span class="student-grade grade-${escapeHtml(grade)}">${escapeHtml(grade)}</span><span class="student-edit-actions"><button class="btn warning small management-rename-student edit-only-control hidden" data-name="${escapeHtml(student.name)}" type="button">Rename</button><button class="btn danger small management-delete-student edit-only-control hidden" data-name="${escapeHtml(student.name)}" type="button">Delete</button></span></div>`;
      }).join("")
      : "<p class=\"small-note\">No stored students.</p>";
    const pagination = document.getElementById("managementStudentPagination");
    pagination.innerHTML = filtered.length > managementPageSize
      ? `<button class="btn secondary small pagination-prev" type="button" ${managementPage === 1 ? "disabled" : ""}>Previous</button><span>Page ${managementPage} of ${pageCount} (${filtered.length} students)</span><button class="btn secondary small pagination-next" type="button" ${managementPage === pageCount ? "disabled" : ""}>Next</button>`
      : "";
    const previousPageButton = pagination.querySelector(".pagination-prev");
    const nextPageButton = pagination.querySelector(".pagination-next");
    if (previousPageButton) previousPageButton.onclick = () => { managementPage -= 1; renderManagement(); };
    if (nextPageButton) nextPageButton.onclick = () => { managementPage += 1; renderManagement(); };

    document.querySelectorAll(".management-delete-option").forEach(button => {
      button.onclick = () => {
        const remaining = getOptions(button.dataset.key, []).filter(value => value !== button.dataset.value);
        localStorage.setItem(button.dataset.key, JSON.stringify(remaining));
        recordAudit("master_option_deleted", {key: button.dataset.key, value: button.dataset.value});
        renderManagement();
      };
    });
    document.querySelectorAll(".management-rename-option").forEach(button => {
      button.onclick = () => {
        const currentValue = button.dataset.value;
        const nextValue = prompt("Rename this option:", currentValue);
        if (nextValue === null || !nextValue.trim() || nextValue.trim() === currentValue) return;
        const replacement = nextValue.trim();
        const values = getOptions(button.dataset.key, []);
        if (values.some(value => value.toLowerCase() === replacement.toLowerCase())) {
          alert("That option already exists.");
          return;
        }
        localStorage.setItem(button.dataset.key, JSON.stringify(values.map(value => value === currentValue ? replacement : value)));
        recordAudit("master_option_renamed", {key: button.dataset.key, previousValue: currentValue, newValue: replacement});
        const field = button.dataset.key === STORAGE_PROGRAMS ? "program" : button.dataset.key === STORAGE_CLASSES ? "className" : "level";
        const students = readStoredArray(STORAGE_STUDENTS);
        students.forEach(student => {
          if (student[field] === currentValue) student[field] = replacement;
        });
        localStorage.setItem(STORAGE_STUDENTS, JSON.stringify(students));
        renderManagement();
      };
    });
    document.querySelectorAll(".management-delete-student").forEach(button => {
      button.onclick = () => {
        recordAudit("student_deleted", {name: button.dataset.name});
        deleteStudentData(button.dataset.name);
        renderManagement();
      };
    });
    document.getElementById("deleteSelectedStudentsBtn").onclick = () => {
      const selectedNames = [...document.querySelectorAll(".student-select:checked")].map(input => input.value);
      if (!selectedNames.length) {
        alert("Select at least one student.");
        return;
      }
      selectedNames.forEach(name => deleteStudentData(name));
      renderManagement();
    };
    document.querySelectorAll(".management-rename-student").forEach(button => {
      button.onclick = () => {
        const student = students.find(item => item.name === button.dataset.name);
        if (!student) return;
        const nextName = prompt("New student name:", student.name);
        if (nextName === null || !nextName.trim()) return;
        const nextDateOfBirth = prompt("Date of birth (YYYY-MM-DD):", normalizeDateOfBirth(student.dateOfBirth));
        if (nextDateOfBirth === null) return;
        const nextGender = prompt("Gender (male or female):", student.gender || "");
        if (nextGender === null) return;
        if (nextGender.trim() && !["male", "female"].includes(nextGender.trim().toLowerCase())) {
          alert("Please enter male or female.");
          return;
        }
        const normalizedDate = normalizeDateOfBirth(nextDateOfBirth);
        if (nextDateOfBirth.trim() && !normalizedDate) {
          alert("Please enter a valid date of birth.");
          return;
        }
        const oldName = student.name;
        student.name = nextName.trim();
        student.dateOfBirth = normalizedDate;
        student.gender = nextGender.trim().toLowerCase();
        localStorage.setItem(STORAGE_STUDENTS, JSON.stringify(students));
        try {
          const photos = JSON.parse(localStorage.getItem(STORAGE_STUDENT_PHOTOS) || "{}");
          if (photos[oldName] && !photos[student.name]) photos[student.name] = photos[oldName];
          delete photos[oldName];
          localStorage.setItem(STORAGE_STUDENT_PHOTOS, JSON.stringify(photos));
        } catch (error) {
          localStorage.removeItem(STORAGE_STUDENT_PHOTOS);
        }
        const results = getResults().map(result => result.studentName === oldName ? {...result, studentName: student.name} : result);
        localStorage.setItem(STORAGE_RESULTS, JSON.stringify(results));
        recordAudit("student_updated", {previousName: oldName, newName: student.name});
        renderManagement();
      };
    });
    document.getElementById("editStudentsBtn").onclick = () => {
      const button = document.getElementById("editStudentsBtn");
      const enteringEditMode = button.dataset.editing !== "true";
      if (!enteringEditMode && !confirm("Save these student list changes?")) return;
      button.dataset.editing = enteringEditMode ? "true" : "false";
      button.textContent = enteringEditMode ? "OK" : "Edit";
      button.classList.toggle("success", enteringEditMode);
      button.classList.toggle("secondary", !enteringEditMode);
      document.querySelectorAll(".management-delete-student,.management-rename-student,.student-select").forEach(control => control.classList.toggle("hidden", !enteringEditMode));
      document.getElementById("managementClearStudentsBtn").classList.toggle("hidden");
      document.getElementById("deleteSelectedStudentsBtn").classList.toggle("hidden", !enteringEditMode);
    };
    document.getElementById("editClassesBtn").onclick = () => {
      const button = document.getElementById("editClassesBtn");
      const enteringEditMode = button.dataset.editing !== "true";
      if (!enteringEditMode && !confirm("Save these program, class, and level changes?")) return;
      button.dataset.editing = enteringEditMode ? "true" : "false";
      button.textContent = enteringEditMode ? "OK" : "Edit";
      button.classList.toggle("success", enteringEditMode);
      button.classList.toggle("secondary", !enteringEditMode);
      document.querySelectorAll(".management-delete-option,.management-rename-option").forEach(control => control.classList.toggle("hidden", !enteringEditMode));
    };
    const studentsEditing = document.getElementById("editStudentsBtn").dataset.editing === "true";
    document.querySelectorAll(".management-delete-student,.management-rename-student,.student-select").forEach(control => control.classList.toggle("hidden", !studentsEditing));
    document.getElementById("managementClearStudentsBtn").classList.toggle("hidden", !studentsEditing);
    document.getElementById("deleteSelectedStudentsBtn").classList.toggle("hidden", !studentsEditing);
    const selectAllStudents = document.getElementById("selectAllStudents");
    selectAllStudents.closest(".select-all-label").classList.toggle("hidden", !studentsEditing);
    selectAllStudents.checked = false;
    selectAllStudents.onchange = () => {
      document.querySelectorAll(".student-select:not(.hidden)").forEach(input => {
        input.checked = selectAllStudents.checked;
      });
    };
    document.getElementById("managementSort").onchange = () => { managementPage = 1; renderManagement(); };
  }

  function addOption(key, inputId) {
    const input = document.getElementById(inputId);
    const value = input.value.trim();
    if (!value) return;
    saveOption(key, value);
    input.value = "";
    renderManagement();
  }

  document.getElementById("managementAddProgram").onclick = () => {
    addOption(STORAGE_PROGRAMS, "managementNewProgram");
    refreshManualStudentOptions();
  };
  document.getElementById("managementAddClass").onclick = () => {
    addOption(STORAGE_CLASSES, "managementNewClass");
    refreshManualStudentOptions();
  };
  document.getElementById("managementAddLevel").onclick = () => {
    addOption(STORAGE_LEVELS, "managementNewLevel");
    refreshManualStudentOptions();
  };
  ["managementFilterProgram", "managementFilterClass", "managementFilterLevel"].forEach(id => {
    document.getElementById(id).onchange = () => { managementPage = 1; renderManagement(); };
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
    refreshManualStudentOptions();
    renderManagement();
  };
  document.getElementById("managementClearStudentsBtn").onclick = () => {
    localStorage.removeItem(STORAGE_STUDENTS);
    localStorage.removeItem(STORAGE_STUDENT_PHOTOS);
    renderManagement();
  };
  fileInput.onchange = () => {
    document.getElementById("managementStudentStatus").textContent = fileInput.files[0]
      ? `Ready to load: ${fileInput.files[0].name}`
      : "No student database loaded.";
  };
  if (alreadyAuthenticated) openManagement();
}

function initLanding() {
  const studentLoginForm = document.getElementById("studentLoginForm");
  if (studentLoginForm) {
    const students = readStoredArray(STORAGE_STUDENTS);
    const fields = {
      program: document.getElementById("loginProgram"),
      className: document.getElementById("loginClass"),
      name: document.getElementById("loginName")
    };
    const values = (field, filter = {}) => [...new Set(students
      .filter(student => Object.entries(filter).every(([key, value]) =>
        !value || String(student[key] || "").trim().toLowerCase() === String(value).trim().toLowerCase()))
      .map(student => student[field]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
    const populate = (select, items, label) => {
      select.innerHTML = `<option value="">${label}</option>${items.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}`;
    };
    populate(fields.program, values("program"), "Select program");
    fields.program.addEventListener("change", () => {
      populate(fields.className, values("className", {program: fields.program.value}), "Select class");
      populate(fields.name, [], "Select your name");
    });
    fields.className.addEventListener("change", () => {
      populate(fields.name, values("name", {program: fields.program.value, className: fields.className.value}), "Select your name");
    });
    if (!sessionStorage.getItem("cec_student_session") && restoreRememberedStudentSession()) {
      window.location.href = "dashboard.html";
      return;
    }

    studentLoginForm.addEventListener("submit", async event => {
      event.preventDefault();
      const status = document.getElementById("studentLoginStatus");
      try {
        const result = await window.cecStudentAuth({
          action: "login",
          program: fields.program.value,
          class_name: fields.className.value,
          full_name: fields.name.value
        });
        setRememberedStudentSession(
          JSON.parse(sessionStorage.getItem("cec_student_session") || "null"),
          JSON.parse(sessionStorage.getItem("cec_student_profile") || "null"),
          JSON.parse(sessionStorage.getItem("cec_student_progress") || "null"),
          true
        );
        window.location.href = "dashboard.html";
      } catch (error) {
        status.textContent = error.message;
      }
    });
  }
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
  continueButton.addEventListener("click", async () => {
    if (roleSelect.value === "student") {
      window.location.href = "exam.html";
      return;
    }
    if (!await authenticateTutor(passwordInput.value)) {
      error.textContent = "Incorrect tutor password.";
      error.classList.remove("hidden");
      passwordInput.select();
      return;
    }
    window.location.href = "admin.html";
  });
  updateRole();
}

async function initDashboard() {
  const name = document.getElementById("dashboardName");
  if (!name) return;
  if (!sessionStorage.getItem("cec_student_session") && !restoreRememberedStudentSession()) {
    window.location.href = "index.html";
    return;
  }
  let profile;
  let progression;
  try {
    const result = await window.cecStudentProfile();
    profile = result.profile;
    progression = result.progression;
  } catch (error) {
    sessionStorage.removeItem("cec_student_session");
    sessionStorage.removeItem("cec_student_profile");
    sessionStorage.removeItem("cec_student_progress");
    window.location.href = "index.html";
    return;
  }
  const displayStudentName = formatStudentName(profile.full_name, profile.gender);
  const dashboardName = document.getElementById("dashboardName");
  dashboardName.textContent = displayStudentName;
  document.getElementById("dashboardProgram").textContent = profile.program || "-";
  document.getElementById("dashboardClass").textContent = profile.class_name || "-";
  document.getElementById("dashboardLevel").textContent = profile.current_level || "-";
  const dateOfBirth = normalizeDateOfBirth(profile.date_of_birth || profile.dateOfBirth);
  const dashboardAge = document.getElementById("dashboardAge");
  dashboardAge.textContent = dateOfBirth ? `Age: ${calculateAgeDetails(dateOfBirth)}` : "Age: -";
  const dashboardDob = document.getElementById("dashboardDob");
  dashboardDob.textContent = dateOfBirth ? `Date of birth: ${formatDateOfBirth(dateOfBirth)}` : "Date of birth: -";
  const dashboardBirthday = document.getElementById("dashboardBirthday");
  const birthdayDays = dateOfBirth ? daysUntilNextBirthday(dateOfBirth) : "";
  dashboardBirthday.textContent = dateOfBirth
    ? birthdayDays === 0 ? "Happy birthday!" : `Next birthday: ${birthdayDays} day${birthdayDays === 1 ? "" : "s"}`
    : "Next birthday: -";
  const studentResults = getResults().filter(result =>
    String(result.studentId || result.student_id || "").trim() === String(profile.student_id || "").trim() ||
    (!result.studentId && String(result.studentName || "").trim().toLowerCase() === String(profile.full_name || "").trim().toLowerCase())
  );
  const scores = studentResults.map(result => Number(result.score)).filter(Number.isFinite);
  const averageScore = scores.length ? scores.reduce((total, score) => total + score, 0) / scores.length : null;
  const averageGrade = averageScore === null ? "" : getGrade(averageScore);
  document.getElementById("dashboardAverageScore").textContent = averageScore === null ? "-" : `${averageScore.toFixed(1)}%`;
  document.getElementById("dashboardAverageGrade").textContent = averageGrade || "-";
  document.getElementById("dashboardAverageScore").className = averageGrade ? `grade-${averageGrade} score-value` : "score-value";
  document.getElementById("dashboardAverageGrade").className = averageGrade ? `grade-${averageGrade} grade-value` : "grade-value";
  document.getElementById("dashboardCurrentLevel").textContent = profile.current_level || "Not configured";
  const progress = JSON.parse(sessionStorage.getItem("cec_student_progress") || "null");
  if (progress) {
    document.getElementById("dashboardProgressPercent").textContent = `${Number(progress.progress_percent || 0).toFixed(1)}%`;
    document.getElementById("dashboardProgressBar").style.width = `${Math.max(0, Math.min(100, Number(progress.progress_percent || 0)))}%`;
    document.getElementById("dashboardProgressNote").textContent =
      `${progress.completed_requirements || 0} of ${progress.total_requirements || 0} requirements completed; ` +
      `${progress.completed_targets || 0} of ${progress.total_targets || 0} achievement targets completed.`;
    document.getElementById("dashboardProgressDetails").textContent =
      `Next level: ${progress.next_level || "Not configured"} · ` +
      `${progress.next_level_eligible ? "Eligible" : "Not yet eligible"}`;
    document.getElementById("dashboardNextLevel").textContent = progress.next_level || "Highest level";
    document.getElementById("dashboardEligibility").textContent =
      progress.next_level_eligible ? "Eligible" : (progress.progress_percent > 0 ? "Not eligible" : "In progress");
  } else {
    document.getElementById("dashboardNextLevel").textContent = "Not configured";
  }
  const exams = getExams()
    .filter(item => (!item.program || normalize(item.program) === normalize(profile.program)) &&
      (!item.className || normalize(item.className) === normalize(profile.class_name)) &&
      (!item.level || normalize(item.level) === normalize(profile.current_level)))
    .sort((first, second) => String(first.title || "").localeCompare(String(second.title || ""), undefined, {sensitivity: "base"}));
  const examList = document.getElementById("dashboardExamList");
  examList.innerHTML = exams.length ? exams.map(item => {
    const history = studentResults.filter(result => result.examId === item.id);
    const latest = history.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))[0];
    const grade = latest ? (latest.grade || getGrade(latest.score)) : "";
    const percent = latest && Number.isFinite(Number(latest.score)) ? Math.max(0, Math.min(100, Number(latest.score))) : 0;
    const status = latest ? `Completed · ${Number(latest.score).toFixed(1)}% · Grade ${grade}` : "Not taken";
    const rowClass = latest ? `grade-${escapeHtml(grade)}` : "exam-needs-action";
    const action = `<button class="btn ${latest ? "secondary" : "primary"} small dashboard-exam-action" data-exam-id="${escapeHtml(item.id)}">${latest ? "Retake" : "Take Exam"}</button>`;
    return `<div class="dashboard-exam-row ${rowClass}"><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(status)}</span><div class="dashboard-exam-progress"><span style="width:${percent}%"></span></div></div>${action}</div>`;
  }).join("") : "<p class=\"small-note\">No exams are currently available for your level.</p>";
  examList.querySelectorAll(".dashboard-exam-action").forEach(button => button.addEventListener("click", () => {
    sessionStorage.setItem("cec_selected_exam_id", button.dataset.examId);
    window.location.href = "exam.html";
  }));
  if (progression?.status === "advanced") {
    document.getElementById("dashboardProgressNote").textContent =
      "Level advanced. Your progress and exam access have been updated.";
  }
  if (profile.photo_url) {
    const photo = document.getElementById("dashboardPhoto");
    photo.src = safePhotoUrl(profile.photo_url);
    photo.classList.remove("hidden");
  }
  document.getElementById("dashboardPhotoInput").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const photoUrl = await resizePhotoToSquare(file, 320);
      const updated = {...profile, photo_url: photoUrl};
      sessionStorage.setItem("cec_student_profile", JSON.stringify(updated));
      const remembered = readRememberedStudentSession();
      if (remembered) {
        remembered.profile = updated;
        localStorage.setItem(STORAGE_REMEMBERED_STUDENT, JSON.stringify(remembered));
      }
      const students = readStoredArray(STORAGE_STUDENTS);
      const matchingStudent = students.find(student =>
        String(student.studentId || "").trim() === String(profile.student_id || "").trim() ||
        String(student.name || "").trim().toLowerCase() === String(profile.full_name || "").trim().toLowerCase()
      );
      if (matchingStudent) {
        matchingStudent.photo = photoUrl;
        localStorage.setItem(STORAGE_STUDENTS, JSON.stringify(students));
      }
      document.getElementById("dashboardPhoto").src = photoUrl;
      document.getElementById("dashboardPhoto").classList.remove("hidden");
      document.getElementById("dashboardPhotoStatus").textContent = "Profile photo updated.";
    } catch (error) {
      document.getElementById("dashboardPhotoStatus").textContent = "The photo could not be loaded.";
    }
  });
  document.getElementById("studentLogoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem("cec_student_session");
    sessionStorage.removeItem("cec_student_profile");
    sessionStorage.removeItem("cec_student_progress");
    localStorage.removeItem(STORAGE_REMEMBERED_STUDENT);
    window.location.href = "index.html";
  });
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

function resizePhotoToSquare(file, size) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The photo could not be loaded."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("The photo could not be decoded."));
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Photo processing is unavailable."));
          return;
        }
        const scale = Math.max(size / image.width, size / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      };
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
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
    subject: String(exam.subject || (normalizeQuestionType(exam.examType) === "VOCABULARY" ? "Vocabulary" : "Expressions")).trim(),
    answerMode: exam.answerMode === "spoken" && normalizeQuestionType(exam.examType) === "VOCABULARY" ? "spoken" : "typed",
    title: String(exam.title || "").trim() || generatedExamTitle(exam),
    minimumScore: Number.isFinite(Number(exam.minimumScore)) ? Number(exam.minimumScore) : 60
  }));
  const legacy = localStorage.getItem(STORAGE_EXAM);
  if (!legacy) return [];
  try {
    const exam = JSON.parse(legacy);
    return [{...exam, id: exam.id || `exam-${Date.now()}`, examType: normalizeQuestionType(exam.examType), subject: exam.subject || "Vocabulary", answerMode: "typed", prerequisiteExamId: "", minimumScore: 60, randomizeQuestions: false}];
  } catch (error) {
    return [];
  }
}

function generatedExamTitle(exam) {
    const subject = String(exam.subject || "").trim();
    const values = [exam.program, exam.className, exam.level, subject]
      .map(value => String(value || "").trim().replace(/[-_]+/g, " ").replace(/\s+/g, " "))
      .filter(Boolean);
    return subject && values.length === 4 ? values.join(" ") : "";
  }

function getAuditLog() {
    return readStoredArray(STORAGE_AUDIT_LOG);
  }

function recordAudit(action, details = {}) {
    const entries = getAuditLog();
    entries.push({
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action,
      details,
      actor: "tutor",
      createdAt: new Date().toISOString()
    });
    localStorage.setItem(STORAGE_AUDIT_LOG, JSON.stringify(entries.slice(-500)));
  }

function createLocalBackup() {
    const keys = [
      STORAGE_STUDENTS, STORAGE_STUDENT_PHOTOS, STORAGE_PROGRAMS, STORAGE_CLASSES,
      STORAGE_LEVELS, STORAGE_REQUIREMENTS, STORAGE_TARGETS, STORAGE_SUBJECTS,
      STORAGE_EXAMS, STORAGE_RESULTS, STORAGE_ACTIVE_EXAM,
      STORAGE_AUDIT_LOG
    ];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && key.startsWith("cec_exam_session_")) keys.push(key);
    }
    const data = {};
    keys.forEach(key => {
      const value = localStorage.getItem(key);
      if (value !== null) {
        if (key === STORAGE_ACTIVE_EXAM) {
          data[key] = value;
        } else {
          try {
            data[key] = JSON.parse(value);
          } catch (error) {
            throw new Error(`Cannot back up invalid local data in ${key}.`);
          }
        }
      }
    });
    return {
      format: "cec-local-backup",
      schemaVersion: BACKUP_SCHEMA_VERSION,
      application: "Mr. Top's English Class",
      createdAt: new Date().toISOString(),
      data
    };
  }

function validateLocalBackup(backup) {
    const required = [STORAGE_STUDENTS, STORAGE_EXAMS, STORAGE_RESULTS];
    if (!backup || backup.format !== "cec-local-backup" || backup.schemaVersion !== BACKUP_SCHEMA_VERSION) {
      return {valid: false, message: "Unsupported or invalid backup format/version."};
    }

    if (!backup.data || typeof backup.data !== "object" || required.some(key => !(key in backup.data))) {
      return {valid: false, message: "Backup is missing required application data."};
    }

    for (const key of [STORAGE_STUDENTS, STORAGE_EXAMS, STORAGE_RESULTS]) {
      if (!Array.isArray(backup.data[key])) return {valid: false, message: `Backup field ${key} must be an array.`};
    }

    const examIds = new Set(backup.data[STORAGE_EXAMS].map(exam => String(exam.id || "")));
    if (backup.data[STORAGE_EXAMS].some(exam => !exam.id || !Array.isArray(exam.questions))) {
      return {valid: false, message: "Backup contains an invalid exam or question list."};
    }
    if (backup.data[STORAGE_RESULTS].some(result => result.examId && !examIds.has(String(result.examId)))) {
      return {valid: false, message: "Backup contains a result for an unknown exam."};
    }
    if (backup.data[STORAGE_STUDENTS].some(student => !student.name)) {
      return {valid: false, message: "Backup contains an invalid student record."};
    }
    return {valid: true, message: `Valid backup from ${backup.createdAt || "unknown date"}: ${backup.data[STORAGE_STUDENTS].length} students, ${backup.data[STORAGE_EXAMS].length} exams, ${backup.data[STORAGE_RESULTS].length} results.`};
}

function getResults() {
  const results = readStoredArray(STORAGE_RESULTS);
  if (results.length) return results;
  const legacy = localStorage.getItem(STORAGE_RESULT);
  if (!legacy) return [];
  try { return [JSON.parse(legacy)]; } catch (error) { return []; }
}

function getStudentProgressValue(student, key, fallback = null) {
  const progress = student.progress && typeof student.progress === "object" ? student.progress : student;
  return progress[key] ?? fallback;
}

function collectDataQualityIssues() {
  const issues = [];
  const students = readStoredArray(STORAGE_STUDENTS);
  const exams = getExams();
  const results = getResults();
  const ids = new Map();
  const identities = new Map();
  students.forEach((student, index) => {
    const studentId = String(student.studentId || "").trim().toLowerCase();
    const identity = `${String(student.name || "").trim().toLowerCase()}|${normalizeDateOfBirth(student.dateOfBirth)}`;
    if (!student.name || !student.program || !student.className || !student.level) {
      issues.push({severity: "warning", message: `Student row ${index + 1} is missing a required name, program, class, or level.`});
    }
    if (studentId) {
      if (ids.has(studentId)) issues.push({severity: "error", message: `Duplicate Student ID shared by ${displayName(student.name)} and ${displayName(ids.get(studentId))}.`});
      else ids.set(studentId, student.name);
    }
    if (student.name && normalizeDateOfBirth(student.dateOfBirth)) {
      if (identities.has(identity)) issues.push({severity: "warning", message: `Possible duplicate student identity: ${displayName(student.name)} with the same date of birth.`});
      else identities.set(identity, student.name);
    }
  });
  const examIds = new Set(exams.map(exam => String(exam.id)));
  exams.forEach(exam => {
    if (!exam.questions.length) issues.push({severity: "error", message: `Exam "${exam.title}" has no questions.`});
    if (!exam.subject) issues.push({severity: "warning", message: `Exam "${exam.title}" has no subject.`});
  });
  results.forEach(result => {
    if (result.examId && !examIds.has(String(result.examId))) {
      issues.push({severity: "warning", message: `Result for ${displayName(result.studentName)} references an unknown exam.`});
    }
  });
  return issues;
}

function deleteStudentData(studentName) {
  const name = String(studentName || "").trim().toLowerCase();
  const students = readStoredArray(STORAGE_STUDENTS).filter(student =>
    String(student.name || "").trim().toLowerCase() !== name
  );
  localStorage.setItem(STORAGE_STUDENTS, JSON.stringify(students));

  try {
    const photos = JSON.parse(localStorage.getItem(STORAGE_STUDENT_PHOTOS) || "{}");
    Object.keys(photos).forEach(key => {
      if (String(key).trim().toLowerCase() === name) delete photos[key];
    });
    localStorage.setItem(STORAGE_STUDENT_PHOTOS, JSON.stringify(photos));
  } catch (error) {
    localStorage.removeItem(STORAGE_STUDENT_PHOTOS);
  }

  const results = getResults().filter(result =>
    String(result.studentName || "").trim().toLowerCase() !== name
  );
  localStorage.setItem(STORAGE_RESULTS, JSON.stringify(results));
  if (name) {
    try {
      const legacyResult = JSON.parse(localStorage.getItem(STORAGE_RESULT) || "null");
      if (legacyResult && String(legacyResult.studentName || "").trim().toLowerCase() === name) {
        localStorage.removeItem(STORAGE_RESULT);
      }
    } catch (error) {
      localStorage.removeItem(STORAGE_RESULT);
    }
  }
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
    document.getElementById("adminLoginForm").addEventListener("submit", async event => {
      event.preventDefault();
      const password = document.getElementById("adminPassword");
      const error = document.getElementById("adminLoginError");
      if (!await authenticateTutor(password.value)) {
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
  initTutorPasswordChangeForm();
  initProgressStructureControls();
  initAdminManualDatabaseControls();

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
    const subjectSelect = document.getElementById("examSubject");
    const selectedProgram = programSelect.value;
    const selectedLevel = levelSelect.value;
    const selectedClass = classSelect.value;
    programSelect.innerHTML = `<option value="">All programs</option>${programs.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
    levelSelect.innerHTML = `<option value="">All levels</option>${levels.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
    classSelect.innerHTML = `<option value="">All classes</option>${classes.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
    const subjects = getOptions(STORAGE_SUBJECTS, ["Vocabulary", "Expressions", "Proverbs", "Idioms"])
      .sort((first, second) => String(first).localeCompare(String(second)));
    const selectedSubject = subjectSelect.value;
    subjectSelect.innerHTML = `<option value="">Select subject</option>${subjects.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
    programSelect.value = programs.includes(selectedProgram) ? selectedProgram : "";
    levelSelect.value = levels.includes(selectedLevel) ? selectedLevel : "";
    classSelect.value = classes.includes(selectedClass) ? selectedClass : "";
    subjectSelect.value = subjects.includes(selectedSubject) ? selectedSubject : "";
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
        deleteStudentData(name);
        loadedStudents = readStoredArray(STORAGE_STUDENTS);
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

  async function loadExamDatabase(file) {
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
  }

  fileInput.addEventListener("change", () => {
    status.textContent = fileInput.files[0]
      ? `Ready to load: ${fileInput.files[0].name}`
      : "No Excel file loaded.";
  });
  document.getElementById("loadExamDatabaseBtn").addEventListener("click", () => {
    const file = fileInput.files[0];
    if (!file) {
      alert("Choose an exam database file first.");
      fileInput.focus();
      return;
    }
    loadExamDatabase(file);
  });

  async function loadStudentDatabase(file) {
    if (!file) return;
    studentStatus.textContent = "Reading student database...";
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, {type:"array"});
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, {defval:""});

      const importedStudents = rows.map(normalizeStudentImportRow);

      if (!importedStudents.length) throw new Error("No student names found.");
      const preview = mergeStudentsSafely(importedStudents);
      if (preview.errors.length) throw new Error(preview.errors.join(" "));
      if (!confirm(`Validated ${importedStudents.length} students.\n\nNew: ${preview.inserted}\nUpdates: ${preview.updated}\nExisting students will be preserved.\n\nCommit this import?`)) {
        studentStatus.textContent = "Import cancelled. No student data was changed.";
        return;
      }
      if (window.cecCloudAuth && window.cecCloudAuth.getAccessToken()) {
        await window.cecCloudRpc("merge_student_import", {
          import_filename: file.name,
          records: studentImportPayload(importedStudents)
        });
      }
      mergeStudentsSafely(importedStudents, true);
      loadedStudents = readStoredArray(STORAGE_STUDENTS);
      refreshManagedOptions();
      studentStatus.innerHTML = `Loaded: <strong>${escapeHtml(file.name)}</strong> (${preview.inserted} new, ${preview.updated} updated)`;
      showStudentPreview();
    } catch (error) {
      loadedStudents = [];
      studentStatus.textContent = "Error: Please check the student database format.";
      alert(`The student database could not be read: ${error.message}`);
      showStudentPreview();
    }
  }

  studentFile.addEventListener("change", () => {
    studentStatus.textContent = studentFile.files[0]
      ? `Ready to load: ${studentFile.files[0].name}`
      : "No student database loaded.";
  });

  document.getElementById("loadStudentDatabaseBtn").addEventListener("click", () => {
    const file = studentFile.files[0];
    if (!file) {
      alert("Choose a student database file first.");
      studentFile.focus();
      return;
    }
    loadStudentDatabase(file);
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
    const subject = document.getElementById("examSubject").value || examTypeLabel(document.getElementById("examType").value);
    document.getElementById("examTitle").value = [program, className, level, subject].join(" ").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  }

  ["examProgram", "examLevel", "examClass", "examType", "examSubject", "answerMode"].forEach(id => {
    document.getElementById(id).addEventListener("change", updateGeneratedTitle);
  });
  document.getElementById("examType").addEventListener("change", () => {
    document.getElementById("answerMode").disabled = document.getElementById("examType").value !== "VOCABULARY";
  });
  document.getElementById("answerMode").disabled = document.getElementById("examType").value !== "VOCABULARY";
  document.getElementById("addSubjectBtn").addEventListener("click", () => addManagedOption(STORAGE_SUBJECTS, "newSubject"));

  document.getElementById("createExamBtn").addEventListener("click", () => {
    if (!loadedQuestions.length) {
      alert("Please upload an Excel file first.");
      return;
    }
    const subject = document.getElementById("examSubject").value.trim();
    if (!subject) {
      alert("Please select a subject.");
      return;
    }
    const title = [document.getElementById("examProgram").value, document.getElementById("examClass").value, document.getElementById("examLevel").value, subject]
      .filter(Boolean).join(" ").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
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
      subject,
      answerMode: document.getElementById("examType").value === "VOCABULARY" ? document.getElementById("answerMode").value : "typed",
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
    recordAudit("export_results", {count: results.length});
  });

  initBackupControls();

  function renderAnalytics() {
    const summary = document.getElementById("analyticsSummary");
    const progressReport = document.getElementById("studentProgressReport");
    const levelReport = document.getElementById("levelDistributionReport");
    const examReport = document.getElementById("examAnalyticsReport");
    const programFilter = document.getElementById("analyticsProgram").value;
    const classFilter = document.getElementById("analyticsClass").value;
    const levelFilter = document.getElementById("analyticsLevel").value;
    const statusFilter = document.getElementById("analyticsStatus").value;
    const search = document.getElementById("analyticsSearch").value.trim().toLowerCase();
    const students = loadedStudents.filter(student => {
      const matches = `${student.name || ""} ${student.program || ""} ${student.className || ""} ${student.level || ""}`.toLowerCase().includes(search);
      return matches && (!programFilter || student.program === programFilter) &&
        (!classFilter || student.className === classFilter) &&
        (!levelFilter || student.level === levelFilter) &&
        (!statusFilter || (student.status || "active") === statusFilter);
    });
    const results = getResults();
    const filteredResults = results.filter(result =>
      (!programFilter || result.studentProgram === programFilter) &&
      (!classFilter || result.studentClass === classFilter) &&
      (!levelFilter || result.studentLevel === levelFilter)
    );
    const progressValues = students.map(student => Number(getStudentProgressValue(student, "progressPercent", NaN))).filter(Number.isFinite);
    const eligible = students.filter(student => getStudentProgressValue(student, "nextLevelEligible", false) === true).length;
    const active = students.filter(student => (student.status || "active") === "active").length;
    summary.innerHTML = [
      ["Total Students", students.length],
      ["Active Students", active],
      ["Programs", new Set(students.map(student => student.program).filter(Boolean)).size],
      ["Classes", new Set(students.map(student => student.className).filter(Boolean)).size],
      ["Current Levels", new Set(students.map(student => student.level).filter(Boolean)).size],
      ["Completed Exams", new Set(filteredResults.map(result => `${result.studentName}|${result.examId || result.examTitle}`)).size],
      ["Eligible", eligible],
      ["Recently Advanced", "Unavailable"],
      ["Average Progress", progressValues.length ? `${(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length).toFixed(1)}%` : "Unavailable"]
    ].map(([label, value]) => `<div class="summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");

    progressReport.innerHTML = students.length ? `<table class="preview-table"><thead><tr><th>Student</th><th>Program</th><th>Class</th><th>Level</th><th>Progress</th><th>Requirements</th><th>Achievements</th><th>Eligibility</th><th>Status</th></tr></thead><tbody>${students.map(student => {
      const progress = getStudentProgressValue(student, "progressPercent", null);
      const requirements = `${getStudentProgressValue(student, "completedRequirements", "-")} / ${getStudentProgressValue(student, "totalRequirements", "-")}`;
      const achievements = `${getStudentProgressValue(student, "completedTargets", "-")} / ${getStudentProgressValue(student, "totalTargets", "-")}`;
      const isEligible = getStudentProgressValue(student, "nextLevelEligible", null);
      return `<tr><td>${escapeHtml(displayName(student.name))}</td><td>${escapeHtml(student.program || "-")}</td><td>${escapeHtml(student.className || "-")}</td><td>${escapeHtml(student.level || "-")}</td><td>${progress === null ? "Unavailable" : `${escapeHtml(progress)}%`}</td><td>${escapeHtml(requirements)}</td><td>${escapeHtml(achievements)}</td><td>${isEligible === null ? "Unavailable" : isEligible ? "Eligible" : "In progress"}</td><td>${escapeHtml(student.status || "active")}</td></tr>`;
    }).join("")}</tbody></table>` : "<p class=\"small-note\">No students match the selected filters.</p>";

    const levels = {};
    students.forEach(student => { const key = student.level || "Not assigned"; levels[key] = (levels[key] || 0) + 1; });
    levelReport.innerHTML = Object.keys(levels).length ? `<table class="preview-table"><thead><tr><th>Level</th><th>Students</th></tr></thead><tbody>${Object.entries(levels).sort((a, b) => a[0].localeCompare(b[0])).map(([level, count]) => `<tr><td>${escapeHtml(level)}</td><td>${count}</td></tr>`).join("")}</tbody></table>` : "<p class=\"small-note\">No level data.</p>";

    const examRows = getExams().filter(exam => (!programFilter || exam.program === programFilter) && (!classFilter || exam.className === classFilter) && (!levelFilter || exam.level === levelFilter)).map(exam => {
      const attempts = filteredResults.filter(result => result.examId === exam.id || result.examTitle === exam.title);
      const scores = attempts.map(result => Number(result.score)).filter(Number.isFinite);
      const passed = scores.filter(score => score >= Number(exam.minimumScore || 60)).length;
      return `<tr><td>${escapeHtml(exam.program || "-")}</td><td>${escapeHtml(exam.className || "-")}</td><td>${escapeHtml(exam.level || "-")}</td><td>${escapeHtml(exam.subject || examTypeLabel(exam.examType))}</td><td>${escapeHtml(exam.title)}</td><td>${escapeHtml(exam.answerMode || "typed")}</td><td>${attempts.length}</td><td>${scores.length}</td><td>${passed}</td><td>${scores.length ? `${(scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1)}%` : "-"}</td></tr>`;
    });
    examReport.innerHTML = examRows.length ? `<table class="preview-table"><thead><tr><th>Program</th><th>Class</th><th>Level</th><th>Subject</th><th>Exam</th><th>Mode</th><th>Attempts</th><th>Completed</th><th>Passed</th><th>Average</th></tr></thead><tbody>${examRows.join("")}</tbody></table>` : "<p class=\"small-note\">No exam data matches the selected filters.</p>";
  }

  ["analyticsProgram", "analyticsClass", "analyticsLevel", "analyticsStatus", "analyticsSearch"].forEach(id => {
    document.getElementById(id).addEventListener("input", renderAnalytics);
    document.getElementById(id).addEventListener("change", renderAnalytics);
  });
  function refreshAnalyticsFilters() {
    const values = [
      ["analyticsProgram", getOptions(STORAGE_PROGRAMS, [])],
      ["analyticsClass", getOptions(STORAGE_CLASSES, [])],
      ["analyticsLevel", getOptions(STORAGE_LEVELS, [])]
    ];
    values.forEach(([id, options]) => {
      const select = document.getElementById(id);
      const current = select.value;
      select.innerHTML = `<option value="">All ${id.replace("analytics", "").toLowerCase()}s</option>${options.sort((a, b) => String(a).localeCompare(String(b))).map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
      select.value = current;
    });
  }
  refreshAnalyticsFilters();
  renderAnalytics();

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

  const sessionProfile = sessionStorage.getItem("cec_student_profile");
  const sessionToken = sessionStorage.getItem("cec_student_session");
  if (!sessionProfile || !sessionToken) {
    window.location.replace("index.html");
    return;
  }
  let authenticatedProfile;
  try {
    authenticatedProfile = JSON.parse(sessionProfile);
  } catch (error) {
    sessionStorage.removeItem("cec_student_profile");
    sessionStorage.removeItem("cec_student_session");
    sessionStorage.removeItem("cec_student_progress");
    window.location.replace("index.html");
    return;
  }

  const exams = getExams();
  if (!exams.length) {
    startScreen.classList.add("hidden");
    document.getElementById("noExamScreen").classList.remove("hidden");
    return;
  }

  const requestedExamId = sessionStorage.getItem("cec_selected_exam_id");
  sessionStorage.removeItem("cec_selected_exam_id");
  let exam = exams.find(item => item.id === requestedExamId) ||
    exams.find(item => item.id === localStorage.getItem(STORAGE_ACTIVE_EXAM)) || exams[0];
  let activeQuestions = exam.questions;
  const examSelectFallback = document.getElementById("examSelect") || { value: exam.id, addEventListener() {} };
  const examSelect = examSelectFallback;

  function updateExamSummary() {
    exam = exams.find(item => item.id === examSelect.value) || exams[0];
    activeQuestions = exam.questions;
    document.getElementById("startTitle").textContent = exam.title;
    document.getElementById("startDescription").textContent =
      `${exam.examType || "VOCABULARY"} · ${exam.questions.length} questions · ${exam.duration} minutes`;
  }

  let students = [];
  try {
    students = JSON.parse(localStorage.getItem(STORAGE_STUDENTS) || "[]")
      .filter(student =>
        String(student.name || "").trim().toLowerCase() === String(authenticatedProfile.full_name || "").trim().toLowerCase() &&
        String(student.program || "").trim().toLowerCase() === String(authenticatedProfile.program || "").trim().toLowerCase() &&
        String(student.className || "").trim().toLowerCase() === String(authenticatedProfile.class_name || "").trim().toLowerCase() &&
        String(student.level || "").trim().toLowerCase() === String(authenticatedProfile.current_level || "").trim().toLowerCase()
      );
  } catch (error) {
    students = [];
  }
  const authenticatedStudent = students.find(student =>
    String(student.studentId || "").trim() === String(authenticatedProfile.student_id || "").trim() ||
    String(student.name || "").trim().toLowerCase() === String(authenticatedProfile.full_name || "").trim().toLowerCase()
  );
  if (authenticatedStudent && authenticatedProfile.photo_url) {
    authenticatedStudent.photo = authenticatedProfile.photo_url;
    localStorage.setItem(STORAGE_STUDENTS, JSON.stringify(students));
  }

  function matchesStudent(examItem, student) {
    if (!student) return false;
    const matches = (examValue, studentValue) =>
      !examValue || String(examValue).trim().toLowerCase() === String(studentValue || "").trim().toLowerCase();
    return matches(examItem.program, student.program) &&
      matches(examItem.className, student.className) &&
      matches(examItem.level, student.level);
  }

  function refreshExamOptions() {
    const student = students[0];
    const available = exams.filter(item => matchesStudent(item, student));
    if (!available.length) {
      if (examSelect.innerHTML) examSelect.innerHTML = "<option value=\"\">No exam for this program and level</option>";
      return;
    }
    if (!available.some(item => item.id === exam.id)) exam = available[0];
    if (examSelect.innerHTML !== undefined) {
      examSelect.innerHTML = available.map(item =>
        `<option value="${escapeHtml(item.id)}" ${item.id === exam.id ? "selected" : ""}>${escapeHtml(item.title)}</option>`).join("");
    }
    updateExamSummary();
  }

  const studentSelectFallback = document.getElementById("studentName") || { value: "0", addEventListener() {} };
  const studentSelect = studentSelectFallback;
  const studentProfile = document.getElementById("studentProfile");
  const studentPhoto = document.getElementById("studentPhoto");
  const studentProfileName = document.getElementById("studentProfileName");
  const studentProfileClass = document.getElementById("studentProfileClass");
  const studentProfileProgram = document.getElementById("studentProfileProgram");
  const studentProfileLevel = document.getElementById("studentProfileLevel");
  const studentProfileAge = document.getElementById("studentProfileAge");
  const studentProfileDob = document.getElementById("studentProfileDob");
  const studentProfileBirthday = document.getElementById("studentProfileBirthday");
  const studentProfileResults = document.getElementById("studentProfileResults");
  const studentProfileAverageScore = document.getElementById("studentProfileAverageScore");
  const studentProfileAverageGrade = document.getElementById("studentProfileAverageGrade");
  const studentDobField = document.getElementById("studentDobField");
  const studentDob = document.getElementById("studentDob");
  const studentGenderField = document.getElementById("studentGenderField");
  const studentGender = document.getElementById("studentGender");
  const studentPhotoCapture = document.getElementById("studentPhotoCapture");
  const studentCameraPreview = document.getElementById("studentCameraPreview");
  const studentCameraFlash = document.getElementById("studentCameraFlash");
  const studentPhotoStatus = document.getElementById("studentPhotoStatus");
  const examStudentPhoto = document.getElementById("examStudentPhoto");
  function updateStudentProfileGrade(grade) {
    const gradeClasses = ["grade-S", "grade-A", "grade-B", "grade-C", "grade-D", "grade-E", "grade-F"];
    studentProfileAverageScore.classList.remove(...gradeClasses);
    studentProfileAverageGrade.classList.remove(...gradeClasses);
    if (grade) {
      studentProfileAverageScore.classList.add(`grade-${grade}`);
      studentProfileAverageGrade.classList.add(`grade-${grade}`);
    }
  }
  let photoOverrides = {};
  try {
    photoOverrides = JSON.parse(localStorage.getItem(STORAGE_STUDENT_PHOTOS) || "{}");
  } catch (error) {
    photoOverrides = {};
  }

  if (studentSelect.innerHTML !== undefined) {
    studentSelect.innerHTML = students.length
      ? `<option value="">Select your name</option>${students.map((student, index) =>
        `<option value="${index}">${escapeHtml(formatStudentName(student.name, student.gender))}</option>`).join("")}`
      : "<option value=\"\">No students registered yet</option>";
    if (students.length) studentSelect.value = "0";
  }

  let cameraStream = null;
  let cameraCaptureToken = 0;
  let pendingPhoto = "";
  let acceptedEntryPhoto = "";
  const photoPreview = document.getElementById("studentPhotoPreview");
  const takePhotoBtn = document.getElementById("takeStudentPhotoBtn");
  const usePhotoBtn = document.getElementById("useStudentPhotoBtn");
  const retakePhotoBtn = document.getElementById("retakeStudentPhotoBtn");

  function stopStudentCamera() {
    cameraCaptureToken += 1;
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    studentCameraPreview.srcObject = null;
  }

  function updateStudentPhotoRequirement() {
    studentPhotoCapture.classList.add("hidden");
    stopStudentCamera();
  }

  function updateStudentProfile() {
    const student = students[Number(studentSelect.value)];
    if (!student) {
      stopStudentCamera();
      studentProfile.classList.add("hidden");
      studentProfileResults.classList.add("hidden");
      studentDobField.classList.add("hidden");
      studentGenderField.classList.add("hidden");
      studentDob.required = false;
      studentGender.required = false;
      updateStudentPhotoRequirement();
      return;
    }
    studentProfileName.textContent = formatStudentName(student.name, student.gender);
    studentProfileClass.textContent = student.className || "-";
    studentProfileProgram.textContent = student.program || "-";
    studentProfileLevel.textContent = student.level || "-";
    const dateOfBirth = normalizeDateOfBirth(student.dateOfBirth);
    studentProfileAge.textContent = dateOfBirth
      ? `Age: ${calculateAgeDetails(dateOfBirth)}`
      : "Date of birth is required before your first exam.";
    studentProfileDob.textContent = dateOfBirth ? `Date of birth: ${formatDateOfBirth(dateOfBirth)}` : "";
    const birthdayDays = dateOfBirth ? daysUntilNextBirthday(dateOfBirth) : "";
    studentProfileBirthday.textContent = dateOfBirth
      ? birthdayDays === 0 ? "Happy birthday!" : `Next birthday: ${birthdayDays} day${birthdayDays === 1 ? "" : "s"}`
      : "";
    const history = getResults().filter(result => result.studentName === student.name);
    const scores = history.map(result => Number(result.score)).filter(Number.isFinite);
    const averageScore = scores.length ? scores.reduce((total, score) => total + score, 0) / scores.length : null;
    studentProfileAverageScore.textContent = averageScore === null ? "-" : `${averageScore.toFixed(1)}%`;
    const averageGrade = averageScore === null ? "" : getGrade(averageScore);
    studentProfileAverageGrade.textContent = averageGrade || "-";
    updateStudentProfileGrade(averageGrade);
    studentDob.value = dateOfBirth;
    studentDob.required = !dateOfBirth;
    studentDobField.classList.toggle("hidden", Boolean(dateOfBirth));
    studentGender.value = student.gender || "";
    studentGender.required = !student.gender;
    studentGenderField.classList.toggle("hidden", Boolean(student.gender));
    const isAuthenticatedStudent = authenticatedStudent === student;
    const photo = safePhotoUrl(isAuthenticatedStudent
      ? authenticatedProfile.photo_url || student.photo
      : photoOverrides[student.name] || student.photo);
    acceptedEntryPhoto = photo || "";
    if (photo) {
      studentPhoto.src = photo;
      studentPhoto.classList.remove("hidden");
    } else {
      studentPhoto.removeAttribute("src");
      studentPhoto.classList.add("hidden");
    }
    studentProfile.classList.remove("hidden");
    studentProfileResults.classList.remove("hidden");
    updateStudentPhotoRequirement();
  }

  if (studentSelect.addEventListener) {
    studentSelect.addEventListener("change", () => {
      stopStudentCamera();
      acceptedEntryPhoto = "";
      pendingPhoto = "";
      updateStudentProfile();
      refreshExamOptions();
    });
  }
  studentDob.addEventListener("input", () => {
    const dateOfBirth = normalizeDateOfBirth(studentDob.value);
    studentProfileAge.textContent = dateOfBirth
      ? `Age: ${calculateAgeDetails(dateOfBirth)}`
      : "Date of birth is required before your first exam.";
    studentProfileDob.textContent = dateOfBirth ? `Date of birth: ${formatDateOfBirth(dateOfBirth)}` : "";
    const birthdayDays = dateOfBirth ? daysUntilNextBirthday(dateOfBirth) : "";
    studentProfileBirthday.textContent = dateOfBirth
      ? birthdayDays === 0 ? "Happy birthday!" : `Next birthday: ${birthdayDays} day${birthdayDays === 1 ? "" : "s"}`
      : "";
    const student = students[Number(studentSelect.value)];
    const history = student ? getResults().filter(result => result.studentName === student.name) : [];
    const scores = history.map(result => Number(result.score)).filter(Number.isFinite);
    const averageScore = scores.length ? scores.reduce((total, score) => total + score, 0) / scores.length : null;
    studentProfileAverageScore.textContent = averageScore === null ? "-" : `${averageScore.toFixed(1)}%`;
    const averageGrade = averageScore === null ? "" : getGrade(averageScore);
    studentProfileAverageGrade.textContent = averageGrade || "-";
    updateStudentProfileGrade(averageGrade);
  });
  if (examSelect.addEventListener) {
    examSelect.addEventListener("change", updateExamSummary);
  }
  updateStudentProfile();
  updateStudentPhotoRequirement();
  refreshExamOptions();
  updateExamSummary();

  async function captureStudentPhoto() {
    const student = students[Number(studentSelect.value)];
    if (!student || safePhotoUrl(authenticatedStudent === student
      ? authenticatedProfile.photo_url || student.photo
      : photoOverrides[student.name] || student.photo)) return;
    const token = cameraCaptureToken;
    studentPhotoCapture.classList.remove("hidden");
    studentPhotoStatus.textContent = "Center your face inside the frame, then press Take Photo.";
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false
      });
      if (token !== cameraCaptureToken || students[Number(studentSelect.value)] !== student) {
        stopStudentCamera();
        return;
      }
      studentCameraPreview.srcObject = cameraStream;
      await new Promise(resolve => {
        studentCameraPreview.addEventListener("loadedmetadata", resolve, { once: true });
      });
      takePhotoBtn.classList.remove("hidden");
      studentPhotoStatus.textContent = "Camera ready. Center your face and press Take Photo.";
    } catch (error) {
      studentPhotoStatus.textContent = "Camera access is required before starting the exam.";
      alert("The camera could not take the photo. Please allow camera access and choose the name again.");
    } finally {
    }
  }

  takePhotoBtn.addEventListener("click", () => {
    if (!cameraStream || !studentCameraPreview.videoWidth) {
      studentPhotoStatus.textContent = "Camera is not ready yet. Please wait and try again.";
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = studentCameraPreview.videoWidth;
    canvas.height = studentCameraPreview.videoHeight;
    canvas.getContext("2d").drawImage(studentCameraPreview, 0, 0, canvas.width, canvas.height);
    pendingPhoto = canvas.toDataURL("image/jpeg", 0.88);
    photoPreview.src = pendingPhoto;
    photoPreview.classList.remove("hidden");
    studentCameraPreview.classList.add("hidden");
    takePhotoBtn.classList.add("hidden");
    usePhotoBtn.classList.remove("hidden");
    retakePhotoBtn.classList.remove("hidden");
    studentPhotoStatus.textContent = "Review the photo, then choose Use This Photo or Retake Photo.";
    studentCameraFlash.classList.remove("active");
    void studentCameraFlash.offsetWidth;
    studentCameraFlash.classList.add("active");
  });

  retakePhotoBtn.addEventListener("click", () => {
    pendingPhoto = "";
    photoPreview.removeAttribute("src");
    photoPreview.classList.add("hidden");
    studentCameraPreview.classList.remove("hidden");
    usePhotoBtn.classList.add("hidden");
    retakePhotoBtn.classList.add("hidden");
    takePhotoBtn.classList.remove("hidden");
    studentPhotoStatus.textContent = "Center your face inside the frame, then press Take Photo.";
  });

  usePhotoBtn.addEventListener("click", () => {
    const student = students[Number(studentSelect.value)];
    if (!student || !pendingPhoto) return;
    acceptedEntryPhoto = pendingPhoto;
    studentPhotoStatus.textContent = "Photo accepted.";
    stopStudentCamera();
    studentPhotoCapture.classList.add("hidden");
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
    studentDateOfBirth: "",
    studentGender: "",
    studentPhoto: "",
    examDate: "",
    submitAttempts: 0,
    studentId: "",
    submitted: false,
    examStarted: false,
    sessionId: "",
    wakeLock: null,
    leaveCountdown: null,
    leaveWarningOpen: false,
    leaveReason: ""
  };

  const examScreen = document.getElementById("examScreen");
  const questionsList = document.getElementById("questionsList");
  const examSessionKey = () => `cec_exam_session_${String(authenticatedProfile.student_id || authenticatedProfile.id)}_${exam.id}`;
  function persistExamSession() {
    if (!state.examStarted || state.submitted) return;
    localStorage.setItem(examSessionKey(), JSON.stringify({
      sessionId: state.sessionId,
      studentId: state.studentId,
      examId: exam.id,
      subject: exam.subject,
      answerMode: exam.answerMode,
      current: state.current,
      answers: state.answers,
      endTime: state.endTime,
      examDate: state.examDate,
      studentName: state.studentName,
      studentClass: state.studentClass,
      studentProgram: state.studentProgram,
      studentLevel: state.studentLevel,
      studentDateOfBirth: state.studentDateOfBirth,
      studentGender: state.studentGender,
      studentPhoto: state.studentPhoto,
      questionOrder: activeQuestions
    }));
  }
  function clearExamSession() {
    localStorage.removeItem(examSessionKey());
  }
  async function requestWakeLock() {
    if (!("wakeLock" in navigator) || !state.examStarted || state.wakeLock) return;
    try {
      state.wakeLock = await navigator.wakeLock.request("screen");
      state.wakeLock.addEventListener("release", () => { state.wakeLock = null; });
    } catch (error) {
      state.wakeLock = null;
    }
  }
  function releaseWakeLock() {
    if (state.wakeLock) state.wakeLock.release().catch(() => {});
    state.wakeLock = null;
  }
  function showActiveExam() {
    state.examStarted = true;
    startScreen.classList.add("hidden");
    examScreen.classList.remove("hidden");
    document.getElementById("examStudentName").textContent = formatStudentName(state.studentName, state.studentGender);
    document.getElementById("examStudentProgram").textContent = state.studentProgram || "-";
    document.getElementById("examStudentClass").textContent = state.studentClass || "-";
    document.getElementById("examStudentLevel").textContent = state.studentLevel || "-";
    document.getElementById("examTitleHeader").textContent = exam.title;
    document.getElementById("examDate").textContent = state.examDate;
    if (state.studentPhoto) {
      examStudentPhoto.src = state.studentPhoto;
      examStudentPhoto.classList.remove("hidden");
    }
    renderQuestions();
    updateTimer();
    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(updateTimer, 1000);
    requestWakeLock();
    persistExamSession();
  }

  document.getElementById("startExamBtn").addEventListener("click", () => {
    const student = students[Number(studentSelect.value)];
    if (!student) {
      alert("Please choose your name from the student list.");
      return;
    }
    const dateOfBirth = normalizeDateOfBirth(studentDob.value);
    if (!dateOfBirth) {
      alert("Please enter your date of birth before starting the exam.");
      studentDobField.classList.remove("hidden");
      studentDob.focus();
      return;
    }
    if (!student.gender && !studentGender.value) {
      alert("Please select your gender before starting the exam.");
      studentGender.focus();
      return;
    }
    student.dateOfBirth = dateOfBirth;
    student.gender = student.gender || studentGender.value;
    localStorage.setItem(STORAGE_STUDENTS, JSON.stringify(students));
    const history = getResults().filter(result => result.studentName === student.name);
    const prerequisite = exams.find(item => item.id === exam.prerequisiteExamId);
    const prerequisiteResult = prerequisite && history.find(item => item.examId === prerequisite.id);
    if (prerequisite && (!prerequisiteResult || Number(prerequisiteResult.score) < Number(exam.minimumScore || 0))) {
      alert(`You need at least ${exam.minimumScore}% on ${prerequisite.title} before taking this exam.`);
      return;
    }
    state.studentName = student.name;
    state.studentId = student.studentId || "";
    state.studentGender = student.gender;
    state.studentClass = student.className || "";
    state.studentProgram = student.program || "";
    state.studentLevel = student.level || "";
    state.studentDateOfBirth = dateOfBirth;
    state.studentPhoto = acceptedEntryPhoto || safePhotoUrl(authenticatedStudent === student
      ? authenticatedProfile.photo_url || student.photo
      : photoOverrides[student.name] || student.photo) || "";
    activeQuestions = exam.randomizeQuestions ? [...exam.questions].sort(() => Math.random() - 0.5) : exam.questions;
    state.answers = Array(activeQuestions.length).fill("");
    state.examDate = new Intl.DateTimeFormat("en-US", {
      year: "numeric", month: "long", day: "numeric"
    }).format(new Date());
    state.sessionId = `${state.studentId || authenticatedProfile.id}-${exam.id}-${Date.now()}`;
    state.endTime = Date.now() + exam.duration * 60 * 1000;
    const previousResult = getResults().find(item => item.examId === exam.id && item.studentName === student.name);
    const examGrade = document.getElementById("examGrade");
    const currentGrade = previousResult ? (previousResult.grade || getGrade(previousResult.score)) : "";
    examGrade.textContent = currentGrade || "-";
    examGrade.className = `exam-grade ${currentGrade ? `grade-${currentGrade}` : ""}`;
    if (state.studentPhoto) {
      examStudentPhoto.src = state.studentPhoto;
      examStudentPhoto.classList.remove("hidden");
    }
    showActiveExam();
  });

  function restoreExamSession() {
    const raw = localStorage.getItem(examSessionKey());
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (saved.examId !== exam.id || saved.studentId !== authenticatedProfile.student_id && saved.studentId !== authenticatedProfile.id) return;
      if (examSelect.value !== undefined) examSelect.value = saved.examId;
      exam = exams.find(item => item.id === saved.examId) || exam;
      activeQuestions = Array.isArray(saved.questionOrder) && saved.questionOrder.length ? saved.questionOrder : exam.questions;
      Object.assign(state, saved, {examStarted: true, submitted: false, timerInterval: null, wakeLock: null});
      state.answers = Array.isArray(saved.answers) ? saved.answers : Array(activeQuestions.length).fill("");
      showActiveExam();
      document.getElementById(`question-${Math.min(state.current || 0, activeQuestions.length - 1)}`)?.scrollIntoView({block: "start"});
      studentPhotoStatus.textContent = "Existing exam session recovered.";
    } catch (error) {
      localStorage.removeItem(examSessionKey());
    }
  }
  restoreExamSession();

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
    leaveModal.classList.add("leave-warning-active");
    leaveModal.classList.remove("hidden");
    state.leaveCountdown = setInterval(() => {
      secondsLeft--;
      countdown.textContent = secondsLeft;
      if (secondsLeft <= 0) {
        clearInterval(state.leaveCountdown);
        state.leaveCountdown = null;
        leaveModal.classList.remove("leave-warning-active");
        leaveModal.classList.add("hidden");
        submitExam(true, state.leaveReason);
      }
    }, 1000);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.examStarted) {
      requestWakeLock();
      updateTimer();
    }
    persistExamSession();
  });
  window.addEventListener("beforeunload", event => {
    if (!state.examStarted || state.submitted) return;
    persistExamSession();
    event.preventDefault();
    event.returnValue = "";
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
    document.getElementById("leaveWarningModal").classList.remove("leave-warning-active");
    state.leaveWarningOpen = false;
    document.getElementById("leaveWarningModal").classList.add("hidden");
  });

  document.getElementById("leaveSubmitBtn").addEventListener("click", () => {
    clearInterval(state.leaveCountdown);
    state.leaveCountdown = null;
    document.getElementById("leaveWarningModal").classList.remove("leave-warning-active");
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
        : exam.answerMode === "spoken" && normalizeQuestionType(exam.examType) === "VOCABULARY"
          ? `<div class="spoken-answer-control"><button type="button" class="btn secondary small speak-answer-btn" data-index="${index}">Start Speaking</button><span class="speech-status" id="speech-status-${index}">Microphone required</span><span id="answer-${index}" class="spoken-answer-value">${escapeHtml(state.answers[index])}</span></div>`
        : `<input id="answer-${index}" class="answer-input" data-index="${index}" type="text" autocomplete="off" placeholder="Type your English answer here..." value="${escapeHtml(state.answers[index])}">`;
      return `
      <article class="question-card" id="question-${index}">
        <div class="question-card-heading">
          <span class="question-index">Question ${index + 1}</span>
          <span class="question-source">Week ${escapeHtml(q.week || "-")} · Day ${escapeHtml(q.day || "-")}</span>
          <span class="badge">${escapeHtml(q.type || "VOCABULARY")}</span>
        </div>
        <p class="instruction">${isDropdown ? `Choose the correct ${escapeHtml(normalizeQuestionType(q.type).toLowerCase())}:` : exam.answerMode === "spoken" ? "Speak the correct English answer:" : "Write the correct English answer:"}</p>
        <h1>${escapeHtml(q.indonesia)}</h1>
        <label for="answer-${index}">Your Answer</label>
        ${answerControl}
      </article>`;
    }).join("");

    questionsList.querySelectorAll(".answer-input").forEach(input => {
      input.addEventListener("input", () => {
        state.answers[Number(input.dataset.index)] = input.value.trim();
        persistExamSession();
        renderNavigation();
      });
    });
    questionsList.querySelectorAll(".speak-answer-btn").forEach(button => {
      button.addEventListener("click", () => startSpeechAnswer(Number(button.dataset.index), button));
    });
    renderNavigation();
  }

  function startSpeechAnswer(index, button) {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const status = document.getElementById(`speech-status-${index}`);
    if (!Recognition) {
      status.textContent = "Speech recognition is not supported in this browser.";
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    button.disabled = true;
    status.textContent = "Listening...";
    recognition.onresult = event => {
      const answer = String(event.results[0][0].transcript || "").trim();
      state.answers[index] = answer;
      document.getElementById(`answer-${index}`).textContent = answer || "No answer recognized";
      status.textContent = answer ? "Answer captured. Speak again to replace it." : "No answer recognized.";
      persistExamSession();
      renderNavigation();
    };
    recognition.onerror = event => {
      status.textContent = event.error === "not-allowed" ? "Microphone permission is required." : `Recognition failed: ${event.error}.`;
    };
    recognition.onend = () => { button.disabled = false; };
    recognition.start();
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
        state.current = Number(btn.dataset.index);
        persistExamSession();
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
    persistExamSession();
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
    releaseWakeLock();
    clearExamSession();
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
      studentId: state.studentId,
      studentGender: state.studentGender,
      studentClass: state.studentClass,
      studentProgram: state.studentProgram,
      studentLevel: state.studentLevel,
      studentDateOfBirth: state.studentDateOfBirth,
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
    <p class="result-student-name">Student: <strong>${escapeHtml(formatStudentName(result.studentName, result.studentGender))}</strong></p>
    <p>Class: <strong>${escapeHtml(result.studentClass || "-")}</strong> ·
      Program: <strong>${escapeHtml(result.studentProgram || "-")}</strong> ·
      Level: <strong>${escapeHtml(result.studentLevel || "-")}</strong></p>
    <p>Exam date: <strong>${escapeHtml(result.examDate || "-")}</strong></p>
    <div class="result-visuals">
      ${result.studentPhoto ? `<img class="result-photo" src="${escapeHtml(safePhotoUrl(result.studentPhoto))}" alt="">` : ""}
      <div class="score-circle grade-${result.grade || getGrade(result.score)}">${result.score}%</div>
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
      <strong class="grade-${item.grade || getGrade(item.score)}">${escapeHtml(item.score)}%</strong></div>`).join("");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  if (window.cecCloudReady) await window.cecCloudReady;
  initManagementTabs();
  initProtectedShortcutPage();
  initLanding();
  await initDashboard();
  initAdmin();
  initManagement();
  initExam();
  initResult();
});