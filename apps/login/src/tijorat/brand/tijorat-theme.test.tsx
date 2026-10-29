import { DynamicTheme } from "@/components/dynamic-theme";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { TijoratTheme } from "./tijorat-theme";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

describe("TijoratTheme", () => {
  test("side by side: brand panel next to title and form", () => {
    render(
      <TijoratTheme isSideBySide>
        <h1>Title</h1>
        <form aria-label="login" />
      </TijoratTheme>,
    );

    expect(screen.getByText("brand.tagline")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "login" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Tijorat+" })).toHaveClass("text-white");
  });

  test("stacked: logo above the card, no brand panel", () => {
    render(
      <TijoratTheme isSideBySide={false}>
        <h1>Title</h1>
        <form aria-label="login" />
      </TijoratTheme>,
    );

    expect(screen.queryByText("brand.tagline")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Tijorat+" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "login" })).toBeInTheDocument();
  });

  test("uses logos from the branding settings when present", () => {
    render(
      <TijoratTheme isSideBySide={false} branding={{ lightTheme: { logoUrl: "https://cdn/light.svg" } } as any}>
        <form aria-label="login" />
      </TijoratTheme>,
    );

    expect(screen.getByAltText("logo")).toHaveAttribute("src", "https://cdn/light.svg");
  });
});

describe("DynamicTheme hook", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

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
