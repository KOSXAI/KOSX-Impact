import { useState } from "react";
import type { MentionItem } from "@/stats";
import { ExternalLink, Quote } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 情绪点颜色：正面绿 / 负面红 / 中性灰 */
const SENTIMENT_DOT: Record<string, string> = {
  positive: "bg-emerald-500",
  negative: "bg-rose-500",
  neutral: "bg-slate-400",
};

/**
 * 看板「品牌声量」：定时搜索 X 上关于 KOSX 的站外提及（最近 20 条）。
 * 品牌活跃度的直接证据；空数据隐藏整个区块。默认只展开前 3 条，其余折叠防列表刷屏。
 */
export function MentionsSection({ mentions }: { mentions: MentionItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? mentions : mentions.slice(0, 3);
  if (mentions.length === 0) return null;
  return (
    <div className="mt-6 border-t border-line pt-6">
      <h3 className="text-sm font-semibold text-mist">最近站外提及</h3>
      <ol className="mt-3 space-y-2">
        {visible.map((m, i) => (
          <li
            key={`${m.keyword}-${m.url ?? m.collectedAt}-${i}`}
            className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-2xl border border-line bg-soft-surface px-4 py-3"
          >
            <Quote className="mt-0.5 size-3.5 shrink-0 text-mist" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-sm font-semibold">{m.authorName ?? `@${m.authorHandle}`}</span>
                <span className="text-xs text-mist">@{m.authorHandle}</span>
                <span
                  className={cn("size-1.5 rounded-full", SENTIMENT_DOT[m.sentiment ?? "neutral"] ?? SENTIMENT_DOT.neutral)}
                  title={`情绪：${m.sentiment ?? "neutral"}`}
                  aria-hidden="true"
                />
                <span className="text-xs text-mist tabular-nums">{fmtDate(m.collectedAt)}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-mist">{m.text}</p>
            </div>
            {m.url && (
              <a
                href={m.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="查看原文"
                className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-line text-mist transition-colors hover:border-signal/40 hover:text-signal"
              >
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </li>
        ))}
        </ol>
        {mentions.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="mt-3 w-full cursor-pointer rounded-full border border-line bg-soft-surface px-4 py-2 text-xs font-semibold text-mist transition-colors hover:border-white/20 hover:text-ink"
          >
            {expanded ? "收起" : `展开全部 ${mentions.length} 条`}
          </button>
        )}
      </div>
    );
}