import { Blocks, CandlestickChart, Globe, PenTool, Shapes, Sparkles, type LucideIcon } from "lucide-react";
import { trackOf } from "@/tracks";
import { cn } from "@/lib/utils";

/** 赛道图标映射（src/tracks.ts 存图标名字符串，组件侧映射到 lucide 组件）——全站唯一出处 */
export const TRACK_ICONS: Record<string, LucideIcon> = {
  Sparkles,
  CandlestickChart,
  Blocks,
  PenTool,
  Globe,
  Shapes,
};

/** 赛道小 chip：图标 + 赛道名（行卡 middle 区用） */
export function TrackChip({ name, className }: { name: string; className?: string }) {
  const track = trackOf(name);
  if (!track) return null;
  const Icon = TRACK_ICONS[track.icon] ?? Shapes;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-line bg-soft-surface px-2 py-0.5 text-xs font-semibold text-mist",
        name === "综合" && "border-dashed",
        className
      )}
      title={track.description}
    >
      <Icon className="size-3" aria-hidden="true" />
      {track.name}
    </span>
  );
}
