import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
    vi.useFakeTimers();
    localStorageMock.clear();
    localStorageMock.setItem("tokendance:lang", "zh-CN");
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("closes on Escape key press", () => {
    const onClose = vi.fn();
    renderMenu({ onClose });

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on outside mousedown after debounce", () => {
    const onClose = vi.fn();
    renderMenu({ onClose });

    // Advance past the 100ms setTimeout that registers listeners
    vi.advanceTimersByTime(100);

    // Click on the backdrop (outside the menu)
    const backdrop = document.querySelector(".context-menu-backdrop");
    fireEvent.mouseDown(backdrop!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows delete action when isOwn is true", () => {
    const onDelete = vi.fn();
    renderMenu({ isOwn: true, onDelete });

    const deleteBtn = screen.getByRole("menuitem", { name: /删除/ });
    expect(deleteBtn).toBeInTheDocument();

    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("does not show delete action when isOwn is false", () => {
    renderMenu({ isOwn: false });

    expect(screen.queryByRole("menuitem", { name: /删除/ })).toBeNull();
  });

  it("shows edit action when isOwn and onEdit are provided", () => {
    const onEdit = vi.fn();
    renderMenu({ isOwn: true, onEdit });

    const editBtn = screen.getByRole("menuitem", { name: /编辑/ });
    expect(editBtn).toBeInTheDocument();

    fireEvent.click(editBtn);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("shows pin action when onPin is provided", () => {
    const onPin = vi.fn();
    renderMenu({ onPin });

    const pinBtn = screen.getByRole("menuitem", { name: /置顶/ });
    expect(pinBtn).toBeInTheDocument();

    fireEvent.click(pinBtn);
    expect(onPin).toHaveBeenCalledTimes(1);
  });

  it("cleans up event listeners on unmount", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");

    const { unmount } = render(
      <I18nProvider>
        <MessageContextMenu
          message={message}
          isOwn={false}
          position={{ x: 40, y: 40 }}
          onClose={vi.fn()}
          onReply={vi.fn()}
          onCopy={vi.fn()}
          onForward={vi.fn()}
          onDelete={vi.fn()}
          onSelect={vi.fn()}
        />
      </I18nProvider>,
    );

    // Advance past the setTimeout so listeners are registered
    vi.advanceTimersByTime(100);
    expect(addSpy).toHaveBeenCalledWith("mousedown", expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith("touchstart", expect.any(Function));

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("mousedown", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("touchstart", expect.any(Function));
  });
});
