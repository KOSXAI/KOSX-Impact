import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Avatar } from "@/components/member/Avatar";
import type { PostMediaItem, QuotedPostItem } from "@/stats";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

/** 单张图的展示比例：按原始宽高算，未知时回退 4:3；竖向超高图封顶 3:4 免得撑爆列表 */
function aspectOf(m: PostMediaItem): string {
  if (!m.width || !m.height) return m.kind === "photo" ? "4 / 3" : "16 / 9";
  const r = m.width / m.height;
  const clamped = Math.min(Math.max(r, 3 / 4), 16 / 9);
  return `${clamped}`;
}

/**
 * 帖子附件媒体：照片网格（1–4 张，点击放大看原图）、
 * 视频/GIF 封面 + 播放钮（点开内联 <video> 播放，video.twimg.com 可热链）、
 * 引用帖内嵌原文卡。纯展示，数据已在采集时落库。
 */
export function PostMedia({ media, quoted }: { media?: PostMediaItem[] | null; quoted?: QuotedPostItem | null }) {
  const photos = (media ?? []).filter((m) => m.kind === "photo");
  const videos = (media ?? []).filter((m) => m.kind !== "photo");
  if (photos.length === 0 && videos.length === 0 && !quoted) return null;

  return (
    <div className="mt-2.5 space-y-2.5">
      {photos.length > 0 && <PhotoGrid photos={photos} />}
      {videos.map((m, i) => (
        <VideoBlock key={i} media={m} />
      ))}
      {quoted && <QuotedCard quoted={quoted} />}
    </div>
  );
}

/** 照片网格：1 张通栏、2 张并排、3 张「一大两小」、4 张 2×2；点击开灯箱 */
function PhotoGrid({ photos }: { photos: PostMediaItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const n = photos.length;
  const cols = n === 1 ? "grid-cols-1" : "grid-cols-2";
  return (
    <>
      <div className={cn("grid gap-1.5 overflow-hidden rounded-xl", cols)}>
        {photos.map((m, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpen(i)}
            aria-label={`查看图片 ${i + 1}`}
            className={cn(
              "group relative block w-full overflow-hidden bg-soft-surface",
              // 3 张时第一张大图通栏；单张不设高度上限由比例决定
              n === 3 && i === 0 && "col-span-2"
            )}
            style={{ aspectRatio: n === 1 ? aspectOf(m) : n === 3 && i === 0 ? aspectOf(m) : "1 / 1" }}
          >
            <img
              src={m.url}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          </button>
        ))}
      </div>
      {open !== null && (
        <Dialog open onOpenChange={(v) => !v && setOpen(null)}>
          <DialogContent className="max-w-3xl bg-scrim p-2 sm:p-3">
            <img src={photos[open].url} alt="" referrerPolicy="no-referrer" className="max-h-[80dvh] w-full rounded-lg object-contain" />
            {photos.length > 1 && (
              <div className="flex justify-center gap-1.5">
                {photos.map((m, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setOpen(i)}
                    aria-label={`第 ${i + 1} 张`}
                    className={cn("size-1.5 rounded-full transition-colors", i === open ? "bg-ink" : "bg-mist/40")}
                  />
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/** 视频/GIF：封面 + 播放钮，点开后内联播放（无直链时退回跳 X 原文） */
function VideoBlock({ media }: { media: PostMediaItem }) {
  const [playing, setPlaying] = useState(false);
  if (playing && media.videoUrl) {
    return (
      <video
        src={media.videoUrl}
        poster={media.url}
        controls
        autoPlay
        playsInline
        preload="none"
        className="max-h-[70dvh] w-full rounded-xl bg-black"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => media.videoUrl && setPlaying(true)}
      aria-label={media.kind === "gif" ? "播放动图" : "播放视频"}
      className="group relative block w-full overflow-hidden rounded-xl bg-black"
      style={{ aspectRatio: aspectOf(media) }}
    >
      <img src={media.url} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover opacity-90" />
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid size-12 place-items-center rounded-full bg-black/55 backdrop-blur-sm transition-transform duration-200 group-hover:scale-110">
          <Play className="size-5 translate-x-[1px] fill-white text-white" aria-hidden="true" />
        </span>
      </span>
      {media.durationMs ? (
        <span className="absolute right-2 bottom-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white tabular-nums">
          {formatDuration(media.durationMs)}
        </span>
      ) : null}
    </button>
  );
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 引用帖内嵌原文卡：作者一行 + 正文（2 行）+ 可选首图 */
function QuotedCard({ quoted }: { quoted: QuotedPostItem }) {
  const name = quoted.name ?? quoted.handle;
  const inner = (
    <>
      <div className="flex items-center gap-2">
        <Avatar url={quoted.profileImage} name={name} className="size-5" />
        <span className="text-sm font-semibold">{name}</span>
        <span className="truncate text-xs text-mist">@{quoted.handle}</span>
      </div>
      {quoted.text && <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-mist whitespace-pre-line">{quoted.text}</p>}
      {quoted.media?.url && (
        <img
          src={quoted.media.url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="mt-2 max-h-56 w-full rounded-lg object-cover"
        />
      )}
    </>
  );
  const cls = "block rounded-xl border border-line bg-soft-surface px-3.5 py-3 transition-colors hover:bg-wash-strong";
  return quoted.url ? (
    <a href={quoted.url} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
