import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = (Deno.env.get("APP_ORIGINS") || "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

if (!supabaseUrl || !serviceRoleKey || !anonKey || !allowedOrigins.length) {
  throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, and APP_ORIGINS must be configured.");
}

const admin = createClient(supabaseUrl, serviceRoleKey);

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function response(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {...corsHeaders(request), "Content-Type": "application/json"}
  });
}

function accountEmail(studentId: string) {
  return `student-${studentId.toLowerCase().replace(/[^a-z0-9]/g, "")}@student.local`;
}

async function recalculateProgress(studentId: string, triggerEvent: string) {
  const result = await admin.rpc("advance_student_progression", {
    p_student_id: studentId,
    p_trigger_event: triggerEvent
  });
  if (result.error) throw result.error;
  return result.data;
}

async function findStudent(body: Record<string, string>) {
  const values = ["program", "class_name", "full_name"];
  if (values.some(value => !String(body[value] || "").trim())) {
    throw new Error("Program, class, and name are required.");
  }
  let query = admin.from("students")
    .select("id, student_id, full_name, program, class_name, current_level, date_of_birth, gender, photo_url, status")
    .eq("program", body.program.trim())
    .eq("class_name", body.class_name.trim())
    .ilike("full_name", body.full_name.trim())
    .eq("status", "active");
  if (String(body.current_level || "").trim()) query = query.eq("current_level", body.current_level.trim());
  const {data, error} = await query;
  if (error) throw error;
  if (!data || data.length !== 1) {
    throw new Error(data && data.length > 1
      ? "More than one student matches. Please select a level."
      : "Student account could not be identified.");
  }
  return data[0];
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", {headers: corsHeaders(request)});
  if (request.method !== "POST") return response(request, {error: "Method not allowed"}, 405);
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return response(request, {error: "A JSON object is required."}, 400);
    }
    if (body.action === "change_password") {
      const authorization = request.headers.get("Authorization") || "";
      const token = authorization.replace(/^Bearer\s+/i, "");
      const user = await admin.auth.getUser(token);
      if (user.error || !user.data.user) return response(request, {error: "Authentication required."}, 401);
      if (String(body.new_password || "").length < 3) {
        return response(request, {error: "Password must contain at least 3 characters."}, 400);
      }
      const account = (await admin.from("student_accounts").select("user_id, auth_email").eq("user_id", user.data.user.id).single()).data;
      if (!account) return response(request, {error: "Student account is not linked."}, 403);
      const verified = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {"apikey": Deno.env.get("SUPABASE_ANON_KEY")!, "Content-Type": "application/json"},
        body: JSON.stringify({email: account.auth_email, password: body.current_password})
      });
      if (!verified.ok) return response(request, {error: "Current password is incorrect."}, 401);
      const updated = await admin.auth.admin.updateUserById(account.user_id, {password: body.new_password});
      if (updated.error) throw updated.error;
      const saved = await admin.from("student_accounts").update({
        password_not_set: false,
        password_updated_at: new Date().toISOString()
      }).eq("user_id", account.user_id);
      if (saved.error) throw saved.error;
      return response(request, {success: true});
    }
    if (body.action === "profile") {
      const authorization = request.headers.get("Authorization") || "";
      const token = authorization.replace(/^Bearer\s+/i, "");
      const user = await admin.auth.getUser(token);
      if (user.error || !user.data.user) return response(request, {error: "Authentication required."}, 401);
      const account = (await admin.from("student_accounts").select("student_id").eq("user_id", user.data.user.id).single()).data;
      if (!account) return response(request, {error: "Student account is not linked."}, 403);
      const student = (await admin.from("students")
        .select("id, student_id, full_name, program, class_name, current_level, date_of_birth, gender, photo_url, status")
        .eq("id", account.student_id).eq("status", "active").single()).data;
      if (!student) return response(request, {error: "Student profile is unavailable."}, 404);
      const progression = await recalculateProgress(student.id, "profile_view");
      const refreshedStudent = (await admin.from("students")
        .select("id, student_id, full_name, program, class_name, current_level, date_of_birth, gender, photo_url, status")
        .eq("id", student.id).single()).data || student;
      const progress = (await admin.from("student_progress").select("*").eq("student_id", student.id).maybeSingle()).data;
      return response(request, {profile: refreshedStudent, progress, progression});
    }
    const student = await findStudent(body);
    const email = accountEmail(student.student_id);
    const action = body.action || "login";
    let account = (await admin.from("student_accounts").select("*").eq("student_id", student.id).maybeSingle()).data;

    let loginPassword = "";
    if (action === "login") {
      loginPassword = crypto.randomUUID();
      let userId = account?.user_id;
      if (!userId) {
        const created = await admin.auth.admin.createUser({email, password: loginPassword, email_confirm: true});
        if (created.error) throw created.error;
        userId = created.data.user.id;
      } else {
        const updated = await admin.auth.admin.updateUserById(userId, {password: loginPassword});
        if (updated.error) throw updated.error;
      }
      const saved = await admin.from("student_accounts").upsert({
        student_id: student.id,
        user_id: userId,
        auth_email: email,
        password_not_set: true,
        password_created_at: account?.password_created_at || new Date().toISOString(),
        password_updated_at: new Date().toISOString()
      });
      if (saved.error) throw saved.error;
      account = {user_id: userId, auth_email: email, password_not_set: true};
    }

    if (action === "login") {
      const signedIn = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {"apikey": Deno.env.get("SUPABASE_ANON_KEY")!, "Content-Type": "application/json"},
        body: JSON.stringify({email, password: loginPassword})
      });
      const session = await signedIn.json();
      if (!signedIn.ok) return response(request, {error: "Incorrect password."}, 401);
      const progress = (await admin.from("student_progress").select("*").eq("student_id", student.id).maybeSingle()).data;
      const progression = await recalculateProgress(student.id, "student_login");
      const refreshedStudent = (await admin.from("students")
        .select("id, student_id, full_name, program, class_name, current_level, date_of_birth, gender, photo_url, status")
        .eq("id", student.id).single()).data || student;
      const refreshedProgress = (await admin.from("student_progress").select("*").eq("student_id", student.id).maybeSingle()).data || progress;
      return response(request, {session, profile: refreshedStudent, progress: refreshedProgress, progression});
    }
    throw new Error("Unsupported authentication action.");
  } catch (error) {
    return response(request, {error: error instanceof Error ? error.message : "Authentication failed."}, 400);
  }
});
