/**
 * 主题三态机：system（默认，跟随系统并实时响应系统切换）/ light / dark。
 * 用户选择持久化在 localStorage["kosx:theme"]；真正翻样式的是 html 上的
 * .dark class + data-theme-mode 属性——首帧之前由 THEME_BOOT_SCRIPT 写入，
 * 水合之后由 ThemeProvider（applyTheme）接管，两端共用本模块保证一致。
 */
export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "kosx:theme";

/** 两种解析主题的浏览器 chrome 色（地址栏/状态栏），随主题切换同步进 meta */
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: "#fafafa",
  dark: "#0a0a0a",
};

const CYCLE: ThemeMode[] = ["system", "light", "dark"];

export function resolveTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  if (mode === "system") return systemDark ? "dark" : "light";
  return mode;
}

/** 切换按钮的循环顺序：跟随系统 → 浅色 → 深色 → 回到跟随系统 */
export function cycleTheme(mode: ThemeMode): ThemeMode {
  return CYCLE[(CYCLE.indexOf(mode) + 1) % CYCLE.length];
}

/** 读回持久化模式；无存储/隐私模式一律视为 system */
export function readStoredMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : "system";
  } catch {
    return "system";
  }
}

/** 把模式落到 DOM：html.dark + data-theme-mode + theme-color meta，返回解析结果 */
export function applyTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  const resolved = resolveTheme(mode, systemDark);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.themeMode = mode;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[resolved]);
  return resolved;
}

/**
 * <head> 内联启动脚本：阻塞执行、首帧绘制前定题，深色用户不闪白屏。
 * 与 applyTheme 逻辑一致（class + data-theme-mode + meta），但零依赖内联。
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var m="system";try{m=localStorage.getItem("kosx:theme")||"system"}catch(e){}var d=m==="dark"||(m!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.dataset.themeMode=m;var t=document.querySelector('meta[name="theme-color"]');if(t)t.setAttribute("content",d?"#0a0a0a":"#fafafa");}catch(e){}})();`;
