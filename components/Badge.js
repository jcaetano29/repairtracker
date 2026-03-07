"use client";

import { ESTADOS } from "@/lib/constants";

export function Badge({ estado, size = "sm" }) {
  const e = ESTADOS[estado];
  if (!e) return <span>{estado}</span>;

  const sizes = {
    sm: "text-xs px-2.5 py-0.5",
    md: "text-sm px-3 py-1",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ${sizes[size]}`}
      style={{
        color: e.color,
        backgroundColor: e.bg,
        border: `1px solid ${e.color}22`,
      }}
    >
      <span>{e.icon}</span> {e.label}
    </span>
  );
}
