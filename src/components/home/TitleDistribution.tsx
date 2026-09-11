import { useEffect, useRef, useState } from "react";
import { MILESTONES, TITLE_FILL } from "@/milestones";
import type { MemberStats } from "@/stats";
import { cn } from "@/lib/utils";

/**
 * 称号分布：分段条 + 图例（从首页社群全景区抽出，大屏里程碑分布区复用）。
 * 悬浮/点按出气泡（人数 + 占比），点按可固定、再点取消，触屏可用。
 */
export function TitleDistribution({ members }: { members: MemberStats[] }) {
  const novices = members.filter((m) => m.prevMilestone === 0).length;
  const census = [...MILESTONES]
    .reverse()
    .map(({ threshold, title }) => ({
      key: threshold,
      name: title,
      count: members.filter((m) => m.prevMilestone === threshold).length,
      fill: TITLE_FILL[threshold] ?? "#fbbf24",
    }))
    .filter((t) => t.count > 0);
  if (novices > 0) census.push({ key: 0, name: "新人村", count: novices, fill: TITLE_FILL[0] ?? "#94a3b8" });

  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const active = hovered ?? pinned;

  const barRef = useRef<HTMLDivElement>(null);
  const segRefs = useRef(new Map<number, HTMLButtonElement>());
  const [tipX, setTipX] = useState(0);

  // 气泡锚在激活分段的中点，两端按半宽收进条内，窄屏也不出画
  useEffect(() => {
    if (active == null) return;
    const bar = barRef.current;
    const seg = segRefs.current.get(active);
    if (!bar || !seg) return;
    const sr = seg.getBoundingClientRect();
    const br = bar.getBoundingClientRect();
    const mid = sr.left - br.left + sr.width / 2;
    setTipX(Math.min(Math.max(mid, 84), bar.clientWidth - 84));
  }, [active]);

  if (census.length === 0) return null;
  const activeBucket = census.find((t) => t.key === active);
  const percent = (t: (typeof census)[number]) => Math.round((t.count / members.length) * 100);

  return (
    <>
      <div ref={barRef} className="relative mt-9 flex h-3 gap-0.5">
        {census.map((t) => (
          <button
            key={t.key}
            ref={(el) => {
              if (el) segRefs.current.set(t.key, el);
            }}
            type="button"
            aria-label={`${t.name} ${t.count} 人，占 ${percent(t)}%`}
            onMouseEnter={() => setHovered(t.key)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(t.key)}
            onBlur={() => setHovered(null)}
            onClick={() => setPinned((p) => (p === t.key ? null : t.key))}
            className={cn(
              "h-full min-w-1.5 cursor-pointer rounded-full transition-opacity",
              active != null && active !== t.key && "opacity-35"
            )}
            style={{ flexGrow: t.count, flexBasis: 0, background: t.fill }}
          />
        ))}
        {activeBucket && (
          <div className="pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2" style={{ left: tipX }}>
            <div className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-soft-surface px-2.5 py-1 text-xs font-semibold text-ink shadow-xl">
              <span className="size-2 rounded-full" style={{ background: activeBucket.fill }} aria-hidden="true" />
              {activeBucket.name}
              <b className="tabular-nums">{activeBucket.count} 人</b>
              <span className="font-normal text-mist tabular-nums">{percent(activeBucket)}%</span>
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {census.map((t) => (
          <button
            key={t.key}
            type="button"
            onMouseEnter={() => setHovered(t.key)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(t.key)}
            onBlur={() => setHovered(null)}
            onClick={() => setPinned((p) => (p === t.key ? null : t.key))}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
              active === t.key
                ? "border-ink/30 bg-surface text-ink"
                : "border-line bg-soft-surface text-mist hover:text-ink"
            )}
          >
            <span className="size-2 rounded-full" style={{ background: t.fill }} aria-hidden="true" />
            {t.name}
            <b className="text-ink tabular-nums">{t.count}</b>
          </button>
        ))}
      </div>
    </>
  );
}
