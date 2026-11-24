import { useState } from "react";
import { cn } from "@/lib/utils";

/** 头像请求档位：sm=200px（≤100px 的列表/卡片头像，2x 屏够清晰）；lg=400px（档案页大头像） */
const AVATAR_PX = { sm: 200, lg: 400 } as const;

/**
 * X 头像清晰度升级：API 给的 profile_image_url_https 默认是 _normal 变体（48px），
 * 页面显示普遍 80px+（retina 还要 ×2），直接引用必糊；pbs.twimg.com 支持换后缀取
 * _200x200 / _400x400 变体。替换幂等（已是目标尺寸则原样返回），高清版 404 时逐级回退。
 */
function hdVariant(url: string, px: number): string {
  return url.replace(
    /_(?:normal|bigger|mini|\d+x\d+)(\.(?:jpe?g|png|webp|gif))$/i,
    `_${px}x${px}$1`,
  );
}

/** X 头像直链走同源白名单代理：解决国内未开代理访问时 pbs.twimg.com 不可达导致全员首字母占位的问题 */
const TWITTER_AVATAR_RE = /^https:\/\/pbs\.twimg\.com\/profile_images\//;
function avatarSrc(url: string): string {
  return TWITTER_AVATAR_RE.test(url) ? `/api/avatar?u=${encodeURIComponent(url)}` : url;
}

/**
 * 成员头像：按 size 档尝试对应尺寸变体（默认 sm=200px，列表行不浪费流量），
 * 失败退 API 原图，再失败回退首字母占位。
 */
export function Avatar({
  url,
  name,
  className,
  size = "sm",
}: {
  url: string | null | undefined;
  name: string;
  className?: string;
  /** 请求清晰度档位：sm=200px（默认）/ lg=400px；显示尺寸仍由 className 控制 */
  size?: "sm" | "lg";
}) {
  const px = AVATAR_PX[size];
  const hd = url ? hdVariant(url, px) : null;
  const initStage = hd && hd !== url ? 0 : 1;
  const sourceKey = `${url ?? ""}|${px}`;
  // 0=高清变体 1=API 原图 2=占位；当 url 或 size 变化时重置降级态，避免组件复用（如对比页换人）粘滞旧的 404 状态
  const [state, setState] = useState({ key: sourceKey, stage: initStage });
  const stage = state.key === sourceKey ? state.stage : initStage;
  const initial = (name.trim()[0] ?? "?").toUpperCase();

  if (!url || stage >= 2) {
    return (
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full bg-soft-surface font-semibold text-mist",
          className,
        )}
        aria-hidden
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={avatarSrc(stage === 0 && hd ? hd : url)}
      alt={`${name} 的头像`}
      // 与请求尺寸一致的固有宽高（预留比例、防 CLS）；实际显示尺寸由 CSS 类覆盖
      width={px}
      height={px}
      loading="lazy"
      decoding="async"
      onError={() =>
        setState((prev) => ({
          key: sourceKey,
          stage: (prev.key === sourceKey ? prev.stage : initStage) + 1,
        }))
      }
      className={cn("size-10 shrink-0 rounded-full bg-soft-surface object-cover", className)}
    />
  );
}
