/**
 * OG 卡光栅化与取数路由：SVG 模板（og.ts）→ @resvg/resvg-wasm → PNG。
 * wasm / 子集字体（public/fonts，Noto Sans SC，OFL）/ logo 白字标都是
 * isolate 级一次性加载（模块级 memo），缓存命中后零 D1、零重复初始化。
 * 缓存键带 cache_bust：数据一写库，下一次分享预览立即是新数据。
 */
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import wasmModule from "@resvg/resvg-wasm/index_bg.wasm?module";
import { memberOgSvg, siteOgSvg } from "./og";
import type { OgLogo, SiteOgStats } from "./og";
import { getDashboardStats, getMemberDetail } from "./queries";
import { CACHE_KEYS, cachedResponse, readCacheBust } from "./cache";
import { SITE_URL } from "./lib/site";

// ASSETS 绑定按站点自身 origin 取内部资产（dev 为 localhost，生产为 SITE_URL 的 host）
const FONT_PATHS = ["/fonts/og-noto-sc-400.ttf", "/fonts/og-noto-sc-700.ttf"] as const;

let wasmReady: Promise<void> | null = null;
let fontsPromise: Promise<Uint8Array[]> | null = null;
let logoPromise: Promise<OgLogo | null> | null = null;

function fetchAsset(env: Env, path: string, origin: string): Promise<Response> {
  return env.ASSETS.fetch(new URL(path, origin));
}

function loadFonts(env: Env, origin: string): Promise<Uint8Array[]> {
  return (fontsPromise ??= Promise.all(
    FONT_PATHS.map(async (path) => {
      const res = await fetchAsset(env, path, origin);
      if (!res.ok) throw new Error(`OG 字体缺失：${path}（res ${res.status}）`);
      return new Uint8Array(await res.arrayBuffer());
    })
  ));
}

function pngAspect(buf: ArrayBuffer): number {
  const b = new Uint8Array(buf);
  const be32 = (o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  // PNG：8 字节签名 + IHDR 长度/类型 8 字节，宽高在偏移 16/20
  const w = be32(16);
  const h = be32(20);
  return w > 0 && h > 0 ? w / h : 6; // 兜底按字标比例
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

async function loadLogo(env: Env, origin: string): Promise<OgLogo | null> {
  const res = await fetchAsset(env, "/kosx-logo-white.png", origin);
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  return { href: `data:image/png;base64,${toBase64(buf)}`, aspect: pngAspect(buf) };
}

function loadLogoMemo(env: Env, origin: string): Promise<OgLogo | null> {
  return (logoPromise ??= loadLogo(env, origin));
}

/** SVG → PNG。仅用自带子集字体（Workers 无系统字体，同时保证各端渲染一致） */
export async function renderOgPng(env: Env, svg: string, origin: string): Promise<Uint8Array<ArrayBuffer>> {
  wasmReady ??= initWasm(wasmModule).catch((err: unknown) => {
    // dev HMR 会重载业务模块但缓存 node_modules：胶水的 initialized 标志仍在，视为就绪
    if (String((err as Error | undefined)?.message ?? err).includes("Already initialized")) {
      wasmReady = Promise.resolve();
      return;
    }
    wasmReady = null; // 真实初始化失败：下次请求重试
    throw err;
  });
  await wasmReady;
  const fontBuffers = await loadFonts(env, origin);
  const resvg = new Resvg(svg, {
    font: { fontBuffers, defaultFontFamily: "Noto Sans SC" },
  });
  const png = resvg.render().asPng();
  resvg.free();
  // asPng 的 Uint8Array 与 BodyInit 的 TS 视图不兼容，拷贝为标准 ArrayBuffer 视图
  return new Uint8Array(png);
}

export function ogNotFound(): Response {
  return new Response("member not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}

/** 成员 OG 卡（/og/members/:id.png）：与成员页 SSR 共用 getMemberDetail 的缓存 */
export async function renderMemberOgPng(env: Env, id: string, origin: string): Promise<Response> {
  const bust = await readCacheBust(env);
  return cachedResponse(new Request(`${SITE_URL}${CACHE_KEYS.ogMember(id)}&cb=${bust}`), 21600, async () => {
    const detail = await getMemberDetail(env, id);
    if (!detail) return ogNotFound();
    const logo = await loadLogoMemo(env, origin);
    const svg = memberOgSvg(detail.member, { climbs: detail.milestones.length, logo });
    return new Response(await renderOgPng(env, svg, origin), { headers: { "Content-Type": "image/png" } });
  }, { browserTtl: 21600 });
}

/** 站点 OG 卡（/og/site.png）：与首页 SSR 共用 getDashboardStats 的缓存 */
export async function renderSiteOgPng(env: Env, origin: string): Promise<Response> {
  const bust = await readCacheBust(env);
  return cachedResponse(new Request(`${SITE_URL}${CACHE_KEYS.ogSite}&cb=${bust}`), 21600, async () => {
    const stats = await getDashboardStats(env);
    const pick: SiteOgStats = {
      totalFollowers: stats.totalFollowers,
      memberCount: stats.members.length,
      tenKMembers: stats.tenKMembers,
      growth30d: stats.totalGrowth30d,
    };
    const logo = await loadLogoMemo(env, origin);
    return new Response(await renderOgPng(env, siteOgSvg(pick, logo), origin), {
      headers: { "Content-Type": "image/png" },
    });
  }, { browserTtl: 21600 });
}
