import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * X 头像清晰度升级：API 给的 profile_image_url_https 默认是 _normal 变体（48px），
 * 页面显示普遍 80px+（retina 还要 ×2），直接引用必糊；pbs.twimg.com 支持换后缀取
 * _400x400 高清变体。替换幂等（已是 400x400 则原样返回），高清版 404 时逐级回退。
 */
function hdVariant(url: string): string {
  return url.replace(/_(?:normal|bigger|mini|\d+x\d+)(\.(?:jpe?g|png|webp|gif))$/i, "_400x400$1");
}

/**
 * 成员头像：默认尝试 400px 高清变体，失败退 API 原图，再失败回退首字母占位。
 */
export function Avatar({
  url,
  name,
  className,
}: {
  url: string | null | undefined;
  name: string;
  className?: string;
}) {
  const hd = url ? hdVariant(url) : null;
  // 0=高清变体 1=API 原图 2=占位；原样 URL（无 _normal 后缀可换）跳过重试档
  const [stage, setStage] = useState(hd && hd !== url ? 0 : 1);
  const initial = (name.trim()[0] ?? "?").toUpperCase();

  if (!url || stage >= 2) {
    return (
      <div
        className={cn(
          "bg-soft-surface border-line flex size-10 shrink-0 items-center justify-center rounded-full border font-semibold text-mist",
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
      loading="lazy"
      decoding="async"
      onError={() => setStage((s) => s + 1)}
      className={cn(
        "border-line bg-soft-surface size-10 shrink-0 rounded-full border object-cover",
        className
      )}
    />
  );
}
