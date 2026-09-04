import { Badge } from "@/components/ui/badge";
import { TIER_STYLE } from "@/milestones";
import { cn } from "@/lib/utils";

/** 段位徽章：量级身份（新芽 → 千粉新秀 → 万粉达人 → …），只升不降 */
export function TierBadge({
  tierKey,
  tierName,
  className,
}: {
  tierKey: string;
  tierName: string;
  className?: string;
}) {
  const style = TIER_STYLE[tierKey] ?? TIER_STYLE.seed;
  return (
    <Badge variant="outline" className={cn("border", style.badge, className)}>
      {tierName}
    </Badge>
  );
}
