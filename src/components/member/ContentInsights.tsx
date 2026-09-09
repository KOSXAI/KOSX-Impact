import type { PostItem } from "@/stats";
import { fmt } from "@/lib/format";

/** 内容密码：从帖子 + 快照挖出的三条实用洞察（全部启发式，样本不足自动隐藏） */
export function ContentInsights({
  posts,
  snapshots,
}: {
  posts: PostItem[];
  snapshots: Array<{ followers: number; recordedAt: string }>;
}) {
  // 黄金时段：按北京时间小时桶 × 平均曝光（至少 2 帖才出结论）
  const buckets = new Map<number, { v: number; c: number }>();
  for (const p of posts) {
    const h = (new Date(p.createdAt).getUTCHours() + 8) % 24;
    const b = buckets.get(h) ?? { v: 0, c: 0 };
    b.v += p.views ?? 0;
    b.c += 1;
    buckets.set(h, b);
  }
  let bestHour: number | null = null;
  let bestAvg = -1;
  for (const [h, b] of buckets) {
    if (b.c >= 2 && b.v / b.c > bestAvg) {
      bestAvg = b.v / b.c;
      bestHour = h;
    }
  }
  const hourLabel = bestHour != null ? `${String(bestHour).padStart(2, "0")}:00` : null;

  // 最有讨论度：评论数 ≥20 且显著多于点赞
  const debate = posts
    .filter((p) => (p.replies ?? 0) >= 20 && (p.replies ?? 0) > (p.likes ?? 0) * 1.5)
    .sort((a, b) => (b.replies ?? 0) - (a.replies ?? 0))
    .slice(0, 3);

  // 爆款涨粉归因：浏览量最高的帖子，发帖前后 3 天内粉丝跳涨
  const top = [...posts].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0];
  let attribution: { post: PostItem; gained: number } | null = null;
  if (top && (top.views ?? 0) >= 10_000 && snapshots.length >= 2) {
    const postDay = top.createdAt.slice(0, 10);
    const idx = snapshots.findIndex((s) => s.recordedAt.slice(0, 10) >= postDay);
    const base = idx > 0 ? snapshots[idx - 1].followers : snapshots[0].followers;
    let end = snapshots[snapshots.length - 1].followers;
    for (let i = idx; i < snapshots.length && i <= idx + 3; i++) end = snapshots[i].followers;
    const gained = end - base;
    if (gained > 0) attribution = { post: top, gained };
  }

  if (!hourLabel && debate.length === 0 && !attribution) return null;

  return (
    <section>
      <h2 className="text-2xl font-bold">内容密码</h2>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {hourLabel && (
          <div className="card-lift rounded-2xl border border-line bg-surface p-5">
            <div className="text-sm text-mist">黄金时段</div>
            <div className="mt-1.5 text-2xl font-bold tabular-nums">{hourLabel}</div>
            <div className="mt-0.5 text-xs text-mist">北京时间的帖子平均曝光最高</div>
          </div>
        )}
        {attribution && (
          <a href={attribution.post.url} target="_blank" rel="noopener noreferrer" className="card-lift block rounded-2xl border border-signal/30 bg-surface p-5 transition-colors hover:border-signal/50">
            <div className="text-sm text-mist">爆款带来</div>
            <div className="mt-1.5 text-2xl font-bold text-signal tabular-nums">+{fmt(attribution.gained)} 粉</div>
            <div className="mt-0.5 line-clamp-1 text-xs text-mist">{attribution.post.text ?? "爆款帖子"}</div>
          </a>
        )}
        {debate.length > 0 && (
          <div className="card-lift rounded-2xl border border-line bg-surface p-5">
            <div className="text-sm text-mist">最有讨论度</div>
            <div className="mt-1.5 space-y-1">
              {debate.map((p) => (
                <a key={p.tweetId} href={p.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm hover:text-ink">
                  <span className="line-clamp-1 min-w-0 flex-1 text-mist">{p.text ?? "帖子"}</span>
                  <b className="shrink-0 tabular-nums">{p.replies ?? 0} 评</b>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
