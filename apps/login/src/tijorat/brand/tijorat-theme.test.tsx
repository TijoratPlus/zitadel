import { DynamicTheme } from "@/components/dynamic-theme";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { TijoratTheme } from "./tijorat-theme";

const setLanguageCookie = vi.fn();
const refresh = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "ru",
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

vi.mock("@/lib/cookies", () => ({
  setLanguageCookie: (...args: unknown[]) => setLanguageCookie(...args),
}));

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("TijoratTheme", () => {
  test("full-screen split: brand panel, title block and form, no card", () => {
    const { container } = render(
      <TijoratTheme>
        <h1>Title</h1>
        <form aria-label="login" />
      </TijoratTheme>,
    );

    expect(screen.getByText("brand.tagline")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "login" })).toBeInTheDocument();
    expect(container.querySelector(".tj-auth")).toHaveClass("min-h-screen", "lg:grid-cols-2");
    // No card around the form: it sits directly in the right column.
    expect(screen.getByRole("form", { name: "login" }).closest("main > div")).toHaveClass("max-w-sm");
  });

  test("a single child is the form", () => {
    const { container } = render(
      <TijoratTheme>
        <form aria-label="login" />
      </TijoratTheme>,
    );
    expect(container.querySelector(".tj-auth-title")).toBeNull();
    expect(screen.getByRole("form", { name: "login" })).toBeInTheDocument();
  });

  test("uses logos from the branding settings when present", () => {
    render(
      <TijoratTheme branding={{ lightTheme: { logoUrl: "https://cdn/light.svg" } } as any}>
        <form aria-label="login" />
      </TijoratTheme>,
    );
    expect(screen.getByAltText("logo")).toHaveAttribute("src", "https://cdn/light.svg");
  });

  test("language pills offer the four Tijorat+ languages and switch the locale", async () => {
    render(
      <TijoratTheme>
        <form aria-label="login" />
      </TijoratTheme>,
    );

    const pills = screen.getAllByRole("radio");
    expect(pills.map((p) => p.textContent)).toEqual(["RU", "TJ", "UZ", "EN"]);
    expect(screen.getByRole("radio", { name: "RU" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("radio", { name: "TJ" }));
    await waitFor(() => expect(setLanguageCookie).toHaveBeenCalledWith("tg"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});

describe("DynamicTheme hook", () => {
  test("renders the upstream layout when the brand is off", () => {
    vi.stubEnv("NEXT_PUBLIC_TIJORAT_BRAND", "");
    render(
      <DynamicTheme>
        <h1>Title</h1>
        <form aria-label="login" />
      </DynamicTheme>,
    );
    expect(document.querySelector(".tj-auth")).toBeNull();
  });

  test("renders the Tijorat+ layout when the brand is on", () => {
    vi.stubEnv("NEXT_PUBLIC_TIJORAT_BRAND", "true");
    render(
      <DynamicTheme>
        <h1>Title</h1>
        <form aria-label="login" />
      </DynamicTheme>,
    );
    expect(document.querySelector(".tj-auth")).not.toBeNull();
  });
});
