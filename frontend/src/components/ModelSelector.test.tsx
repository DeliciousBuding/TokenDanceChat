import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/context";
import { ModelSelector } from "@/components/ModelSelector";
import { modelCatalog } from "@/lib/assistantRegistry";

// Mock localStorage
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

// Mock matchMedia
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

function renderModelSelector(selectedModelId?: string) {
  const onSelect = vi.fn();
  const result = render(
    <I18nProvider>
      <ModelSelector
        selectedModelId={selectedModelId}
        onSelect={onSelect}
      />
    </I18nProvider>,
  );
  return { ...result, onSelect };
}

describe("ModelSelector", () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.setItem("tokendance:lang", "zh-CN");
  });

  describe("渲染", () => {
    it("未选择模型时显示 '选择模型' 占位文字", () => {
      renderModelSelector();
      expect(screen.getByText("选择模型")).toBeTruthy();
    });

    it("已选择模型时显示模型 providerName", () => {
      const firstModel = modelCatalog[0];
      renderModelSelector(firstModel.id);
      expect(screen.getByText(firstModel.providerName)).toBeTruthy();
    });

    it("渲染下拉箭头图标", () => {
      const { container } = renderModelSelector();
      // ChevronDown icon is from lucide-react — it renders an SVG
      const svg = container.querySelector("svg");
      expect(svg).toBeTruthy();
    });

    it("aria-expanded 默认为 false", () => {
      renderModelSelector();
      const button = screen.getByRole("button");
      expect(button.getAttribute("aria-expanded")).toBe("false");
    });

    it("disabled 时按钮不可点击且不展开", () => {
      const onSelect = vi.fn();
      render(
        <I18nProvider>
          <ModelSelector
            selectedModelId={modelCatalog[0].id}
            onSelect={onSelect}
            disabled
          />
        </I18nProvider>,
      );
      const button = screen.getByRole("button");
      fireEvent.click(button);
      // Should not open dropdown
      expect(screen.queryByRole("listbox")).toBeNull();
    });
  });

  describe("选择模型 (selecting a model)", () => {
    it("点击按钮展开模型列表", () => {
      renderModelSelector();
      const button = screen.getByText("选择模型");
      fireEvent.click(button);
      // Listbox should appear
      expect(screen.getByRole("listbox")).toBeTruthy();
      // All models should be rendered as options
      const options = screen.getAllByRole("option");
      expect(options.length).toBe(modelCatalog.length);
    });

    it("展开后 aria-expanded 变为 true", () => {
      renderModelSelector();
      const button = screen.getByRole("button");
      fireEvent.click(button);
      expect(button.getAttribute("aria-expanded")).toBe("true");
    });

    it("点击模型选项触发 onSelect 回调", () => {
      const { onSelect } = renderModelSelector();
      const button = screen.getByText("选择模型");
      fireEvent.click(button);

      const firstModel = modelCatalog[0];
      // Click on the provider name in the option
      const options = screen.getAllByRole("option");
      fireEvent.click(options[0]);

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(firstModel);
    });

    it("选择模型后 dropdown 自动关闭", () => {
      renderModelSelector();
      fireEvent.click(screen.getByText("选择模型"));
      fireEvent.click(screen.getAllByRole("option")[0]);
      // Listbox should be gone
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("已选中的模型旁显示 Check 图标", () => {
      const firstModel = modelCatalog[0];
      renderModelSelector(firstModel.id);
      fireEvent.click(screen.getByText(firstModel.providerName));

      // The currently selected option should have aria-selected
      const selectedOption = screen.getByRole("option", { selected: true });
      expect(selectedOption).toBeTruthy();
    });
  });

  describe("关闭 (closing the dropdown)", () => {
    it("点击外部区域关闭下拉菜单", () => {
      renderModelSelector();
      fireEvent.click(screen.getByText("选择模型"));
      expect(screen.getByRole("listbox")).toBeTruthy();

      // Click outside
      fireEvent.mouseDown(document.body);
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("按 Escape 键关闭下拉菜单", () => {
      renderModelSelector();
      fireEvent.click(screen.getByText("选择模型"));
      expect(screen.getByRole("listbox")).toBeTruthy();

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("再次点击按钮关闭下拉菜单（toggle）", () => {
      renderModelSelector();
      const button = screen.getByText("选择模型");
      fireEvent.click(button);
      expect(screen.getByRole("listbox")).toBeTruthy();

      fireEvent.click(button);
      expect(screen.queryByRole("listbox")).toBeNull();
    });
  });

  describe("键盘导航", () => {
    it("ArrowDown 在列表中导航", () => {
      renderModelSelector();
      fireEvent.click(screen.getByText("选择模型"));

      // ArrowDown should highlight next option
      fireEvent.keyDown(document, { key: "ArrowDown" });

      // Second option should have hover styling
      const options = screen.getAllByRole("option");
      expect(options[1].className).toContain("bg-accent");
    });

    it("Enter 选择当前高亮项", () => {
      const { onSelect } = renderModelSelector();
      fireEvent.click(screen.getByText("选择模型"));

      // After opening, selectedIdx = -1 (no selected model)
      // ArrowDown once → index 0 (first model: DeepSeek V4 Flash)
      fireEvent.keyDown(document, { key: "ArrowDown" });
      // ArrowDown again → index 1 (second model: PicoClaw + DeepSeek V4 Flash)
      fireEvent.keyDown(document, { key: "ArrowDown" });

      // Press enter to select — modelCatalog[1] is PicoClaw variant
      fireEvent.keyDown(document, { key: "Enter" });

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(modelCatalog[1]);
    });
  });
});
