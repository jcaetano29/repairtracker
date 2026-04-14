import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { crearTraslado, getTrasladoActivo } from "@/lib/traslados";
import { getOrden } from "@/lib/data";

export async function POST(request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { orden_id } = await request.json();
    if (!orden_id) {
      return NextResponse.json({ error: "orden_id requerido" }, { status: 400 });
    }

    // Validate UUID format (Fix 13)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(orden_id)) {
      return NextResponse.json({ error: "orden_id inválido" }, { status: 400 });
    }

    const orden = await getOrden(orden_id);
    if (!orden) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    // Only admin or employee at the order's current location can create retorno
    const isAdmin = session.user?.role === "admin";
    if (!isAdmin && session.user?.sucursal_id !== orden.sucursal_id) {
      return NextResponse.json({ error: "Solo la sucursal actual puede crear traslado de retorno" }, { status: 403 });
    }

    // Validate retorno origin matches current location
    if (!orden.sucursal_id) {
      return NextResponse.json({ error: "Orden sin ubicación actual" }, { status: 400 });
    }

    if (orden.sucursal_retiro_id === orden.sucursal_id) {
      return NextResponse.json({ message: "No transfer needed" }, { status: 200 });
    }

    // Check if retorno already exists
    const existing = await getTrasladoActivo(orden_id);
    if (existing) {
      return NextResponse.json({ message: "Transfer already exists", traslado: existing }, { status: 200 });
    }

    const traslado = await crearTraslado({
      orden_id,
      sucursal_origen: orden.sucursal_id,
      sucursal_destino: orden.sucursal_retiro_id,
      tipo: "retorno",
      creado_por: session.user?.id,
    });

    return NextResponse.json({ traslado });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
