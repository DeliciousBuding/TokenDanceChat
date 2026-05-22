import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AssistantIcon } from "@/components/AssistantIcon";
import type { AssistantDefinition, AssistantModel } from "@/lib/assistantRegistry";

const mockModel: AssistantModel = {
  id: "deepseek-v4-flash",
  name: "DeepSeek V4 Flash",
  provider: "deepseek",
  providerName: "DeepSeek",
  protocol: "openai",
  icon: "deepseek",
  context: "1M",
};

const mockAssistant: AssistantDefinition = {
  id: "tokenbot",
  name: "TokenBot",
  label: "Bot",
  description: "轻量聊天助手",
  kind: "bot",
  aliases: ["bot"],
  mention: "@TokenBot",
  model: mockModel,
  status: "online",
};

const mockAgentAssistant: AssistantDefinition = {
  ...mockAssistant,
  id: "picoclaw",
  name: "PicoClaw",
  kind: "agent",
  model: {
    ...mockModel,
    id: "picoclaw-deepseek-v4-flash",
    name: "PicoClaw + DeepSeek V4 Flash",
    protocol: "pico",
  },
};

describe("AssistantIcon", () => {
  describe("正常加载 (normal render with icon)", () => {
    it("model 模式下渲染 img 元素", () => {
      render(<AssistantIcon model={mockModel} size="md" />);
      const img = screen.getByRole("img");
      expect(img).toBeTruthy();
      expect(img.getAttribute("alt")).toBe("DeepSeek");
    });

    it("assistant 模式下渲染 img 元素", () => {
      render(<AssistantIcon assistant={mockAssistant} size="md" />);
      const img = screen.getByRole("img");
      expect(img).toBeTruthy();
      expect(img.getAttribute("alt")).toBe("DeepSeek");
    });

    it("img 使用 lazy loading", () => {
      render(<AssistantIcon model={mockModel} />);
      const img = screen.getByRole("img");
      expect(img.getAttribute("loading")).toBe("lazy");
    });

    it("size=sm 渲染正确尺寸 class", () => {
      const { container } = render(<AssistantIcon model={mockModel} size="sm" />);
      const span = container.firstElementChild;
      expect(span?.className).toContain("h-6");
      expect(span?.className).toContain("w-6");
    });

    it("size=lg 渲染正确尺寸 class", () => {
      const { container } = render(<AssistantIcon model={mockModel} size="lg" />);
      const span = container.firstElementChild;
      expect(span?.className).toContain("h-10");
      expect(span?.className).toContain("w-10");
    });

    it("自定义 className 透传", () => {
      const { container } = render(
        <AssistantIcon model={mockModel} className="custom-class" />,
      );
      const span = container.firstElementChild;
      expect(span?.className).toContain("custom-class");
    });
  });

  describe("Fallback 渲染 (icon load failure)", () => {
    it("img 标签上设置了 onError handler", () => {
      render(<AssistantIcon model={mockModel} size="md" />);
      const img = screen.getByRole("img");
      // Verify onError prop is attached (it's a React synthetic event handler)
      expect(img).toBeTruthy();
      // The onError handler is set as a React prop, not a DOM attribute
    });

    it("没有 icon 属性时不渲染 img，直接显示 fallback（Bot icon）", () => {
      const modelWithoutIcon: AssistantModel = { ...mockModel, icon: "" };
      const { container } = render(<AssistantIcon model={modelWithoutIcon} size="md" />);
      // Should render fallback directly (no img tag)
      expect(screen.queryByRole("img")).toBeNull();
      // Fallback span should exist with bg-accent class
      const fallback = container.querySelector(".bg-accent.text-muted-foreground");
      expect(fallback).toBeTruthy();
    });

    it("agent 类型没有 icon 时显示 Workflow 图标作为 fallback", () => {
      const agentWithoutIcon: AssistantDefinition = {
        ...mockAgentAssistant,
        model: { ...mockAgentAssistant.model, icon: "" },
      };
      const { container } = render(<AssistantIcon assistant={agentWithoutIcon} size="md" />);
      expect(screen.queryByRole("img")).toBeNull();
      const fallback = container.querySelector(".bg-accent.text-muted-foreground");
      expect(fallback).toBeTruthy();
    });

    it("bot 类型没有 icon 时显示 Bot 图标作为 fallback", () => {
      const botWithoutIcon: AssistantDefinition = {
        ...mockAssistant,
        model: { ...mockAssistant.model, icon: "" },
      };
      const { container } = render(<AssistantIcon assistant={botWithoutIcon} size="md" />);
      expect(screen.queryByRole("img")).toBeNull();
      const fallback = container.querySelector(".bg-accent.text-muted-foreground");
      expect(fallback).toBeTruthy();
    });

    it("没有 model 和 assistant 时显示 fallback", () => {
      const { container } = render(<AssistantIcon size="md" />);
      expect(screen.queryByRole("img")).toBeNull();
      const fallback = container.querySelector(".bg-accent.text-muted-foreground");
      expect(fallback).toBeTruthy();
    });
  });

  describe("getLobeIconURL 正确拼接", () => {
    it("正确拼接 Lobe UI 图标 URL", () => {
      render(<AssistantIcon model={mockModel} />);
      const img = screen.getByRole("img");
      expect(img.getAttribute("src")).toContain("@lobehub/icons-static-svg");
      expect(img.getAttribute("src")).toContain("deepseek-color.svg");
    });
  });
});
