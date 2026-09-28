import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "./Composer";

function setup(overrides: Partial<Parameters<typeof Composer>[0]> = {}) {
  const props = {
    onSend: vi.fn(),
    onStop: vi.fn(),
    pending: false,
    enterToSend: true,
    memoryOn: true,
    onToggleMemory: vi.fn(),
    ...overrides,
  };
  render(<Composer {...props} />);
  return { props, box: screen.getByRole("textbox", { name: "Message LearnLoop" }) };
}

describe("Composer", () => {
  it("sends with Enter and clears the box", async () => {
    const { props, box } = setup();

    await userEvent.type(box, "What is a list?{Enter}");

    expect(props.onSend).toHaveBeenCalledWith("What is a list?");
    expect(box).toHaveValue("");
  });

  it("adds a new line with Shift + Enter instead of sending", async () => {
    const { props, box } = setup();

    await userEvent.type(box, "line one{Shift>}{Enter}{/Shift}line two");

    expect(props.onSend).not.toHaveBeenCalled();
    expect(box).toHaveValue("line one\nline two");
  });

  it("uses Ctrl + Enter when Enter-to-send is off", async () => {
    const { props, box } = setup({ enterToSend: false });

    await userEvent.type(box, "hello{Enter}");
    expect(props.onSend).not.toHaveBeenCalled();

    await userEvent.type(box, "{Control>}{Enter}{/Control}");
    expect(props.onSend).toHaveBeenCalledWith("hello\n");
  });

  it("can't send an empty message", () => {
    setup();

    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("turns Send into Stop while the tutor is answering", async () => {
    const { props } = setup({ pending: true });

    await userEvent.click(screen.getByRole("button", { name: "Stop answering" }));

    expect(props.onStop).toHaveBeenCalled();
  });
});
