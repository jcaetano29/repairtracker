// lib/ticket.js
// Generates thermal-style PDF tickets for order intake (2 pages: store + client)

import { jsPDF } from "jspdf"

/**
 * Generate and open a 2-page ticket PDF: page 1 for the store, page 2 for the client.
 * @param {Object} orden - The created order object
 * @param {Object} cliente - Client info { nombre, telefono }
 * @param {string} nombreNegocio - Business name from config
 */
export function generarTicketIngreso(orden, cliente, nombreNegocio = "RepairTrack") {
  const pageWidth = 80
  const margin = 5
  const contentWidth = pageWidth - margin * 2

  const doc = new jsPDF({
    unit: "mm",
    format: [pageWidth, 200],
  })

  // Page 1: Store copy
  renderTicket(doc, {
    orden,
    cliente,
    nombreNegocio,
    copia: "COPIA JOYERIA",
    showNotas: true,
    showCliente: true,
    pageWidth,
    margin,
    contentWidth,
  })

  // Page 2: Client copy
  doc.addPage([pageWidth, 200])
  renderTicket(doc, {
    orden,
    cliente,
    nombreNegocio,
    copia: "COPIA CLIENTE",
    showNotas: false,
    showCliente: false,
    pageWidth,
    margin,
    contentWidth,
  })

  const pdfBlob = doc.output("blob")
  const url = URL.createObjectURL(pdfBlob)
  window.open(url, "_blank")
}

function renderTicket(doc, { orden, cliente, nombreNegocio, copia, showNotas, showCliente, pageWidth, margin, contentWidth }) {
  let y = 6

  // --- Copy label ---
  doc.setFontSize(7)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(150, 150, 150)
  doc.text(copia, pageWidth / 2, y, { align: "center" })
  doc.setTextColor(0, 0, 0)
  y += 4

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

  y = drawSeparator(doc, y, margin, contentWidth)

  // --- Artículo ---
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.text("ARTICULO", margin, y)
  y += 4

  doc.setFont("helvetica", "normal")
  const articulo = [orden.tipo_articulo, orden.marca, orden.modelo].filter(Boolean).join(" — ")
  const artLines = doc.splitTextToSize(articulo || "—", contentWidth)
  doc.text(artLines, margin, y)
  y += artLines.length * 3.5 + 2

  // --- Material y peso ---
  const materialLabel = orden.material === "otro" ? orden.material_otro : orden.material
  if (materialLabel || orden.peso_gramos) {
    const materialParts = []
    if (materialLabel) materialParts.push(materialLabel.charAt(0).toUpperCase() + materialLabel.slice(1))
    if (orden.peso_gramos) materialParts.push(`${orden.peso_gramos}g`)
    doc.text(materialParts.join(" — "), margin, y)
    y += 4
  }

  // --- Descripcion ---
  if (orden.descripcion) {
    doc.setFont("helvetica", "bold")
    doc.text("DESCRIPCION", margin, y)
    y += 4
    doc.setFont("helvetica", "normal")
    const descLines = doc.splitTextToSize(orden.descripcion, contentWidth)
    doc.text(descLines, margin, y)
    y += descLines.length * 3.5 + 2
  }

  // --- Garantia ---
  if (orden.en_garantia) {
    doc.setFont("helvetica", "bold")
    doc.setTextColor(22, 163, 74)
    doc.text("* EN GARANTIA *", margin, y)
    doc.setTextColor(0, 0, 0)
    doc.setFont("helvetica", "normal")
    y += 5
  }

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

  // --- Notas internas (store copy only) ---
  if (showNotas && orden.notas_internas) {
    doc.setFont("helvetica", "bold")
    doc.text("NOTAS INTERNAS", margin, y)
    y += 4
    doc.setFont("helvetica", "normal")
    const notasLines = doc.splitTextToSize(orden.notas_internas, contentWidth)
    doc.text(notasLines, margin, y)
    y += notasLines.length * 3.5 + 2
  }

  y = drawSeparator(doc, y, margin, contentWidth)

  // --- Cliente (store copy only) ---
  if (showCliente) {
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

    y = drawSeparator(doc, y, margin, contentWidth)
  }

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

  y = drawSeparator(doc, y, margin, contentWidth)

  // --- Footer ---
  doc.setFontSize(8)
  doc.setFont("helvetica", "italic")
  doc.text("Gracias por su confianza", pageWidth / 2, y + 2, { align: "center" })
}

function drawSeparator(doc, y, margin, contentWidth) {
  doc.setLineDashPattern([1, 1], 0)
  doc.setLineWidth(0.3)
  doc.line(margin, y, margin + contentWidth, y)
  doc.setLineDashPattern([], 0)
  return y + 4
}
