import type { MemberStats } from "@/stats";
import { GrowProgress, Reveal } from "@/components/motion";
import { TierBadge } from "@/components/member/TierBadge";
import { TitleBadge, titleBadgeClass } from "@/components/member/TitleBadge";
import { GrowthChart } from "@/components/member/GrowthChart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Share2 } from "lucide-react";
import { TEN_K, titleOf } from "@/milestones";
import { fmt, fmtDate, badge } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 成长档案摘要块（回顾卡的单个数据点） */
function Recap({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-soft-surface px-4 py-3">
      <div className="text-xs text-mist">{label}</div>
      <div className="mt-1 truncate text-lg font-bold">{value}</div>
    </div>
  );
}

/**
 * 称号之路四连区块：称号之路 / 成长曲线 / 成就徽章 / 成长档案。
 * 成员页中段里程碑叙事（冲刺进度 + 曲线 + 徽章墙 + 回顾摘要，摘要可分享）。
 */
export function MilestoneJourney({
  member,
  milestones,
  snapshots,
  remaining,
  etaDays,
  upcoming,
  daysJoined,
  onShare,
}: {
  member: MemberStats;
  milestones: Array<{ threshold: number; achievedAt: string }>;
  snapshots: Array<{ followers: number; recordedAt: string }>;
  remaining: number;
  etaDays: number | null;
  upcoming: number[];
  daysJoined: number;
  onShare: () => void;
}) {
  return (
    <>
      <Reveal>
        <section>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">称号之路</h2>
            {member.progressToNext >= 80 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-signal/40 bg-signal/10 px-2.5 py-0.5 text-xs font-semibold text-signal-ink shadow-[0_0_10px_rgba(255,106,0,0.2)]">
                🔥 冲线在即
              </span>
            )}
          </div>
          <Card className="card-lift relative overflow-hidden mt-6">
            {member.progressToNext >= 80 && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-signal/15 blur-2xl"
              />
            )}
            <CardContent className="p-6 sm:p-8">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <TierBadge tierKey={member.tierKey} tierName={member.tierName} />
                  <TitleBadge threshold={member.prevMilestone} />
                </div>
                <div className="text-left sm:text-right">
                  <div className="text-sm text-mist">当前粉丝</div>
                  <div className="mt-1 text-3xl font-bold tabular-nums">{fmt(member.latestFollowers ?? 0)}</div>
                </div>
              </div>
              <GrowProgress
                value={member.progressToNext}
                className="mt-6 h-2"
                ariaLabel={`距下一称号「${titleOf(member.nextMilestone)}」进度 ${member.progressToNext}%`}
              />
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-mist">{member.prevMilestone > 0 ? titleOf(member.prevMilestone) : "新人村"}</span>
                <span className={cn("font-semibold", member.nextMilestone === TEN_K ? "text-signal-ink" : "text-gold-text")}>
                  {titleOf(member.nextMilestone)}
                </span>
              </div>
              {/* 量化区：标签+数值的数据块，取代旧的一行「·」连排文案 */}
              <div className="mt-5 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-mist">还差</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">
                    {fmt(remaining)}
                    <span className="ml-1 text-sm font-semibold text-mist">粉</span>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-mist">照目前速度</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">
                    {etaDays == null ? (
                      <span className="text-mist">—</span>
                    ) : etaDays > 365 ? (
                      <>一年以上</>
                    ) : (
                      <>
                        <span className="text-base font-semibold text-mist">约 </span>
                        {fmt(etaDays)}
                        <span className="text-base font-semibold text-mist"> 天</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5">
                <span className="text-sm text-mist">接下来的称号</span>
                {upcoming.map((threshold) => (
                  <Badge key={threshold} variant="outline" className="gap-1.5 text-mist transition-colors hover:bg-wash-strong hover:text-ink select-none cursor-default">
                    {titleOf(threshold)}
                    <span className="text-xs font-normal text-mist/60 tabular-nums">{badge(threshold)}</span>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </Reveal>

      <Reveal>
        <section>
          <h2 className="text-2xl font-bold">成长曲线</h2>
          <GrowthChart snapshots={snapshots} nextMilestone={member.nextMilestone} className="mt-6" />
        </section>
      </Reveal>

      <Reveal>
        <section>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">成就徽章</h2>
            {milestones.length > 0 && <Badge variant="secondary">{milestones.length}</Badge>}
          </div>
          {milestones.length === 0 ? (
            <p className="mt-4 text-mist">还没有成就，第一枚徽章正在路上。</p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2.5">
              {[...milestones].reverse().map((m) => (
                <div
                  key={m.threshold}
                  title={`${fmtDate(m.achievedAt)} 达成 · ${badge(m.threshold)}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold",
                    titleBadgeClass(m.threshold)
                  )}
                >
                  <span aria-hidden="true">🏅</span>
                  {titleOf(m.threshold)}
                </div>
              ))}
            </div>
          )}
        </section>
      </Reveal>

      {/* 成长档案：加入天数 / 已领称号 / 当前段位 / 首次登阶——成长回顾摘要（可分享） */}
      <Reveal>
        <section className="panel-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">成长档案</h2>
            <button
              type="button"
              onClick={onShare}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-soft-surface px-3.5 text-xs font-semibold text-mist transition-colors hover:bg-wash-strong hover:text-ink"
            >
              <Share2 className="size-3.5" /> 分享成长卡
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Recap label="加入天数" value={daysJoined > 0 ? `${daysJoined} 天` : "刚加入"} />
            <Recap label="已领称号" value={`${milestones.length} 枚`} />
            <Recap label="当前段位" value={member.tierName} />
            <Recap label="首次登阶" value={milestones.length > 0 ? fmtDate(milestones[0].achievedAt) : "—"} />
          </div>
        </section>
      </Reveal>
    </>
  );
}
