import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

vi.mock("@/i18n/context", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = { "a11y.close": "关闭" };
      return map[key] ?? key;
    },
    lang: "zh-CN" as const,
    setLang: vi.fn(),
  }),
}));

// Mock localStorage (used by unrelated modules, but set up to be safe)
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

describe("ConfirmDialog", () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.setItem("tokendance:lang", "zh-CN");
  });

  it("open=true 时对话框可见", () => {
    render(
      <ConfirmDialog
        open={true}
        title="确认删除？"
        message="此操作不可撤销"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("确认删除？")).toBeTruthy();
    expect(screen.getByText("此操作不可撤销")).toBeTruthy();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("open=false 时不渲染任何内容", () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        title="确认删除？"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("点击确认按钮触发 onConfirm", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="确认删除？"
        confirmLabel="确认"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText("确认"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("点击取消按钮触发 onCancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="确认删除？"
        cancelLabel="取消"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText("取消"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("点击关闭按钮（X）触发 onCancel", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="确认删除？"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    const closeButton = screen.getByLabelText("关闭");
    fireEvent.click(closeButton);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("destructive variant 显示 destructive 样式", () => {
    render(
      <ConfirmDialog
        open={true}
        title="删除消息"
        variant="destructive"
        confirmLabel="删除"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const confirmBtn = screen.getByText("删除");
    expect(confirmBtn.className).toContain("bg-destructive");
  });

  it("default variant 不包含 destructive 类名", () => {
    render(
      <ConfirmDialog
        open={true}
        title="保存更改"
        variant="default"
        confirmLabel="保存"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const confirmBtn = screen.getByText("保存");
    expect(confirmBtn.className).not.toContain("bg-destructive");
  });

  it("点击背景遮罩触发 onCancel", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="测试"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    // The backdrop has the absolute inset-0 class
    const backdrop = document.querySelector(".absolute.inset-0");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // --- New tests: confirm/cancel triggers, title/message, destructive, Escape ---

  it("calls onConfirm with destructive variant styling", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="永久删除"
        message="此操作无法撤销"
        variant="destructive"
        confirmLabel="确认删除"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    const confirmBtn = screen.getByText("确认删除");
    expect(confirmBtn.className).toContain("bg-destructive");
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("renders without message paragraph when message prop is omitted", () => {
    render(
      <ConfirmDialog
        open={true}
        title="仅标题"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("仅标题")).toBeTruthy();
    const dialog = screen.getByRole("alertdialog");
    const paragraphs = dialog.querySelectorAll("p");
    expect(paragraphs.length).toBe(0);
  });

  it("renders custom title, message, and confirm label", () => {
    render(
      <ConfirmDialog
        open={true}
        title="自定义标题"
        message="自定义消息内容"
        confirmLabel="知道了"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("自定义标题")).toBeTruthy();
    expect(screen.getByText("自定义消息内容")).toBeTruthy();
    expect(screen.getByText("知道了")).toBeTruthy();
  });

  it("calls onCancel when Escape key is pressed on the dialog", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="确认删除？"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape", code: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel with custom cancelLabel on click", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="测试"
        cancelLabel="返回"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText("返回"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
