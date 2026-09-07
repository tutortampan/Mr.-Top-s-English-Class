(() => {
  const SUPABASE_URL = "https://xuiszvwfjccvucqpactf.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1aXN6dndmamNjdnVjcXBhY3RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3MzUwNzIsImV4cCI6MjEwNDMxMTA3Mn0.BOXYIVRjQsNI_Wyh5QfsKUlpS6MF7qMR1x59bAG_zi4";
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

  async function request(path, options) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        ...(options && options.headers ? options.headers : {})
      }
    });
    if (!response.ok) throw new Error(`Cloud storage request failed (${response.status}).`);
    return response.status === 204 ? null : response.json();
  }

  async function push() {
    await request(TABLE, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: 1, payload: snapshot(), updated_at: new Date().toISOString() })
    });
  }

  function schedulePush() {
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
    try {
      const rows = await request(`${TABLE}?id=eq.1&select=payload`, { method: "GET" });
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
