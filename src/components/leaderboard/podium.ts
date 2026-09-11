/** 总排行 / 成长榜前三的荣誉样式：只保留行卡外壳（边框渐晕 + 名次渐变数字），不加榜位徽章抢内容的戏 */
export const PODIUM = [
  {
    ring: "bg-gradient-to-r from-gold/20 to-transparent",
    rankNum: "from-gold-text to-gold-deep",
  },
  {
    ring: "bg-gradient-to-r from-slate-400/14 to-transparent",
    rankNum: "from-slate-300 to-slate-500",
  },
  {
    ring: "bg-gradient-to-r from-orange-500/14 to-transparent",
    rankNum: "from-orange-400 to-orange-700",
  },
] as const;

export type PodiumStyle = (typeof PODIUM)[number];
