"use client";

export function StatCard({ label, value, icon, color }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex-1 min-w-[140px]">
      <div className="text-xs text-slate-500 flex items-center gap-1.5 mb-1">
        <span>{icon}</span> {label}
      </div>
      <div
        className="text-3xl font-bold tracking-tight"
        style={{ color: color || "#0f172a" }}
      >
        {value}
      </div>
    </div>
  );
}
