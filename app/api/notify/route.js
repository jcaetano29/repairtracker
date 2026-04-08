import { sendNotification } from "@/lib/notifications";
import { NextResponse } from "next/server";

export async function POST(request) {
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
