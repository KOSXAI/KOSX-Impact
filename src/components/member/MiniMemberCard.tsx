import { Link } from "@tanstack/react-router";
import type { MemberStats } from "@/stats";
import { Avatar } from "@/components/member/Avatar";
import { BannerImage } from "@/components/member/BannerImage";
import { BadgeCheck } from "lucide-react";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MetricValue } from "@/components/library/presets";

/**
 * 迷你名片：横幅 + 头像 + 昵称 + @handle + 主指标 + 赛道/标签 + Bio。
 * 库的「双列/卡片」布局复用；主指标跟随当前视图口径（排什么亮什么），缺省展示粉丝量；
 * rank 传入时左上角显示名次角标（画册式的「榜」感）。
 */
export function MiniMemberCard({
  m,
  metric,
  rank,
}: {
  m: MemberStats;
  /** 当前视图口径的主指标；缺省 = 粉丝量 */
  metric?: MetricValue | null;
  rank?: number;
}) {
  const name = m.displayName ?? m.handle;
  const shown = metric ?? { value: fmt(m.latestFollowers ?? 0), label: "粉丝" };
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--card-inset)] transition-all duration-300 hover:-translate-y-0.5 hover:border-signal/40 hover:shadow-[var(--hover-lift)]">
      {rank != null && (
        <span
          aria-hidden="true"
          className="absolute left-2.5 top-2.5 z-20 inline-flex size-6 select-none items-center justify-center rounded-full border border-edge bg-glass text-[11px] font-bold tabular-nums text-ink backdrop-blur-sm"
        >
          {rank}
        </span>
      )}
      <Link
        to="/members/$id"
        params={{ id: m.id }}
        className="flex h-full flex-col"
      >
        <div className="relative h-16 sm:h-20">
          {m.bannerUrl ? (
            <BannerImage src={m.bannerUrl} />
          ) : (
            <div aria-hidden="true" className="bg-gradient-to-r size-full from-signal/15 via-surface to-surface" />
          )}
          <div aria-hidden="true" className="from-surface via-surface/30 absolute inset-0 bg-gradient-to-t to-transparent" />
        </div>
        <div className="relative z-10 flex flex-1 flex-col px-4 pb-4">
          {/* z-10：横幅容器是定位元素会盖住静态兄弟，头像压边必须抬高一层 */}
          <div className="-mt-6">
            <Avatar url={m.profileImage} name={name} className="ring-surface size-12 ring-4" />
          </div>
          <div className="mt-2 flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold leading-tight">{name}</span>
            {m.verified && <BadgeCheck className="size-4 shrink-0 text-sky-600 dark:text-sky-400" aria-label="X 认证账号" />}
          </div>
          <div className="mt-0.5 truncate text-xs text-mist">@{m.handle}</div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className={cn("text-xl font-bold tabular-nums", shown.tone === "signal" && "text-signal-ink")}>{shown.value}</span>
            <span className="text-xs text-mist">{shown.label}</span>
          </div>
          {m.tracks.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {m.tracks.slice(0, 2).map((t) => (
                <span
                  key={t}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs font-medium",
                    t === "AI工具" ? "border-signal/40 bg-signal/10 text-signal-ink" : "border-line bg-soft-surface text-ink"
                  )}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          {m.tags.length > 0 && (
            <div className="mt-1.5 truncate text-xs text-mist">
              {m.tags.slice(0, 3).map((t) => `#${t}`).join("  ")}
            </div>
          )}
          {m.bio && <p className="text-mist mt-2 line-clamp-2 text-xs leading-relaxed">{m.bio}</p>}
        </div>
      </Link>
    </div>
  );
}
