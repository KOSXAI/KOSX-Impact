import { describe, expect, it } from "vitest";
import { CACHE_KEYS, assertSafeCacheKey, isSafeCacheKey } from "../src/cache";

/**
 * 缓存键投毒的回归防线。
 *
 * 攻击面：缓存键由 `${SITE_URL}${key}` 组成 URL 再交 Cache API，而 URL 解析会
 * 规范化路径（`..` 逐段抵消）并丢弃 `#` 之后的内容。键里一旦混入用户输入且未编码，
 * 攻击者就能构造 `date = "../../og.svg#"` 把日报 JSON 写进 `/og.svg` 的缓存槽，
 * 一小时内所有访问 `/og.svg`、`/about` 的用户都拿到被篡改的响应。
 */
describe("缓存键安全闸门", () => {
  it("拒绝路径穿越与片段符", () => {
    expect(isSafeCacheKey("/q/daily/../../og.svg#")).toBe(false);
    expect(isSafeCacheKey("/q/daily/..")).toBe(false);
    expect(isSafeCacheKey("/q/daily/a#b")).toBe(false);
    expect(isSafeCacheKey("/q/daily/a\\b")).toBe(false);
    expect(isSafeCacheKey("http://evil.example.com/")).toBe(false); // 必须是以 / 开头的站内路径
  });

  it("接受合法键（含编码后的用户输入）", () => {
    expect(isSafeCacheKey("/api/dashboard?v=24")).toBe(true);
    expect(isSafeCacheKey(CACHE_KEYS.dailyArchive("2026-09-01"))).toBe(true);
    expect(isSafeCacheKey(CACHE_KEYS.memberDetail("alice_x"))).toBe(true);
  });

  it("dailyArchive 对含穿越符的日期做编码，键逃不出 /q/daily/ 前缀", () => {
    const key = CACHE_KEYS.dailyArchive("../../og.svg#");
    expect(key.startsWith("/q/daily/")).toBe(true);
    // 斜杠与 # 都被编码：`..` 字符本身还在，但已无法参与路径规范化
    expect(key).not.toContain("#");
    expect(key).not.toContain("/../");
    // 编码后即使过 URL 解析也不会落到别的路径
    expect(new URL(`https://impact.kosx.ai${key}`).pathname.startsWith("/q/daily/")).toBe(true);
  });

  it("memberDetail / og* 的 id 编码后不逃逸", () => {
    for (const key of [
      CACHE_KEYS.memberDetail("../../about#"),
      CACHE_KEYS.ogMember("../../og/site.png#"),
      CACHE_KEYS.ogTrack("../../robots.txt#"),
    ]) {
      expect(new URL(`https://impact.kosx.ai${key}`).pathname).toContain("%2F");
    }
  });

  it("assertSafeCacheKey 对非法键抛错（内部键的编程错误要立刻暴露）", () => {
    expect(() => assertSafeCacheKey("/q/daily/../../og.svg#")).toThrow(/非法缓存键/);
    expect(assertSafeCacheKey("/q/daily/2026-09-01?v=1")).toBe("/q/daily/2026-09-01?v=1");
  });
});

/**
 * 纵深防御：即便 serverFn 层的 validator 被绕过（例如未来新增了别的调用方），
 * getDailyArchive 也必须拒绝非法日期，否则日期会带着 `..`/`#` 进缓存键。
 */
describe("getDailyArchive 日期白名单（缓存投毒的纵深防线）", () => {
  it("非 YYYY-MM-DD 一律拒绝，不进入缓存层", async () => {
    const { getDailyArchive } = await import("../src/queries/archive");
    const fakeEnv = {} as Env; // 不该被用到：校验在查询前的第一行
    for (const bad of ["../../og.svg#", "2026-9-1", "garbage", "", "2026-09-01T00:00:00Z"]) {
      await expect(getDailyArchive(fakeEnv, bad)).rejects.toThrow(/非法归档日期/);
    }
  });
});
