import { supabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// Helper: verify caller is dueno
async function verifyDueno() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "dueno") return false;
  return true;
}

// GET — list all users
export async function GET() {
  if (!(await verifyDueno())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const users = data.users.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.app_metadata?.role || "empleado",
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
  }));

  return NextResponse.json({ users });
}

// POST — invite a new user
export async function POST(request) {
  if (!(await verifyDueno())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, role } = body;
  if (!email || !role) {
    return NextResponse.json({ error: "email and role required" }, { status: 400 });
  }

  if (!["empleado", "dueno"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { role }, // sets user_metadata
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!data?.user?.id) {
    return NextResponse.json({ error: "Invalid response from auth service" }, { status: 500 });
  }

  // Set app_metadata.role (more secure than user_metadata)
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
    app_metadata: { role },
  });

  if (updateError) {
    return NextResponse.json({ error: "Failed to set role" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE — remove a user
export async function DELETE(request) {
  if (!(await verifyDueno())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { userId } = body;
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
