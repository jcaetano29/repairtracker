// lib/ticket.js
// Generates a thermal-style PDF ticket for order intake

import { jsPDF } from "jspdf"

/**
 * Generate and open a thermal-style intake ticket PDF.
 * @param {Object} orden - The created order object
 * @param {string} orden.numero_orden - Order number
 * @param {string} orden.tipo_articulo - Article type
 * @param {string} [orden.marca] - Brand
 * @param {string} [orden.modelo] - Model
 * @param {string} [orden.problema_reportado] - Reported problem
 * @param {string} [orden.fecha_entrega_estimada] - Estimated delivery date
 * @param {Object} cliente - Client info
 * @param {string} cliente.nombre - Client name
 * @param {string} [cliente.telefono] - Client phone
 * @param {string} nombreNegocio - Business name from config
 */
export function generarTicketIngreso(orden, cliente, nombreNegocio = "RepairTrack") {
  const pageWidth = 80 // mm
  const margin = 5
  const contentWidth = pageWidth - margin * 2
  const doc = new jsPDF({
    unit: "mm",
    format: [pageWidth, 200], // tall enough, we'll trim later
  })

  let y = 8

  // --- Header: Business name ---
  doc.setFontSize(14)
  doc.setFont("helvetica", "bold")
  const nombreLines = doc.splitTextToSize(nombreNegocio, contentWidth)
  doc.text(nombreLines, pageWidth / 2, y, { align: "center" })
  y += nombreLines.length * 5 + 2

  // --- Subtitle ---
  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.text("Boleta de Ingreso", pageWidth / 2, y, { align: "center" })
  y += 6

  // --- Boleta number ---
  const numOrden = String(orden.numero_orden).padStart(4, "0")
  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.text(`#${numOrden}`, pageWidth / 2, y, { align: "center" })
  y += 7

  // --- Fecha de ingreso ---
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  const fechaIngreso = new Date().toLocaleString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
  doc.text(`Fecha: ${fechaIngreso}`, pageWidth / 2, y, { align: "center" })
  y += 5

  // --- Separator ---
  y = drawSeparator(doc, y, margin, contentWidth)

  // --- Artículo ---
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.text("ARTICULO", margin, y)
  y += 4

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  const articulo = [orden.tipo_articulo, orden.marca, orden.modelo].filter(Boolean).join(" — ")
  const artLines = doc.splitTextToSize(articulo || "—", contentWidth)
  doc.text(artLines, margin, y)
  y += artLines.length * 3.5 + 2

  // --- Problema ---
  if (orden.problema_reportado) {
    doc.setFont("helvetica", "bold")
    doc.text("PROBLEMA", margin, y)
    y += 4
    doc.setFont("helvetica", "normal")
    const probLines = doc.splitTextToSize(orden.problema_reportado, contentWidth)
    doc.text(probLines, margin, y)
    y += probLines.length * 3.5 + 2
  }

  // --- Separator ---
  y = drawSeparator(doc, y, margin, contentWidth)

  // --- Cliente ---
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.text("CLIENTE", margin, y)
  y += 4

  doc.setFont("helvetica", "normal")
  doc.text(cliente.nombre || "—", margin, y)
  y += 4
  if (cliente.telefono) {
    doc.text(`Tel: ${cliente.telefono}`, margin, y)
    y += 4
  }
  y += 1

  // --- Separator ---
  y = drawSeparator(doc, y, margin, contentWidth)

  // --- Fecha entrega estimada ---
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.text("ENTREGA ESTIMADA", margin, y)
  y += 4

  doc.setFont("helvetica", "normal")
  if (orden.fecha_entrega_estimada) {
    const fechaEntrega = new Date(orden.fecha_entrega_estimada).toLocaleDateString("es-UY", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
    doc.text(fechaEntrega, margin, y)
  } else {
    doc.text("A confirmar", margin, y)
  }
  y += 5

  // --- Separator ---
  y = drawSeparator(doc, y, margin, contentWidth)

  // --- Footer ---
  doc.setFontSize(8)
  doc.setFont("helvetica", "italic")
  doc.text("Gracias por su confianza", pageWidth / 2, y + 2, { align: "center" })
  y += 8

  // Open in new tab
  const pdfBlob = doc.output("blob")
  const url = URL.createObjectURL(pdfBlob)
  window.open(url, "_blank")
}

function drawSeparator(doc, y, margin, contentWidth) {
  doc.setLineDashPattern([1, 1], 0)
  doc.setLineWidth(0.3)
  doc.line(margin, y, margin + contentWidth, y)
  doc.setLineDashPattern([], 0)
  return y + 4
}
