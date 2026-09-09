import type { FanProfile } from "@/stats";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink, Users } from "lucide-react";
import { fmt } from "@/lib/format";

/**
 * 粉丝圈画像卡：SocialData 粉丝样本聚合（约 200 人/账号，月度刷新）。
 * 粉丝不是冷冰冰的数字——KOL 浓度、认证率、活跃度是质量证据。
 */
export function FanProfileCard({ fanProfile }: { fanProfile: FanProfile | null }) {
  if (!fanProfile) return null;
  const stats: Array<{ label: string; value: string }> = [
    { label: "样本均粉", value: fmt(fanProfile.avgFollowers) },
    { label: "千粉以上", value: `${Math.round(fanProfile.pctFollowers1k)}%` },
    { label: "万粉 KOL", value: `${Math.round(fanProfile.pctFollowers10k)}%` },
    { label: "认证账号", value: `${Math.round(fanProfile.verifiedPct)}%` },
    { label: "平均发帖", value: fmt(fanProfile.avgTweets) },
    { label: "平均年龄", value: `${Math.round(fanProfile.avgAgeDays / 365.25)} 年` },
  ];
  return (
    <Card>
      <CardContent className="p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold">粉丝画像</h2>
          <span className="text-xs text-mist tabular-nums">样本 {fanProfile.sampleSize} 人</span>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-x-6 gap-y-5 sm:grid-cols-6">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-sm text-mist">{s.label}</div>
              <div className="mt-1 text-xl font-bold tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>
        {fanProfile.topHandles.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <div className="text-sm text-mist">
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5" aria-hidden="true" />
                粉丝里的 KOL
              </span>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {fanProfile.topHandles.slice(0, 6).map((t) => (
                <a
                  key={t.handle}
                  href={`https://x.com/${encodeURIComponent(t.handle)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-soft-surface px-3 py-1 text-sm text-mist transition-colors hover:border-signal/40 hover:text-ink"
                  title={`${t.name ?? t.handle} · ${fmt(t.followers)} 粉丝`}
                >
                  @{t.handle}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}