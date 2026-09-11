import type { ReactNode } from "react";
import { Avatar } from "@/components/member/Avatar";
import { cn } from "@/lib/utils";
import { type PodiumStyle } from "./podium";

/**
 * 成员行卡外壳：名次数字 + 头像 + 主内容 + 右侧数据的统一骨架。
 * 全站榜单行唯一外壳：一律 panel-card（面板底 + 统一轮廓/投影），不再有「裸排」透明行；
 * 前三名在此基础上叠荣誉渐晕（card-lift + 渐变边框）。
 */
export function MemberRankRow({
  rank,
  podium,
  profileImage,
  name,
  middle,
  trailing,
}: {
  rank: number;
  podium?: PodiumStyle;
  profileImage: string | null;
  name: string;
  middle: ReactNode;
  trailing: ReactNode;
}) {
  return (
    <div
      className={cn(
        "panel-card flex flex-wrap items-center gap-x-3 gap-y-3 p-4 sm:gap-x-4 sm:p-5",
        podium && `card-lift ${podium.ring}`
      )}
    >
      <div
        className={cn(
          "w-6 shrink-0 tabular-nums",
          podium ? `bg-gradient-to-br bg-clip-text font-extrabold text-transparent ${podium.rankNum}` : "text-mist"
        )}
      >
        {rank}
      </div>
      <Avatar url={profileImage} name={name} className="size-10 shrink-0" />
      <div className="min-w-0 flex-1">{middle}</div>
      {trailing}
    </div>
  );
}
