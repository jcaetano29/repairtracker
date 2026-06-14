import { getSupabaseAdmin } from "../supabase-admin";

// Server-only: configuracion has admin-only RLS on SELECT, so reads must use the
// service-role client. Client components must read via /api/configuracion instead.
export async function getConfiguracion() {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("configuracion")
      .select("clave, valor");

    if (error) throw error;

    // Transform array of {clave, valor} into a single object
    const config = {};
    if (data && Array.isArray(data)) {
      data.forEach(({ clave, valor }) => {
        config[clave] = valor;
      });
    }

    return config;
  } catch (error) {
    console.error("[getConfiguracion] Error fetching configuracion:", error);
    return {};
  }
}
