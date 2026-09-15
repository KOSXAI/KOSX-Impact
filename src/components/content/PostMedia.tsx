import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Avatar } from "@/components/member/Avatar";
import type { PostMediaItem, QuotedPostItem } from "@/stats";
import { Loader2, Play } from "lucide-react";
import { cn } from "@/lib/utils";

/** blob 拉取的体积上限：超过就不内联播放（整段下载会卡住页面），退回跳 X 原文 */
const VIDEO_BLOB_MAX = 64 * 1024 * 1024;

/** 单张图的展示比例：按原始宽高算，未知时回退 4:3；竖向超高图封顶 3:4 免得撑爆列表 */
function aspectOf(m: PostMediaItem): string {
  if (!m.width || !m.height) return m.kind === "photo" ? "4 / 3" : "16 / 9";
  const r = m.width / m.height;
  const clamped = Math.min(Math.max(r, 3 / 4), 16 / 9);
  return `${clamped}`;
}

/**
 * 帖子附件媒体：照片网格（1–4 张，点击放大看原图）、
 * 视频/GIF 封面 + 播放钮（点开内联播放，见 VideoBlock 的防盗链说明）、
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

/**
 * 视频/GIF：封面 + 播放钮，点开后内联播放；无直链或拉取失败退回跳 X 原文。
 *
 * 防盗链注意：video.twimg.com 按 Referer 白名单放行（第三方站 Referer 403，
 * 不发 Referer 才 206）。<video> 不支持 referrerPolicy 属性（HTML 规范只覆盖
 * a/img/iframe/script/link/form），所以直链播放必 403——
 * 点播放时用 fetch(no-referrer) 拉成 blob 再播（twimg 的 CORS 放行，实测 200）。
 * 字节始终直接来自 X 的 CDN，不经过本站。
 */
function VideoBlock({ media }: { media: PostMediaItem }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // blob 用完/卸载即释放，避免大对象驻留内存
  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  const load = async () => {
    if (!media.videoUrl || loading) return;
    setLoading(true);
    try {
      const res = await fetch(media.videoUrl, { referrerPolicy: "no-referrer" });
      // 超大视频不拉 blob（整段下载会卡住页面），退回跳 X 原文
      const size = Number(res.headers.get("content-length") ?? 0);
      if (!res.ok || size > VIDEO_BLOB_MAX) throw new Error(`unplayable (${res.status}${size ? `, ${size}B` : ""})`);
      setBlobUrl(URL.createObjectURL(await res.blob()));
    } catch {
      setFailed(true);
    }
    setLoading(false);
  };

  if (blobUrl) {
    return (
      <video
        src={blobUrl}
        poster={media.url}
        controls
        autoPlay
        playsInline
        className="max-h-[70dvh] w-full rounded-xl bg-black"
      />
    );
  }
  return (
    <a
      href={media.tco ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        // 有直链且没失败过就内联拉取播放；失败/无直链才放行默认跳转（X 媒体页）
        if (media.videoUrl && !failed) {
          e.preventDefault();
          load();
        }
      }}
      aria-label={media.kind === "gif" ? "播放动图" : "播放视频"}
      className="group relative block w-full overflow-hidden rounded-xl bg-black"
      style={{ aspectRatio: aspectOf(media) }}
    >
      <img src={media.url} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover opacity-90" />
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid size-12 place-items-center rounded-full bg-black/55 backdrop-blur-sm transition-transform duration-200 group-hover:scale-110">
          {loading ? (
            <Loader2 className="size-5 animate-spin text-white" aria-hidden="true" />
          ) : (
            <Play className="size-5 translate-x-[1px] fill-white text-white" aria-hidden="true" />
          )}
        </span>
      </span>
      {media.durationMs ? (
        <span className="absolute right-2 bottom-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white tabular-nums">
          {formatDuration(media.durationMs)}
        </span>
      ) : null}
    </a>
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
