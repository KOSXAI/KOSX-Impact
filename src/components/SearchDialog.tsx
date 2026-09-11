import { useEffect, useDeferredValue, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { roster } from "@/roster";
import { TRACKS } from "@/tracks";
import { Search, Users, Shapes, CornerDownLeft, ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SearchItem =
  | { type: "member"; id: string; title: string; subtitle: string }
  | { type: "track"; id: string; title: string; subtitle: string };

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // 打开时重置输入与选中
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // 聚合搜索结果（使用 deferredQuery 保证高频打字 120fps）
  const results = useMemo<SearchItem[]>(() => {
    const q = deferredQuery.trim().toLowerCase();
    const list: SearchItem[] = [];

    // 赛道项
    for (const t of TRACKS) {
      if (!q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)) {
        list.push({ type: "track", id: t.slug, title: t.name, subtitle: t.description });
      }
    }

    // 成员项
    for (const m of roster.members) {
      const name = m.displayName ?? m.handle;
      if (!q || name.toLowerCase().includes(q) || m.handle.toLowerCase().includes(q)) {
        list.push({ type: "member", id: m.id, title: name, subtitle: `@${m.handle}` });
      }
    }

    return list;
  }, [deferredQuery]);

  // 保证高亮索引在范围内
  useEffect(() => {
    setSelectedIndex(0);
  }, [deferredQuery]);

  const selectItem = (item: SearchItem) => {
    onOpenChange(false);
    if (item.type === "member") navigate({ to: "/members/$id", params: { id: item.id } });
    else navigate({ to: "/tracks/$slug", params: { slug: item.id } });
  };

  // 键盘导航
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = results[selectedIndex];
      if (current) selectItem(current);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden border-edge bg-surface/98 shadow-[var(--shadow-pop-xl)] backdrop-blur-xl">
        <DialogTitle className="sr-only">搜索成员与赛道</DialogTitle>

        {/* 顶部搜索输入 */}
        <div className="flex items-center gap-3 border-b border-line/80 px-4 py-3.5">
          <Search className="size-5 shrink-0 text-mist" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索成员昵称、@handle 或赛道..."
            className="flex-1 bg-transparent text-base text-ink placeholder:text-mist/60 outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center rounded border border-line bg-soft-surface px-1.5 py-0.5 text-[10px] font-medium text-mist">
            ESC
          </kbd>
        </div>

        {/* 结果列表 */}
        <div className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="py-10 text-center text-sm text-mist">
              没有找到匹配的成员或赛道
            </div>
          ) : (
            <div className="space-y-1">
              {results.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const isMember = item.type === "member";
                return (
                  <button
                    key={`${item.type}-${item.id}`}
                    type="button"
                    onClick={() => selectItem(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors cursor-pointer select-none",
                      isSelected ? "bg-wash-strong text-ink" : "text-mist hover:bg-wash hover:text-ink"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                        isMember 
                          ? "border-line bg-soft-surface text-mist" 
                          : "border-signal/30 bg-signal/10 text-signal-ink"
                      )}>
                        {isMember ? <Users className="size-4" /> : <Shapes className="size-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold text-sm text-ink">{item.title}</span>
                          <span className="text-xs text-mist/70 truncate">{item.subtitle}</span>
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <CornerDownLeft className="size-4 shrink-0 text-mist ml-2" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部极客提示栏 */}
        <div className="flex items-center justify-between border-t border-line/60 bg-paper/60 px-4 py-2 text-[11px] text-mist/70">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-line bg-soft-surface px-1 py-0.2 font-mono">
                <ArrowUp className="inline size-2.5" />
              </kbd>
              <kbd className="rounded border border-line bg-soft-surface px-1 py-0.2 font-mono">
                <ArrowDown className="inline size-2.5" />
              </kbd>
              切换
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-line bg-soft-surface px-1 py-0.2 font-mono">↵</kbd>
              直达
            </span>
          </div>
          <span>{results.length} 项结果</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
