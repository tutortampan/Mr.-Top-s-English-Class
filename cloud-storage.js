(() => {
  const SUPABASE_URL = "https://xuiszvwfjccvucqpactf.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_dvMkwNJpPlryF0KNiaJRfQ_-fR1WW_4";
  const USE_LOCAL_MODE = !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === "******";
  const TABLE = "cec_app_state";
  const originalSetItem = localStorage.setItem.bind(localStorage);
  const originalRemoveItem = localStorage.removeItem.bind(localStorage);
  let pushTimer;

  function snapshot() {
    const data = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key) data[key] = localStorage.getItem(key);
    }
    return data;
  }

  async function request(path, options = {}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    if (!response.ok) throw new Error(`Cloud storage request failed (${response.status}).`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  window.cecCloudAuth = {
    getAccessToken() {
      return sessionStorage.getItem("cec_auth_access_token") || "";
    }
  };

  window.cecStudentAuth = async function studentAuth(payload) {
    if (USE_LOCAL_MODE) return localStudentAuth(payload);
    const response = await fetch(`${SUPABASE_URL}/functions/v1/student-auth`, {
      method: "POST",
      headers: {"Content-Type": "application/json", apikey: SUPABASE_ANON_KEY},
      body: JSON.stringify(payload)
    });
    if (response.status === 404) return localStudentAuth(payload);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(response.status === 404
        ? "Student login service is not deployed. Deploy the supabase/functions/student-auth Edge Function first."
        : (data.error || `Student authentication failed (${response.status}).`));
    }
    if (data.session) {
      sessionStorage.setItem("cec_student_session", JSON.stringify(data.session));
      sessionStorage.setItem("cec_student_profile", JSON.stringify(data.profile));
      sessionStorage.setItem("cec_student_progress", JSON.stringify(data.progress || null));
    }
    return data;
  };

  async function hashLocalPassword(password) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function localStudents() {
    try {
      return JSON.parse(localStorage.getItem("cec_students_v1") || "[]");
    } catch (error) {
      return [];
    }
  }

  async function localStudentAuth(payload) {
    const students = localStudents().filter(student =>
      String(student.program || "").trim().toLowerCase() === String(payload.program || "").trim().toLowerCase() &&
      String(student.className || "").trim().toLowerCase() === String(payload.class_name || "").trim().toLowerCase() &&
      String(student.name || "").trim().toLowerCase() === String(payload.full_name || "").trim().toLowerCase()
    );
    if (students.length !== 1) throw new Error("Student account could not be identified.");
    const student = students[0];
    const key = String(student.studentId || student.name).trim().toLowerCase();
    const profile = {
      id: key,
      student_id: student.studentId || key,
      full_name: student.name,
      program: student.program || "",
      class_name: student.className || "",
      current_level: student.level || "",
      date_of_birth: student.dateOfBirth || null,
      gender: student.gender || null,
      photo_url: student.photo || null,
      status: "active"
    };
    const session = {local: true, student_key: key};
    sessionStorage.setItem("cec_student_session", JSON.stringify(session));
    sessionStorage.setItem("cec_student_profile", JSON.stringify(profile));
    sessionStorage.setItem("cec_student_progress", "null");
    return {session, profile, progress: null};
  }

  async function studentRequest(payload) {
    const session = JSON.parse(sessionStorage.getItem("cec_student_session") || "null");
    if (!session || !session.access_token) throw new Error("Student login is required.");
    const response = await fetch(`${SUPABASE_URL}/functions/v1/student-auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Student request failed.");
    return data;
  }

  window.cecStudentProfile = async function studentProfile() {
    const localSession = JSON.parse(sessionStorage.getItem("cec_student_session") || "null");
    if (localSession && localSession.local) {
      const profile = JSON.parse(sessionStorage.getItem("cec_student_profile") || "null");
      if (!profile || profile.id !== localSession.student_key) throw new Error("Student login is required.");
      return {profile, progress: null};
    }
    const data = await studentRequest({action: "profile"});
    sessionStorage.setItem("cec_student_profile", JSON.stringify(data.profile));
    sessionStorage.setItem("cec_student_progress", JSON.stringify(data.progress || null));
    return data;
  };

  window.cecStudentChangePassword = async function studentChangePassword(currentPassword, newPassword) {
    const localSession = JSON.parse(sessionStorage.getItem("cec_student_session") || "null");
    if (localSession && localSession.local) {
      const currentHash = await hashLocalPassword(currentPassword);
      const passwordKey = `cec_student_password_${localSession.student_key}`;
      if (currentHash !== (localStorage.getItem(passwordKey) || await hashLocalPassword("123"))) {
        throw new Error("Current password is incorrect.");
      }
      if (String(newPassword || "").length < 3) throw new Error("Password must contain at least 3 characters.");
      localStorage.setItem(passwordKey, await hashLocalPassword(newPassword));
      return {success: true};
    }
    return studentRequest({
      action: "change_password",
      current_password: currentPassword,
      new_password: newPassword
    });
  };

  window.cecCloudRpc = async function rpc(functionName, body) {
    const token = window.cecCloudAuth.getAccessToken();
    if (!token) throw new Error("A signed-in account is required.");
    return request(`rpc/${functionName}`, {
      method: "POST",
      headers: {Authorization: `Bearer ${token}`},
      body: JSON.stringify(body)
    });
  };

  async function push() {
    await request(TABLE, {
      method: "POST",
      headers: {Prefer: "resolution=merge-duplicates,return=minimal"},
      body: JSON.stringify({id: 1, payload: snapshot(), updated_at: new Date().toISOString()})
    });
  }

  function schedulePush() {
    if (USE_LOCAL_MODE) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      push().catch(error => console.warn("Cloud synchronization unavailable:", error.message));
    }, 400);
  }

  localStorage.setItem = (key, value) => {
    originalSetItem(key, value);
    schedulePush();
  };
  localStorage.removeItem = key => {
    originalRemoveItem(key);
    schedulePush();
  };

  window.cecCloudReady = (async () => {
    if (USE_LOCAL_MODE) return;
    try {
      const rows = await request(`${TABLE}?id=eq.1&select=payload`);
      const remote = rows[0] && rows[0].payload;
      if (remote && typeof remote === "object" && Object.keys(remote).length) {
        Object.entries(remote).forEach(([key, value]) => originalSetItem(key, value));
      } else if (Object.keys(snapshot()).length) {
        await push();
      }
    } catch (error) {
      console.warn("Using local storage because cloud synchronization is unavailable:", error.message);
    }
  })();
})();
