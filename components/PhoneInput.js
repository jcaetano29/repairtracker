"use client"

import { useState, useEffect, useRef } from "react"
import { COUNTRIES, parsePhone } from "@/lib/countries"
import { sanitizePhone } from "@/lib/utils"

function ChevronDown({ className }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 4 L6 8 L10 4" />
    </svg>
  )
}

export default function PhoneInput({
  value = "",
  onChange,
  placeholder = "99 123 456",
  required = false,
  className = "",
}) {
  const initial = parsePhone(value)
  const [country, setCountry] = useState(initial.country)
  const [number, setNumber] = useState(initial.number)
  const [open, setOpen] = useState(false)
  const lastEmittedRef = useRef(value)
  const wrapperRef = useRef(null)

  // Sync when value changes from outside (e.g., parent loads a different record)
  useEffect(() => {
    if (value !== lastEmittedRef.current) {
      const parsed = parsePhone(value)
      setCountry(parsed.country)
      setNumber(parsed.number)
      lastEmittedRef.current = value
    }
  }, [value])

  // Close dropdown on click outside or Escape
  useEffect(() => {
    if (!open) return

    function handleMouseDown(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setOpen(false)
    }

    document.addEventListener("mousedown", handleMouseDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleMouseDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  function emit(newValue) {
    lastEmittedRef.current = newValue
    onChange?.(newValue)
  }

  function handleCountrySelect(newCountry) {
    setCountry(newCountry)
    setOpen(false)
    // Emit even when number is empty so the parent sees the new prefix.
    // If you prefer "no number = no value", change to: number === "" ? "" : newCountry.dial + number
    emit(newCountry.dial + number)
  }

  function handleNumberChange(e) {
    const cleaned = sanitizePhone(e.target.value)
    setNumber(cleaned)
    // Clearing the input emits "" so the parent matches the previous behavior of an empty <input>.
    emit(cleaned === "" ? "" : country.dial + cleaned)
  }

  const Flag = country.Flag

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="flex items-stretch border border-slate-200 rounded-lg focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 bg-white">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Seleccionar país"
          className="flex items-center gap-2 px-3 border-r border-slate-200 text-sm text-slate-700 hover:bg-slate-50 rounded-l-lg"
        >
          <Flag title={country.name} className="w-5 h-auto rounded-sm" />
          <span>+{country.dial}</span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>
        <input
          type="tel"
          inputMode="numeric"
          required={required}
          placeholder={placeholder}
          value={number}
          onChange={handleNumberChange}
          className="flex-1 px-3 py-2.5 text-sm focus:outline-none bg-transparent rounded-r-lg"
        />
      </div>

      {open && (
        <ul
          role="listbox"
          className="absolute z-10 mt-1 w-64 bg-white rounded-lg shadow-lg border border-slate-200 py-1 max-h-72 overflow-auto"
        >
          {COUNTRIES.map((c) => {
            const ItemFlag = c.Flag
            const selected = c.code === country.code
            return (
              <li key={c.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => handleCountrySelect(c)}
                  className={`flex items-center gap-3 px-3 py-2 w-full text-left text-sm hover:bg-slate-50 ${
                    selected ? "bg-indigo-50" : ""
                  }`}
                >
                  <ItemFlag title={c.name} className="w-5 h-auto rounded-sm" />
                  <span className="text-slate-700">{c.name}</span>
                  <span className="ml-auto text-slate-500">+{c.dial}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
