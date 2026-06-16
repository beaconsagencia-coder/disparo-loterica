import type { ReactNode } from "react";

export function BentoGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 auto-rows-[140px]">
      {children}
    </div>
  );
}

interface BentoCardProps {
  children: ReactNode;
  /** colSpan e rowSpan em unidades do grid */
  colSpan?: 1 | 2 | 3 | 4;
  rowSpan?: 1 | 2 | 3;
  className?: string;
}

const colMap = { 1: "col-span-1", 2: "col-span-2", 3: "col-span-3", 4: "col-span-4" };
const rowMap = { 1: "row-span-1", 2: "row-span-2", 3: "row-span-3" };

export function BentoCard({ children, colSpan = 1, rowSpan = 1, className = "" }: BentoCardProps) {
  return (
    <div className={`bento-card overflow-hidden ${colMap[colSpan]} ${rowMap[rowSpan]} ${className}`}>
      {children}
    </div>
  );
}

export function Metric({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="flex h-full flex-col justify-between">
      <span className="text-sm text-ink-muted">{label}</span>
      <div>
        <div className={`text-3xl font-semibold tracking-tight ${accent ?? "text-ink"}`}>{value}</div>
        {hint && <div className="mt-1 text-xs text-ink-muted">{hint}</div>}
      </div>
    </div>
  );
}
