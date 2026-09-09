/**
 * 影响力指数：「有效粉丝量」量化（公示权重，关于页公开公式与口径）。
 *
 * 综合分 0-1000 = 规模（0-400）+ 增长（0-200）+ 互动（0-250）+ 产能（0-150）。
 * 另输出质量系数 qualityMultiplier（认证/列表收录/互动率加成，1.0-1.4，
 * 匿名因子不直接暴露细表，防止刷分降权）与 effectiveFollowers = 粉丝量 × 质量系数。
 *
 * 口径边界（与看板其他口径一致）：
 * - 增长：近 30 天粉丝增长（滚动窗口，与加入时间无关）
 * - 互动：近 30 天帖子的互动率中位数（(赞+评+转+引)/浏览；浏览缺失的帖子不参与）
 * - 产能：近 30 天发帖数
 */

import { engagementRate, type PostMetric } from "./insights";

export interface InfluenceInput {
  followers: number;
  growth30d: number;
  verified: boolean;
  listedCount: number | null;
  /** 近 30 天帖子（互动字段可空；空数组 = 尚无帖子数据） */
  posts30d: PostMetric[];
}

export interface Influence {
  /** 综合影响力指数（0-1000） */
  score: number;
  /** 质量系数（1.0-1.4）：粉丝质量的折价/溢价 */
  qualityMultiplier: number;
  /** 有效粉丝量 = 粉丝量 × 质量系数 */
  effectiveFollowers: number;
  breakdown: {
    scale: number;
    growth: number;
    engagement: number;
    output: number;
  };
  /** 互动率中位数（0-1；无有效帖子数据为 null） */
  engagementMedian: number | null;
  /** 是否有近 30 天帖子数据（false 时互动/产能项记 0，UI 提示数据不足） */
  hasPostData: boolean;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computeInfluence(input: InfluenceInput): Influence {
  const { followers, growth30d, verified, listedCount, posts30d } = input;

  // 规模：粉丝量对数映射（千万粉封顶 400）
  const scale = Math.min(400, (Math.log10(Math.max(followers, 1)) / 7) * 400);

  // 增长：近 30 天相对增长率（分母下限 1000 防小号暴涨噪音），≥30% 满分
  const growthRatio = growth30d / Math.max(followers, 1000);
  const growth = Math.min(200, (growthRatio / 0.3) * 200);

  // 互动：互动率中位数（浏览缺失的帖子不参与），≥10% 满分
  const rates = posts30d.map(engagementRate).filter((r): r is number => r !== null);
  const engagementMedian = median(rates);
  const engagement = engagementMedian === null
    ? 0
    : Math.min(250, (engagementMedian / 0.1) * 250);

  // 产能：近 30 天发帖数，≥30 帖满分
  const output = Math.min(150, (posts30d.length / 30) * 150);

  // 质量系数：认证 +0.15，列表收录达一定规模 +0.15/0.05，互动率≥3% +0.10。
  // 三项全加 = 1.40 恰好触顶——公示口径是 1.0–1.4（关于页），上限必须真实可达
  let qualityMultiplier = 1.0;
  if (verified) qualityMultiplier += 0.15;
  if (typeof listedCount === "number") {
    if (listedCount >= 100) qualityMultiplier += 0.15;
    else if (listedCount >= 20) qualityMultiplier += 0.05;
  }
  if (engagementMedian !== null && engagementMedian >= 0.03) qualityMultiplier += 0.1;
  qualityMultiplier = Math.min(1.4, qualityMultiplier);

  return {
    score: Math.round(scale + growth + engagement + output),
    qualityMultiplier: Math.round(qualityMultiplier * 100) / 100,
    effectiveFollowers: Math.round(followers * qualityMultiplier),
    breakdown: {
      scale: Math.round(scale),
      growth: Math.round(growth),
      engagement: Math.round(engagement),
      output: Math.round(output),
    },
    engagementMedian,
    hasPostData: posts30d.length > 0,
  };
}