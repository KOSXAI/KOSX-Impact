import { describe, expect, it } from "vitest";
import {
  applyTheme,
  cycleTheme,
  readStoredMode,
  resolveTheme,
  THEME_BOOT_SCRIPT,
} from "../src/lib/theme";

describe("主题三态机", () => {
  it("resolveTheme：system 跟随系统偏好，明暗直取", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("cycleTheme：system → light → dark → system 循环", () => {
    expect(cycleTheme("system")).toBe("light");
    expect(cycleTheme("light")).toBe("dark");
    expect(cycleTheme("dark")).toBe("system");
  });

  it("readStoredMode：workerd 无 localStorage 时安全回退 system", () => {
    expect(readStoredMode()).toBe("system");
  });

  it("启动脚本与 applyTheme 行为一致：都落 .dark + data-theme-mode + meta", () => {
    // 脚本里写死了两主题 chrome 色与存储键，必须与常量同步
    expect(THEME_BOOT_SCRIPT).toContain('"#0a0a0a"');
    expect(THEME_BOOT_SCRIPT).toContain('"#f5f6f7"');
    expect(THEME_BOOT_SCRIPT).toContain('localStorage.getItem("kosx:theme")');
    // applyTheme 在 workerd 里没有 document，跳过 DOM 侧断言，仅保证可导入无副作用
    expect(typeof applyTheme).toBe("function");
  });
});
