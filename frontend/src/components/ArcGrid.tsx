import clsx from "clsx";

const ARC_COLORS: string[] = [
  "#000000",
  "#0074D9",
  "#2ECC40",
  "#FF4136",
  "#FFDC00",
  "#AAAAAA",
  "#F012BE",
  "#FF851B",
  "#7FDBFF",
  "#870C25",
];

const TEXT_COLOR = "rgba(255, 255, 255, 0.92)";

export type ArcGridProps = {
  grid: number[][] | null | undefined;
  label?: string;
};

export function ArcGrid({ grid, label }: ArcGridProps) {
  if (!grid || grid.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200/70 bg-slate-100/60 p-4 text-sm text-slate-500 dark:border-slate-800/60 dark:bg-slate-900/60 dark:text-slate-400">
        No grid data
      </div>
    );
  }

  return (
    <figure className="space-y-2">
      {label ? (
        <figcaption className="text-sm font-medium text-slate-600 dark:text-slate-300">
          {label}
        </figcaption>
      ) : null}
      <div
        className="inline-flex flex-col gap-0.5 rounded-xl border border-slate-200/60 bg-slate-50/70 p-2 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/40"
        role="group"
        aria-label={label}
      >
        {grid.map((row, rowIndex) => (
          <div key={`row-${rowIndex}`} className="flex gap-0.5">
            {row.map((value, columnIndex) => {
              const safeValue = typeof value === "number" && value >= 0 && value < ARC_COLORS.length ? value : 0;
              const backgroundColor = ARC_COLORS[safeValue];
              const cellLabel = `${label ?? "cell"} r${rowIndex + 1}c${columnIndex + 1}: ${safeValue}`;
              return (
                <div
                  key={`cell-${rowIndex}-${columnIndex}`}
                  className={clsx(
                    "flex h-6 w-6 items-center justify-center rounded-sm text-[11px] font-semibold",
                    "shadow-sm shadow-slate-900/10 dark:shadow-black/40"
                  )}
                  style={{ backgroundColor, color: TEXT_COLOR }}
                  aria-label={cellLabel}
                >
                  {safeValue}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </figure>
  );
}
