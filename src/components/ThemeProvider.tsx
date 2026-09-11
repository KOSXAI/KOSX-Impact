import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  applyTheme,
  readStoredMode,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemeMode,
} from "@/lib/theme";

type ThemeContextValue = {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
};

/** 无 Provider 时给安全空实现（404 兜底等游离在壳外的渲染也不炸） */
const ThemeContext = createContext<ThemeContextValue>({
  mode: "system",
  resolved: "light",
  setMode: () => {},
});

/**
 * 主题状态机（水合后接管）：挂载读回存储模式并监听系统偏好变化，
 * system 模式下系统切换深浅实时跟随。首帧之前的 class 由内联
 * THEME_BOOT_SCRIPT 落好，这里只在 mode/systemDark 变化时重写 DOM。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    setModeState(readStoredMode());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolved = resolveTheme(mode, systemDark);

  useEffect(() => {
    applyTheme(mode, systemDark);
  }, [mode, systemDark]);

  const setMode = useCallback((next: ThemeMode) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* 隐私模式写不进就只切本次会话 */
    }
    setModeState(next);
  }, []);

  return <ThemeContext value={{ mode, resolved, setMode }}>{children}</ThemeContext>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
