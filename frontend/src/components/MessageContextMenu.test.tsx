import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/context";
import { MessageContextMenu } from "@/components/MessageContextMenu";
import type { ChatMessage } from "@/lib/api";

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

const message: ChatMessage = {
  id: "msg-1",
  username: "alice",
  content: "hello",
  timestamp: 1700000000000,
};

function renderMenu(overrides: Partial<Parameters<typeof MessageContextMenu>[0]> = {}) {
  const props = {
    message,
    isOwn: false,
    position: { x: 40, y: 40 },
    onClose: vi.fn(),
    onReply: vi.fn(),
    onCopy: vi.fn(),
    onForward: vi.fn(),
    onDelete: vi.fn(),
    onSelect: vi.fn(),
    ...overrides,
  };

  render(
    <I18nProvider>
      <MessageContextMenu {...props} />
    </I18nProvider>,
  );

  return props;
}

describe("MessageContextMenu", () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.setItem("tokendance:lang", "zh-CN");
  });

  it("renders react and translate actions with 44px menu rows", () => {
    const onReact = vi.fn();
    const onTranslate = vi.fn();
    renderMenu({ onReact, onTranslate });

    const reactButton = screen.getByRole("menuitem", { name: /添加表情/ });
    const translateButton = screen.getByRole("menuitem", { name: /翻译/ });

    expect(reactButton.className).toContain("min-h-11");
    expect(translateButton.className).toContain("min-h-11");

    fireEvent.click(reactButton);
    fireEvent.click(translateButton);

    expect(onReact).toHaveBeenCalledTimes(1);
    expect(onTranslate).toHaveBeenCalledTimes(1);
  });
});
