import type { SimilarAccount } from "@/stats";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";

/** 相似账号卡：内容/人群/风格实质相似的同类账号，外链 X */
export function SimilarAccountsCard({ accounts }: { accounts: SimilarAccount[] }) {
  if (accounts.length === 0) return null;
  return (
    <Card>
      <CardContent className="p-6 sm:p-8">
        <h2 className="text-xl font-bold">相似账号</h2>
        <p className="mt-1 text-sm text-mist">根据内容与定位推荐的同类账号</p>
        <ul className="mt-5 space-y-2.5">
          {accounts.map((a) => (
            <li key={a.handle} className="rounded-2xl bg-soft-surface px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <a
                  href={`https://x.com/${encodeURIComponent(a.handle)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-semibold underline-offset-4 hover:underline"
                >
                  {a.name ?? `@${a.handle}`}
                  <ExternalLink className="size-3 text-mist" aria-hidden="true" />
                </a>
                <span className="text-xs text-mist">@{a.handle}</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-mist">{a.reason}</p>
              {a.difference && (
                <p className="mt-1 text-xs text-mist/70">差异：{a.difference}</p>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}