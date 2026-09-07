import { useState } from "react";

/** 档案横幅：X 横幅可能随时被成员删掉（URL 失效），加载失败回退渐变底 */
export function BannerImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div aria-hidden="true" className="bg-gradient-to-r size-full from-signal/15 via-surface to-surface" />;
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="size-full object-cover"
    />
  );
}