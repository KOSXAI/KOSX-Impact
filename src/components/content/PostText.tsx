import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { parsePostContent } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 折叠态最大行数：短帖全显示，长帖先露这么多行再「展开全文」 */
const COLLAPSED_CLAMP = "line-clamp-10";

/**
 * 帖子正文展示：默认直出全文并保留原有分段（whitespace-pre-line），
 * 抽出 t.co 外链改渲染成「查看链接」chip（正文里留裸链接是噪声）。
 * 长帖默认折叠到 10 行——按渲染后的实际溢出决定是否给展开开关，
 * 不用字数猜（同样字数换行多寡差十几倍行高）。
 */
export function PostText({ text, className }: { text: string | null | undefined; className?: string }) {
  const { text: body, links } = parsePostContent(text);
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el) setOverflow(el.scrollHeight > el.clientHeight + 1);
  }, [body]);

  if (!body && links.length === 0) {
    return <p className={cn("text-sm text-mist", className)}>分享了一条链接</p>;
  }

  return (
    <div className={className}>
      {body && (
        <p ref={ref} className={cn("text-sm leading-relaxed break-words whitespace-pre-line", !expanded && COLLAPSED_CLAMP)}>
          {body}
        </p>
      )}
      {overflow && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-semibold text-signal-ink underline-offset-4 hover:underline"
        >
          {expanded ? "收起" : "展开全文"}
        </button>
      )}
      {links.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {links.map((href) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-soft-surface px-2.5 py-1 text-xs text-mist transition-colors hover:bg-wash-strong hover:text-signal-ink"
            >
              <ExternalLink className="size-3" aria-hidden="true" />
              查看链接
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
