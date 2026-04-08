import { sendNotification } from "@/lib/notifications";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export async function POST(request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type, data } = body;
    await sendNotification(type, data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[/api/notify]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
