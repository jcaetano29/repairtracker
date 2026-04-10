import { getSupabaseClient } from "../supabase-client";

/**
 * Fetches all configuracion rows and transforms them into an object
 * @returns {Promise<Object>} Object mapping clave to valor (e.g., {umbral_ingresado: {leve: 2, grave: 5}, ...})
 */
export async function getConfiguracion() {
  try {
    const { data, error } = await getSupabaseClient()
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

/**
 * Updates a configuracion entry
 * @param {string} clave - The configuration key (e.g., "umbral_ingresado")
 * @param {Object} valor - The configuration value (e.g., {leve: 2, grave: 5})
 * @returns {Promise<Object>} {success: true, data: updatedRow} or {success: false, error: errorMessage}
 */
export async function updateConfiguracion(clave, valor) {
  try {
    const now = new Date().toISOString();

    const { data, error } = await getSupabaseClient()
      .from("configuracion")
      .update({
        valor,
        actualizado_en: now,
      })
      .eq("clave", clave)
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error("[updateConfiguracion] Error updating configuracion:", error);
    return {
      success: false,
      error: error.message || "Unknown error occurred",
    };
  }
}
