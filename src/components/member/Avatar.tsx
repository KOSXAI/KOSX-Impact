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
  return url.replace(/_(?:normal|bigger|mini|\d+x\d+)(\.(?:jpe?g|png|webp|gif))$/i, `_${px}x${px}$1`);
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
  // 0=高清变体 1=API 原图 2=占位；原样 URL（无 _normal 后缀可换）跳过重试档
  const [stage, setStage] = useState(hd && hd !== url ? 0 : 1);
  const initial = (name.trim()[0] ?? "?").toUpperCase();

  if (!url || stage >= 2) {
    return (
      <div
        className={cn(
          "bg-soft-surface flex size-10 shrink-0 items-center justify-center rounded-full font-semibold text-mist",
          className
        )}
        aria-hidden
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={stage === 0 && hd ? hd : url}
      alt={`${name} 的头像`}
      // 与请求尺寸一致的固有宽高（预留比例、防 CLS）；实际显示尺寸由 CSS 类覆盖
      width={px}
      height={px}
      loading="lazy"
      decoding="async"
      onError={() => setStage((s) => s + 1)}
      className={cn(
        "bg-soft-surface size-10 shrink-0 rounded-full object-cover",
        className
      )}
    />
  );
}
