/** 总排行 / 成长榜前三的荣誉样式：只保留行卡外壳（边框渐晕 + 名次渐变数字），不加榜位徽章抢内容的戏 */
export const PODIUM = [
  {
    ring: "bg-gradient-to-r from-gold/20 to-transparent",
    rankNum: "from-gold-text to-gold-deep",
  },
  {
    ring: "bg-gradient-to-r from-silver/14 to-transparent",
    rankNum: "from-silver to-silver-deep",
  },
  {
    ring: "bg-gradient-to-r from-bronze/14 to-transparent",
    rankNum: "from-bronze to-bronze-deep",
  },
] as const;

export type PodiumStyle = (typeof PODIUM)[number];
