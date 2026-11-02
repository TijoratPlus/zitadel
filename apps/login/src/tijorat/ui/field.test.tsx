import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { TjField } from "./field";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

afterEach(() => {
  cleanup();
});

describe("TjField revealable", () => {
  test("the eye button shows and hides the password", () => {
    render(<TjField label="Пароль" type="password" revealable />);
    const input = screen.getByLabelText("Пароль");
    expect(input).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "showPassword" }));
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "hidePassword" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "hidePassword" }));
    expect(input).toHaveAttribute("type", "password");
  });

  test("toggling does not submit the form", () => {
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    render(
      <form onSubmit={onSubmit as any}>
        <TjField label="Пароль" type="password" revealable />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "showPassword" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("no button without revealable or on non-password fields", () => {
    render(
      <>
        <TjField label="Пароль" type="password" />
        <TjField label="Email" type="email" revealable />
      </>,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});
