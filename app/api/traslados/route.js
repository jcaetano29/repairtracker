import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTraslados, despacharTraslado, recibirTraslado } from "@/lib/traslados";

export async function GET(request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const sucursal_id = searchParams.get("sucursal_id") || undefined;
    const traslados = await getTraslados({ sucursal_id });
    return NextResponse.json({ traslados });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { traslado_id, accion } = await request.json();

    if (!traslado_id || !["despachar", "recibir"].includes(accion)) {
      return NextResponse.json({ error: "traslado_id y accion (despachar|recibir) requeridos" }, { status: 400 });
    }

    let traslado;
    if (accion === "despachar") {
      traslado = await despacharTraslado(traslado_id);
    } else {
      traslado = await recibirTraslado(traslado_id, session.user?.id);
    }

    return NextResponse.json({ traslado });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
