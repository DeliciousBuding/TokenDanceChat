import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider, useTranslation } from "@/i18n/context";

// Mock localStorage — i18n context reads/sets language in localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

function TestConsumer({ tKey, params }: { tKey: string; params?: Record<string, string | number> }) {
  const { t, lang } = useTranslation();
  return (
    <div>
      <span data-testid="translated">{t(tKey, params)}</span>
      <span data-testid="lang">{lang}</span>
    </div>
  );
}

function LangSwitcher() {
  const { lang, setLang } = useTranslation();
  return (
    <button
      data-testid="switch-lang"
      onClick={() => setLang(lang === "zh-CN" ? "en-US" : "zh-CN")}
    >
      Switch
    </button>
  );
}

function RenderOutside() {
  try {
    useTranslation();
    return <div>不应该渲染</div>;
  } catch (e) {
    return <div data-testid="error">{(e as Error).message}</div>;
  }
}

describe("I18nContext", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe("I18nProvider + useTranslation 正常工作", () => {
    it("中文环境下翻译 join.title", () => {
      localStorageMock.setItem("tokendance:lang", "zh-CN");
      render(
        <I18nProvider>
          <TestConsumer tKey="join.title" />
        </I18nProvider>,
      );
      expect(screen.getByTestId("translated").textContent).toBe("TokenDance Chat");
      expect(screen.getByTestId("lang").textContent).toBe("zh-CN");
    });

    it("英文环境下翻译 join.title", () => {
      localStorageMock.setItem("tokendance:lang", "en-US");
      render(
        <I18nProvider>
          <TestConsumer tKey="join.title" />
        </I18nProvider>,
      );
      // English also returns "TokenDance Chat" (brand name)
      expect(screen.getByTestId("translated").textContent).toBe("TokenDance Chat");
      expect(screen.getByTestId("lang").textContent).toBe("en-US");
    });

    it("不存在key时返回key本身", () => {
      localStorageMock.setItem("tokendance:lang", "zh-CN");
      render(
        <I18nProvider>
          <TestConsumer tKey="nonexistent.key.path" />
        </I18nProvider>,
      );
      expect(screen.getByTestId("translated").textContent).toBe("nonexistent.key.path");
    });
  });

  describe("中英文切换", () => {
    it("从中文切换到英文后翻译变化", () => {
      localStorageMock.setItem("tokendance:lang", "zh-CN");
      render(
        <I18nProvider>
          <TestConsumer tKey="join.subtitle" />
          <LangSwitcher />
        </I18nProvider>,
      );
      // 中文：公共聊天室 · AI 助手 @TokenBot 在线陪伴
      expect(screen.getByTestId("translated").textContent).toBe("公共聊天室 · AI 助手 @TokenBot 在线陪伴");

      fireEvent.click(screen.getByTestId("switch-lang"));

      // 英文：Public chat · AI assistant @TokenBot at your service
      expect(screen.getByTestId("translated").textContent).toBe(
        "Public chat · AI assistant @TokenBot at your service",
      );
      expect(screen.getByTestId("lang").textContent).toBe("en-US");
    });

    it("切换后 language 存储到 localStorage", () => {
      localStorageMock.setItem("tokendance:lang", "zh-CN");
      render(
        <I18nProvider>
          <LangSwitcher />
        </I18nProvider>,
      );
      fireEvent.click(screen.getByTestId("switch-lang"));
      expect(localStorage.getItem("tokendance:lang")).toBe("en-US");
    });
  });

  describe("参数替换", () => {
    it("替换 {{username}} 参数", () => {
      localStorageMock.setItem("tokendance:lang", "zh-CN");
      render(
        <I18nProvider>
          <TestConsumer tKey="system.userJoined" params={{ username: "Alice" }} />
        </I18nProvider>,
      );
      expect(screen.getByTestId("translated").textContent).toBe("Alice 加入了聊天室");
    });

    it("替换 {{count}} 数字参数", () => {
      localStorageMock.setItem("tokendance:lang", "zh-CN");
      render(
        <I18nProvider>
          <TestConsumer tKey="transcript.newMessages" params={{ count: 5 }} />
        </I18nProvider>,
      );
      expect(screen.getByTestId("translated").textContent).toBe("5 条新消息");
    });

    it("替换多个参数", () => {
      localStorageMock.setItem("tokendance:lang", "en-US");
      render(
        <I18nProvider>
          <TestConsumer tKey="system.typingMany" params={{ name: "Alice", count: 3 }} />
        </I18nProvider>,
      );
      expect(screen.getByTestId("translated").textContent).toBe(
        "Alice and 3 others are typing...",
      );
    });
  });

  describe("在 I18nProvider 外调用 useTranslation 抛出异常", () => {
    it("抛出有意义的错误信息", () => {
      // RenderOutside component catches the error itself
      render(<RenderOutside />);
      expect(screen.getByTestId("error").textContent).toBe(
        "useTranslation must be used within I18nProvider",
      );
    });
  });
});
