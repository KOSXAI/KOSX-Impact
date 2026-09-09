import { Link } from "@tanstack/react-router";
import type { MemberStats, MemberProfile, PostItem } from "@/stats";
import type { MemberInsights } from "@/insights";
import { Avatar } from "@/components/member/Avatar";
import { BannerImage } from "@/components/member/BannerImage";
import { TierBadge } from "@/components/member/TierBadge";
import { Badge } from "@/components/ui/badge";
import { trackOf } from "@/tracks";
import { BadgeCheck, ExternalLink, MapPin, PauseCircle, Share2, type LucideIcon, Blocks, CandlestickChart, Globe, PenTool, Shapes, Sparkles } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { xProfileUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

/** 赛道图标映射（src/tracks.ts 存图标名字符串，这里映射到 lucide 组件） */
const TRACK_ICON_MAP: Record<string, LucideIcon> = {
  Sparkles,
  CandlestickChart,
  Blocks,
  PenTool,
  Globe,
  Shapes,
};

/** X 龄：账号创建距今的时长（不足一年按月） */
function xAgeText(xCreatedAt: string | null): string | null {
  if (!xCreatedAt) return null;
  const created = Date.parse(xCreatedAt);
  if (Number.isNaN(created)) return null;
  const days = Math.floor((Date.now() - created) / 86_400_000);
  if (days < 0) return null;
  if (days < 365) return `X 龄 ${Math.max(1, Math.round(days / 30.4))} 个月`;
  return `X 龄 ${Math.floor(days / 365.25)} 年`;
}

/** 主页外链的展示文案：只显示主机名（去掉 www.），长链接不撑爆 chip */
function urlHost(raw: string): string | null {
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** 横幅上的磨砂玻璃圆钮：深色半透明底 + 背景模糊，任何横幅图上都可读 */
const frostedBtn =
  "inline-flex size-9 items-center justify-center rounded-full border border-white/15 bg-black/30 text-ink shadow-lg shadow-black/20 backdrop-blur-md transition-colors hover:bg-black/45 focus-visible:bg-black/45";

/** 横幅上的分享钮：打开分享弹窗（X 分享/文案/链接/OG 卡预览复制下载） */
function ShareButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="分享"
      title="分享"
      className={frostedBtn}
    >
      <Share2 className="size-4" />
    </button>
  );
}

/** 档案卡：横幅 hero + 身份区 + 简介（全部来自 X 公开资料）+ 赛道/标签 chip 与赛道内名次 */
export function ProfileHero({
  member,
  profile,
  insights,
  neighbors,
  onShare,
}: {
  member: MemberStats;
  profile: MemberProfile;
  insights: MemberInsights<PostItem> | null;
  neighbors?: {
    trackRanks: Array<{ track: string; rank: number; total: number }>;
  };
  onShare: () => void;
}) {
  const name = member.displayName ?? member.handle;
  const age = xAgeText(profile.xCreatedAt);
  const homeHost = profile.url ? urlHost(profile.url) : null;

  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-surface">
      <div className="relative h-32 sm:h-44">
        {profile.bannerUrl ? (
          <BannerImage src={profile.bannerUrl} />
        ) : (
          <div
            aria-hidden="true"
            className="bg-gradient-to-r size-full from-signal/15 via-surface to-surface"
          />
        )}
        <div
          aria-hidden="true"
          className="from-surface via-surface/30 absolute inset-0 bg-gradient-to-t to-transparent"
        />
        {/* 分享圆钮压在横幅右上角：磨砂玻璃质感，同时填起顶部留白 */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-end p-3 sm:p-4">
          <ShareButton onClick={onShare} />
        </div>
      </div>
      <div className="px-6 pb-6 sm:px-8">
        {/* z-10：横幅容器是定位元素会盖住静态兄弟，头像压边必须抬高一层 */}
        <div className="relative z-10 -mt-12 sm:-mt-14">
          <div className="flex items-end gap-4">
            <Avatar url={member.profileImage} name={name} className="ring-surface size-20 ring-4 sm:size-24" />
            <div className="min-w-0 pb-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{name}</h1>
                {profile.verified && (
                  <BadgeCheck className="size-5 text-sky-400" aria-label="X 认证账号" />
                )}
                <TierBadge tierKey={member.tierKey} tierName={member.tierName} />
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={xProfileUrl(member.handle)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-line bg-soft-surface px-3 py-1 text-sm text-mist transition-colors hover:border-signal/40 hover:text-ink"
            >
              @{member.handle}
            </a>
            {insights?.inactive && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-soft-surface px-3 py-1 text-sm text-mist"
                title="近 14 天没有发布新内容"
              >
                <PauseCircle className="size-3.5 text-signal" aria-hidden="true" />
                已 {insights.inactiveDays} 天未更新
              </span>
            )}
            {profile.location && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-soft-surface px-3 py-1 text-sm text-mist">
                <MapPin className="size-3.5" aria-hidden="true" />
                {profile.location}
              </span>
            )}
            {age && (
              <span className="rounded-full border border-line bg-soft-surface px-3 py-1 text-sm text-mist">
                {age}
              </span>
            )}
            <span className="rounded-full border border-line bg-soft-surface px-3 py-1 text-sm text-mist">
              加入于 {fmtDate(member.joinedAt)}
            </span>
            {profile.url && homeHost && (
              <a
                href={profile.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-soft-surface px-3 py-1 text-sm text-mist transition-colors hover:border-signal/40 hover:text-ink"
              >
                <ExternalLink className="size-3.5" aria-hidden="true" />
                {homeHost}
              </a>
            )}
          </div>
        </div>
        {/* 赛道 + 标签：未打标不显示 */}
        {(member.tracks.length > 0 || member.tags.length > 0) && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {member.tracks.map((t) => {
              const track = trackOf(t);
              if (!track) return null;
              const Icon = TRACK_ICON_MAP[track.icon] ?? Shapes;
              return (
                <span
                  key={t}
                  title={track.description}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium",
                    t === "AI工具"
                      ? "border-signal/40 bg-signal/10 text-signal"
                      : "border-line bg-soft-surface text-ink"
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {t}
                </span>
              );
            })}
            {member.tags.length > 0 && (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {member.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs text-mist">
                    {tag}
                  </Badge>
                ))}
              </span>
            )}
          </div>
        )}
        {/* 赛道内名次：按粉丝量排的本赛道名次（引流 + 社会证明） */}
        {neighbors && neighbors.trackRanks.some((r) => r.total > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {neighbors.trackRanks
              .filter((r) => r.total > 0)
              .map(({ track, rank, total }) => (
                <Link
                  key={track}
                  to="/tracks"
                  className="inline-flex items-center gap-1.5 rounded-full border border-signal/30 bg-signal/8 px-3 py-1 text-xs font-semibold text-signal transition-colors hover:border-signal/50"
                  title={`${track} 赛道内第 ${rank} 名（共 ${total} 人，按粉丝量）`}
                >
                  {track} · 第 {rank} 名 / {total}
                </Link>
              ))}
          </div>
        )}
        {profile.bio && (
          <p className="text-mist mt-4 text-sm leading-relaxed whitespace-pre-line">{profile.bio}</p>
        )}
      </div>
    </section>
  );
}
