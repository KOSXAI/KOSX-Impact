/** 总排行 / 成长榜前三的荣誉样式：只保留行卡外壳（边框渐晕 + 名次渐变数字），不加榜位徽章抢内容的戏 */
export const PODIUM = [
  {
    ring: "border-gold/40 bg-gradient-to-r from-gold/15 to-transparent",
    rankNum: "from-gold-text to-gold-deep",
  },
  {
    ring: "border-slate-400/30 bg-gradient-to-r from-slate-400/12 to-transparent",
    rankNum: "from-slate-300 to-slate-500",
  },
  {
    ring: "border-orange-500/30 bg-gradient-to-r from-orange-500/12 to-transparent",
    rankNum: "from-orange-400 to-orange-700",
  },
] as const;

export type PodiumStyle = (typeof PODIUM)[number];
