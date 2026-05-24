import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { mockI18n } from "@/test-utils";
import { ScheduleButton } from "./ScheduleButton";

vi.mock("@/i18n/context", () => ({ useTranslation: () => mockI18n() }));

describe("ScheduleButton", () => {
  it("renders schedule button trigger", () => {
    render(<ScheduleButton onSchedule={vi.fn()} scheduled={false} />);
    expect(
      screen.getByLabelText("schedule.scheduleMessage"),
    ).toBeInTheDocument();
  });

  it("opens schedule modal on click", () => {
    render(<ScheduleButton onSchedule={vi.fn()} scheduled={false} />);
    fireEvent.click(screen.getByLabelText("schedule.scheduleMessage"));
    // Modal content visible
    expect(screen.getByText("schedule.confirmSchedule")).toBeInTheDocument();
    expect(
      screen.getByLabelText("schedule.cancelSchedule"),
    ).toBeInTheDocument();
  });

  it("shows active visual indicator when scheduled=true", () => {
    render(<ScheduleButton onSchedule={vi.fn()} scheduled={true} />);
    const button = screen.getByLabelText("schedule.scheduleMessage");
    expect(button.className).toContain("bg-[var(--accent)]/10");
  });

  it("does not show active indicator when scheduled=false", () => {
    render(<ScheduleButton onSchedule={vi.fn()} scheduled={false} />);
    const button = screen.getByLabelText("schedule.scheduleMessage");
    expect(button.className).not.toContain("bg-primary/10");
  });

  it("calls onSchedule with future timestamp on confirm", () => {
    const onSchedule = vi.fn();
    render(<ScheduleButton onSchedule={onSchedule} scheduled={false} />);
    fireEvent.click(screen.getByLabelText("schedule.scheduleMessage"));
    fireEvent.click(screen.getByText("schedule.confirmSchedule"));
    expect(onSchedule).toHaveBeenCalledTimes(1);
    expect(onSchedule.mock.calls[0][0]).toBeGreaterThan(Date.now());
  });
});
