import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion";
import { SubmitDialog } from "@/components/member/SubmitDialog";
import { SiteHeader } from "@/components/SiteHeader";
import { ArrowLeft } from "lucide-react";
import { SITE_NAME, SITE_URL, SLOGAN } from "@/lib/site";
import { MILESTONES } from "@/milestones";
import { badge } from "@/lib/format";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: `关于 · ${SITE_NAME}` },
      { name: "description", content: `${SITE_NAME}的数据口径、来源与加入方式——公开透明是这块看板的前提。` },
      { property: "og:title", content: `关于 · ${SITE_NAME}` },
      { property: "og:description", content: SLOGAN },
      { property: "og:type", content: "website" },
      { property: "og:image", content: `${SITE_URL}/og/site.png?v=2` },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  const [joinOpen, setJoinOpen] = useState(false);
  return (
    <>
      <SiteHeader containerClassName="max-w-4xl" />
      <div className="mx-auto max-w-4xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
        <Reveal y={18}>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-semibold text-mist transition-colors hover:border-signal/40 hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            返回看板
          </Link>
          <h1 className="mt-8 text-4xl font-bold tracking-tight sm:text-5xl">关于 {SITE_NAME}</h1>
        </Reveal>
  
        <main className="mt-10 space-y-12 sm:mt-14">
          <Reveal>
            <section>
              <h2 className="text-2xl font-bold">这是什么</h2>
              <p className="mt-3 max-w-2xl leading-relaxed text-mist">
                一块追踪 KOSX 成员在 X 上公开成长数据的看板：粉丝量、登阶记录、社群总影响力。
                每位成员从当前粉丝量出发一阶一阶往上登，整个社群正在产生多大的影响，这里看得见。
              </p>
            </section>
          </Reveal>
  
          <Reveal>
            <section>
              <h2 className="text-2xl font-bold">称号大关与段位</h2>
              <p className="mt-3 max-w-2xl leading-relaxed text-mist">万粉不是终点，只是大关中的一道。</p>
              <ul className="mt-3 max-w-2xl list-disc space-y-2 pl-6 leading-relaxed text-mist">
                <li>
                  <b className="text-ink">称号大关</b>：跨过一道大关领一个称号——百粉「百里挑一」、五千粉「学富五车」、万粉「万人迷」……进度条实时显示距下一称号的进度，每个称号都是好彩头。
                </li>
                <li>
                  <b className="text-ink">总排行按大关分赛段</b>：分割线处标注大关门槛与称号，同一赛段里的人冲的是同一个称号，谁先冲线一目了然。
                </li>
                <li>
                  <b className="text-ink">段位徽章</b>只升不降：新芽 → 千粉新秀 → 万粉达人 → 十万粉影响力 → 百万粉传奇 → 千万粉神话。
                </li>
                <li>每拿下一道大关得一枚成就徽章，挂在成员页的徽章墙上。</li>
              </ul>
              <div className="mt-4 flex max-w-2xl flex-wrap gap-1.5">
                {MILESTONES.map((m) => (
                  <span
                    key={m.threshold}
                    className="inline-flex items-center gap-1 rounded-full border border-line bg-soft-surface px-2.5 py-1 text-xs text-mist"
                  >
                    <b className="text-ink">「{m.title}」</b>
                    <span className="tabular-nums">{badge(m.threshold)}</span>
                  </span>
                ))}
              </div>
            </section>
          </Reveal>
  
          <Reveal>
            <section>
              <h2 className="text-2xl font-bold">数据来源</h2>
              <ul className="mt-3 max-w-2xl space-y-3 leading-relaxed text-mist">
                <li>全部来自成员 X 账号的公开信息（粉丝量等），不含任何私密数据。</li>
                <li>每日自动更新一次（北京时间上午八点左右），当日重复采集以最新值为准。</li>
                <li>「加入追踪」弹窗可随时手动刷新——当场去 X 拉取公开数据，与每日采集同一条管线。</li>
                <li>顶部「近 30 天新增」是社群 30 天滚动窗口的新增粉丝合计，不追溯加入前的历史；「万粉成员」是当前粉丝量已达万粉的成员数。</li>
                <li>大关在粉丝量首次越过时记录，加入前已达成的称号不追溯。</li>
              </ul>
            </section>
          </Reveal>
  
          <Reveal>
            <section>
              <h2 className="text-2xl font-bold">榜单怎么排</h2>
              <ul className="mt-3 max-w-2xl list-disc space-y-2 pl-6 leading-relaxed text-mist">
                <li><b className="text-ink">总排行</b>：按最新粉丝量从高到低，用称号大关分割线分赛段，前三名有奖牌荣誉。</li>
                <li><b className="text-ink">成长榜</b>：按近 30 天增长排序——和自己比，小账号也有机会登顶。</li>
                <li><b className="text-ink">登阶记录</b>：按时间展示最近拿下的称号。</li>
              </ul>
            </section>
          </Reveal>
  
          <Reveal>
            <section>
              <h2 className="text-2xl font-bold">如何加入</h2>
              <ol className="mt-3 max-w-2xl list-decimal space-y-3 leading-relaxed text-mist">
                <li><b className="text-ink">点「加入追踪」</b>：看板首页或本页下方按钮，打开弹窗。</li>
                <li><b className="text-ink">输入你的 X 主页</b>：主页链接或 @ID 都行，提交即加入——不需要 GitHub，没有审批。</li>
                <li><b className="text-ink">看板见</b>：站点拉取你的公开数据，立即生成成长曲线，从当天起每天更新。</li>
              </ol>
              <div className="mt-6">
                <Button onClick={() => setJoinOpen(true)}>加入追踪</Button>
              </div>
            </section>
          </Reveal>
  
          <Reveal>
            <section>
              <h2 className="text-2xl font-bold">随时退出</h2>
              <p className="mt-3 max-w-2xl leading-relaxed text-mist">
                你的数据你做主。想退出的成员联系维护者即可：立即停止公开追踪，如需删除历史数据也一并处理。
              </p>
            </section>
          </Reveal>
        </main>
  
        <SubmitDialog open={joinOpen} onOpenChange={setJoinOpen} />
      </div>
    </>
  );
}
