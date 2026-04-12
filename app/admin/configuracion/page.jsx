import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { getConfiguracion } from "@/lib/data/configuracion"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import ConfiguracionClient from "./configuracion-client"

export default async function ConfiguracionPage() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect("/login")
  }

  if (session.user.role !== "admin") {
    redirect("/dashboard")
  }

  let configuracion = {}
  try {
    configuracion = await getConfiguracion()
  } catch (error) {
    console.error("[ConfiguracionPage] Error loading configuration:", error)
  }

  let plantillasEmail = []
  try {
    const { data } = await getSupabaseAdmin()
      .from("plantillas_email")
      .select("tipo, asunto, cuerpo, updated_at")
      .order("tipo")
    plantillasEmail = data || []
  } catch (error) {
    console.error("[ConfiguracionPage] Error loading plantillas email:", error)
  }

  return (
    <div>
      <ConfiguracionClient configuracion={configuracion} plantillasEmail={plantillasEmail} />
    </div>
  )
}
