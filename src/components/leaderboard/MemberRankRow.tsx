import type { ReactNode } from "react";
import { Avatar } from "@/components/member/Avatar";
import { cn } from "@/lib/utils";
import { type PodiumStyle } from "./podium";

/**
 * 成员行卡外壳：名次数字 + 头像 + 主内容 + 右侧数据的统一骨架。
 * 全站七处榜单行的复制收敛于此：前三名套荣誉渐晕（card-lift + 渐变边框），
 * 其余行可选「裸排」或「带边框底色」（赛道类列表用后者）。
 */
export function MemberRankRow({
  rank,
  podium,
  profileImage,
  name,
  middle,
  trailing,
  bordered = false,
}: {
  rank: number;
  podium?: PodiumStyle;
  profileImage: string | null;
  name: string;
  middle: ReactNode;
  trailing: ReactNode;
  bordered?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-3 p-4 sm:gap-x-4 sm:p-5",
        podium ? `card-lift rounded-2xl border ${podium.ring}` : bordered && "rounded-2xl border border-line bg-soft-surface"
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
