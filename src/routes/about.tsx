import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion";
import { ArrowUpRight } from "lucide-react";
import { GITHUB_APPLY_URL, SITE_NAME, SITE_URL, SLOGAN } from "@/lib/site";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: `关于 · ${SITE_NAME}` },
      { name: "description", content: `${SITE_NAME}的数据口径、来源与加入方式——公开透明是这块看板的前提。` },
      { property: "og:title", content: `关于 · ${SITE_NAME}` },
      { property: "og:description", content: SLOGAN },
      { property: "og:type", content: "website" },
      { property: "og:image", content: `${SITE_URL}/og.svg?v=2` },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-[clamp(18px,2.2vw,34px)] py-12 sm:py-16">
      <Reveal y={18}>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">关于 {SITE_NAME}</h1>
        <Link to="/" className="text-mist underline-offset-4 hover:text-ink hover:underline">
          ← 返回看板
        </Link>
      </Reveal>

      <main className="mt-10 space-y-12 sm:mt-14">
        <Reveal>
          <section>
            <h2 className="text-2xl font-bold">这是什么</h2>
            <p className="mt-3 max-w-2xl leading-relaxed text-mist">
              一块追踪 KOSX 成员在 X 上公开成长数据（粉丝量与登阶记录）的看板。
              它记录每位成员从当前粉丝出发、一阶一阶往上登的过程，也让整个社群的影响力被看见。
            </p>
          </section>
        </Reveal>

        <Reveal>
          <section>
            <h2 className="text-2xl font-bold">台阶与段位</h2>
            <p className="mt-3 max-w-2xl leading-relaxed text-mist">
              万粉不是终点，只是台阶中的一级。整个阶梯在每个数量级内均匀分布，每个段位要登的台阶数完全相同：
            </p>
            <ul className="mt-3 max-w-2xl list-disc space-y-2 pl-6 leading-relaxed text-mist">
              <li>百粉段每 100 一档，千粉段每 500 一档，万粉段每 5000 一档，十万粉段每 5 万一档，以此类推——成就多多，达成一级自动出现下一级。</li>
              <li>每位成员的目标就是自己的下一级台阶，进度永远有下一个 0→100%，没有终点线。</li>
              <li>段位徽章按量级颁发：新芽 → 千粉新秀 → 万粉达人 → 十万粉影响力 → 百万粉传奇 → 千万粉神话，只升不降。</li>
              <li>每登上一级台阶获得一枚成就徽章，展示在成员页的徽章墙与排行榜上。</li>
            </ul>
          </section>
        </Reveal>

        <Reveal>
          <section>
            <h2 className="text-2xl font-bold">数据来源</h2>
            <ul className="mt-3 max-w-2xl space-y-3 leading-relaxed text-mist">
              <li>数据全部来自成员 X 账号的公开信息（粉丝量等），不含任何私密数据。</li>
              <li>每日更新一次（北京时间上午八点左右），当日重复采集以最新值为准。</li>
              <li>
                成员可以在{" "}
                <Link to="/submit" className="text-ink underline underline-offset-4 hover:text-mist">
                  更新我的数据
                </Link>{" "}
                页面自助触发即时刷新——站点当场去 X 拉取公开数据，与每日采集走同一条管线，口径完全一致。
              </li>
              <li>「累计增长」相对成员加入时的基线；「台阶进度」是当前台阶内的完成度。</li>
              <li>台阶在粉丝量首次越过时记录，加入前已达成的台阶不追溯。</li>
            </ul>
          </section>
        </Reveal>

        <Reveal>
          <section>
            <h2 className="text-2xl font-bold">榜单怎么排</h2>
            <ul className="mt-3 max-w-2xl list-disc space-y-2 pl-6 leading-relaxed text-mist">
              <li><b className="text-ink">总排行</b>：按最新粉丝量从高到低，前三名有奖牌荣誉。</li>
              <li><b className="text-ink">成长榜</b>：按近 30 天增长排序——和自己比，小账号也有机会登顶。</li>
              <li><b className="text-ink">登阶记录</b>：按时间展示最近达成的台阶成就。</li>
            </ul>
          </section>
        </Reveal>

        <Reveal>
          <section>
            <h2 className="text-2xl font-bold">如何加入</h2>
            <p className="mt-3 max-w-2xl leading-relaxed text-mist">
              全程约两分钟，不需要会代码，也不需要提合并请求：
            </p>
            <ol className="mt-3 max-w-2xl list-decimal space-y-3 pl-6 leading-relaxed text-mist">
              <li><b className="text-ink">填一份申请</b>：写上你的 X 用户名，勾选公开追踪同意声明。</li>
              <li><b className="text-ink">剩下的交给维护者</b>：收到申请后，维护者把你的账号加入追踪名册。</li>
              <li><b className="text-ink">看板见</b>：从当天起，看板上出现你的成长曲线，每天更新一次。</li>
            </ol>
            <div className="mt-6">
              <Button asChild>
                <a href={GITHUB_APPLY_URL} target="_blank" rel="noreferrer">
                  提交申请 <ArrowUpRight className="size-4" />
                </a>
              </Button>
            </div>
            <p className="mt-4 text-mist">操作中遇到问题，直接在申请里评论，维护者会协助你。</p>
          </section>
        </Reveal>

        <Reveal>
          <section>
            <h2 className="text-2xl font-bold">随时退出</h2>
            <p className="mt-3 max-w-2xl leading-relaxed text-mist">
              你的数据你做主。任何成员可以随时退出：从名册移除后立即停止公开追踪；如需删除历史数据，联系维护者处理即可。
            </p>
          </section>
        </Reveal>

        <Reveal>
          <section>
            <h2 className="text-2xl font-bold">成员卡片</h2>
            <p className="mt-3 max-w-2xl leading-relaxed text-mist">
              每位成员都有一张可嵌入个人主页或仓库的进度卡片：
            </p>
            <pre className="mt-4 overflow-x-auto rounded-2xl border border-line bg-soft-surface p-4 font-mono text-sm text-mist">
              &lt;img src=&quot;{`${SITE_URL}/card/成员id.svg`}&quot; width=&quot;480&quot;&gt;
            </pre>
          </section>
        </Reveal>
      </main>
    </div>
  );
}
