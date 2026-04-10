/**
 * Simple toast notification utility
 * Shows temporary success/error messages
 */

export const toast = {
  success(message) {
    // For now, use a simple approach with a console log
    // In production, this could be enhanced with a toast library
    console.log("[SUCCESS]", message)
  },

  error(message) {
    console.error("[ERROR]", message)
  },
}
