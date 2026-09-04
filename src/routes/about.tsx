import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";
import { GITHUB_APPLY_URL } from "@/lib/site";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "关于 · KOSX Impact" },
      { name: "description", content: "KOSX Impact 的数据口径、来源、加入与退出方式——公开透明是这块看板的前提。" },
      { property: "og:title", content: "关于 · KOSX Impact" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://10k.kosx.ai/og.svg" },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-3xl font-bold tracking-tight">关于 KOSX Impact</h1>
        <p className="text-muted-foreground">看见每个人的成长，也看见整个社群正在产生多大的影响。</p>
        <Link to="/" className="text-muted-foreground ml-auto text-sm underline-offset-4 hover:underline">
          ← 返回看板
        </Link>
      </header>

      <main className="mt-8 space-y-8">
        <section>
          <h2 className="text-lg font-semibold">这是什么</h2>
          <p className="text-muted-foreground mt-2">
            KOSX Impact 是 KOSX 社群的公开影响力数据平台，追踪成员在 X 上的公开成长数据（Road to 10K
            万粉计划）。它是一块公开数据看板，也是一场社群共同成长的游戏——和自己比，不是竞赛。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">数据来源与口径</h2>
          <ul className="text-muted-foreground mt-2 list-disc space-y-1.5 pl-5">
            <li>数据全部来自成员 X 账号的<b>公开信息</b>（粉丝量、关注数、推文数），不含任何私密数据</li>
            <li>每日更新一次（北京时间上午 8 点左右），当日重复采集以最新值为准</li>
            <li>数据通过 SocialData（第三方公开数据接口）获取，仅读取公开主页可见的数字</li>
            <li>「累计增长」相对成员加入时的基线；「进度」= 累计增长 ÷ 个人目标</li>
            <li>里程碑在观察到增长跨过档位时记录（1K / 2.5K / 5K / 7.5K / 10K），加入前已达成的档位不追溯</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">榜单怎么排</h2>
          <p className="text-muted-foreground mt-2">
            冲刺榜按「和自己比」的进步排序：目标进度优先，其次近期 30
            天增长。核心指标是相对基线的增长、相对目标的进度、连续更新天数——没有绝对粉丝量的排名，每一步进步都被看见。达成个人目标的成员自动进入「万粉俱乐部」荣誉区。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">如何加入</h2>
          <p className="text-muted-foreground mt-2">
            全程约 2 分钟——<b>不需要会代码，也不需要提 PR</b>：
          </p>
          <ol className="text-muted-foreground mt-2 list-decimal space-y-1.5 pl-5">
            <li>
              <b>填一份申请</b>：写上你的 X 用户名，勾选公开追踪同意声明即可
            </li>
            <li>
              <b>剩下的交给维护者</b>：收到申请后，维护者把你的账号加入追踪名册
            </li>
            <li>
              <b>看板见</b>：从当天起，看板上出现你的成长曲线，每天更新一次
            </li>
          </ol>
          <div className="mt-4">
            <Button asChild>
              <a href={GITHUB_APPLY_URL} target="_blank" rel="noreferrer">
                在 GitHub 提交申请 <ArrowUpRight className="size-4" />
              </a>
            </Button>
          </div>
          <p className="text-muted-foreground mt-3 text-sm">
            操作中遇到任何问题，直接在申请里评论说明，维护者会协助你完成。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">随时退出</h2>
          <p className="text-muted-foreground mt-2">
            你的数据你做主。任何成员可以随时退出：从名册移除后立即停止公开追踪；如需删除历史数据，联系维护者处理{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">snapshots</code> /{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">milestones</code> 记录即可。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">成员卡片</h2>
          <p className="text-muted-foreground mt-2">每位成员都有可嵌入个人主页 / GitHub README 的进度卡片：</p>
          <pre className="bg-muted mt-2 overflow-x-auto rounded-lg p-3 text-xs">
            &lt;img src=&quot;https://10k.kosx.ai/card/成员id.svg&quot; width=&quot;480&quot;&gt;
          </pre>
        </section>
      </main>

      <footer className="text-muted-foreground mt-12 text-sm">
        开源仓库{" "}
        <a href="https://github.com/KOSXAI/KOSX-Impact" className="underline-offset-4 hover:underline">
          KOSXAI/KOSX-Impact
        </a>{" "}
        · MIT License
      </footer>
    </div>
  );
}