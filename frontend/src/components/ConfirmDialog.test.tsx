import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

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
    const closeButton = screen.getByLabelText("Close");
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
});
