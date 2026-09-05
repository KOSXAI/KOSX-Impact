import { Badge } from "@/components/ui/badge";
import { TEN_K, titleOf } from "@/milestones";
import { cn } from "@/lib/utils";

/** 称号徽章配色：金色荣誉系；万粉「万人迷」用信号橙突出（与计划同名的大关） */
export function titleBadgeClass(threshold: number): string {
  return threshold === TEN_K
    ? "border-signal/40 bg-signal/10 text-signal"
    : "border-amber-300/40 bg-amber-300/10 text-amber-300";
}

/** 称号徽章：已达成的大关称号（新人村成员 threshold=0 时不显示） */
export function TitleBadge({
  threshold,
  className,
}: {
  threshold: number;
  className?: string;
}) {
  if (threshold <= 0) return null;
  return (
    <Badge variant="outline" className={cn("border", titleBadgeClass(threshold), className)}>
      {titleOf(threshold)}
    </Badge>
  );
}
