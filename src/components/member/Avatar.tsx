import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * 成员头像：X 公开头像（pbs.twimg.com）直接引用；
 * 无头像或加载失败时回退为首字母占位（首帧不闪）。
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
  const [failed, setFailed] = useState(false);
  const initial = (name.trim()[0] ?? "?").toUpperCase();

  if (!url || failed) {
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
      src={url}
      alt={`${name} 的头像`}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn(
        "border-line bg-soft-surface size-10 shrink-0 rounded-full border object-cover",
        className
      )}
    />
  );
}
