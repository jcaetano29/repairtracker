import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { crearTraslado } from "@/lib/traslados";
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

    const orden = await getOrden(orden_id);
    if (!orden) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    if (orden.sucursal_retiro_id === orden.sucursal_id) {
      return NextResponse.json({ message: "No transfer needed" }, { status: 200 });
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
