import { useState } from "react";

/**
 * 档案横幅：X 横幅可能随时被成员删掉（URL 失效），加载失败回退渐变底。
 * priority=true 用于首屏横幅（LCP 候选）：立即加载 + 高优先级，默认仍懒加载。
 */
export function BannerImage({ src, priority = false }: { src: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div aria-hidden="true" className="bg-gradient-to-r size-full from-signal/15 via-surface to-surface" />;
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      onError={() => setFailed(true)}
      className="size-full object-cover"
    />
  );
}