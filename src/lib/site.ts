// 站点级常量：品牌名、站点 URL（多页面共用，避免 URL 漂移）
export const SITE_NAME = "KOSX 万粉影响力计划";
export const SITE_URL = "https://impact.kosx.ai";
export const SLOGAN = "看见每个人的成长，也看见整个社群正在产生多大的影响。";

/** 成员 X 主页（看板头像/账号链接跳转用） */
export function xProfileUrl(handle: string): string {
  return `https://x.com/${handle}`;
}
