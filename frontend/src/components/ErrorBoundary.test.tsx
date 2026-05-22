import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Mock localStorage — ErrorBoundary uses detectLanguage() which reads localStorage
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

// Mock matchMedia (used if child components need it — not used by ErrorBoundary itself)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock window.location.reload for the reload button
const mockReload = vi.fn();
Object.defineProperty(window, "location", {
  value: { reload: mockReload },
  writable: true,
});

// Suppress console.error during throwing-child tests
function suppressError(fn: () => void) {
  const orig = console.error;
  console.error = vi.fn();
  try {
    fn();
  } finally {
    console.error = orig;
  }
}

function ThrowOnRender({ message }: { message?: string }): React.ReactNode {
  throw new Error(message ?? "Test error");
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.setItem("tokendance:lang", "zh-CN");
    mockReload.mockClear();
  });

  it("正常渲染子组件", () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">正常内容</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("child")).toBeTruthy();
    expect(screen.getByText("正常内容")).toBeTruthy();
  });

  it("子组件抛出异常时显示错误信息", () => {
    suppressError(() => {
      render(
        <ErrorBoundary>
          <ThrowOnRender />
        </ErrorBoundary>,
      );
    });
    // Should show the error heading
    expect(screen.getByText("出错了")).toBeTruthy();
  });

  it("显示错误消息文本", () => {
    suppressError(() => {
      render(
        <ErrorBoundary>
          <ThrowOnRender message="Custom error message" />
        </ErrorBoundary>,
      );
    });
    // The error message should be visible in the <pre> block
    expect(screen.getByText("Custom error message")).toBeTruthy();
  });

  it("显示刷新页面按钮", () => {
    suppressError(() => {
      render(
        <ErrorBoundary>
          <ThrowOnRender />
        </ErrorBoundary>,
      );
    });
    expect(screen.getByText("刷新页面")).toBeTruthy();
  });

  it("fallback prop 替换默认错误UI", () => {
    const fallback = <div data-testid="custom-fallback">自定义错误页面</div>;
    suppressError(() => {
      render(
        <ErrorBoundary fallback={fallback}>
          <ThrowOnRender />
        </ErrorBoundary>,
      );
    });
    expect(screen.getByTestId("custom-fallback")).toBeTruthy();
    expect(screen.getByText("自定义错误页面")).toBeTruthy();
    // Default error UI should not be present
    expect(screen.queryByText("出错了")).toBeNull();
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });

  it("点击刷新按钮触发 window.location.reload", () => {
    suppressError(() => {
      render(
        <ErrorBoundary>
          <ThrowOnRender />
        </ErrorBoundary>,
      );
    });
    const reloadBtn = screen.getByText("刷新页面");
    reloadBtn.click();
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it("英文环境下显示Something went wrong", () => {
    localStorageMock.setItem("tokendance:lang", "en-US");
    suppressError(() => {
      render(
        <ErrorBoundary>
          <ThrowOnRender />
        </ErrorBoundary>,
      );
    });
    expect(screen.getByText("Something went wrong")).toBeTruthy();
  });
});
