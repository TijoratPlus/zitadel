import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { TijoratSignUpForm } from "./sign-up-form";

const registerUser = vi.fn();
const push = vi.fn();

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "ru" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/lib/server/register", () => ({ registerUser: (...a: unknown[]) => registerUser(...a) }));

const complexity = {
  minLength: BigInt(8),
  requiresUppercase: true,
  requiresLowercase: true,
  requiresNumber: true,
  requiresSymbol: false,
} as any;

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TijoratSignUpForm", () => {
  test("registers with a password on one screen, without a passkey/password choice", async () => {
    registerUser.mockResolvedValue({ redirect: "/passkey/offer?sessionId=s1" });
    render(
      <TijoratSignUpForm
        legal={{} as any}
        passwordComplexitySettings={complexity}
        organization="org-1"
        requestId="oidc_1"
      />,
    );

    expect(screen.queryByRole("radio")).toBeNull();
    const submit = screen.getByTestId("submit-button");
    expect(submit).toBeDisabled();

    fill("labels.firstname", "Азиз");
    fill("labels.lastname", "Каримов");
    fill("labels.email", "aziz@tijorat.tj");
    fill("password.labels.password", "Kassa2026");
    fill("password.labels.confirmPassword", "Kassa2026");

    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    await waitFor(() =>
      expect(registerUser).toHaveBeenCalledWith({
        email: "aziz@tijorat.tj",
        firstName: "Азиз",
        lastName: "Каримов",
        organization: "org-1",
        requestId: "oidc_1",
        password: "Kassa2026",
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/passkey/offer?sessionId=s1"));
  });

  test("stays disabled while the password breaks the policy or the confirmation differs", async () => {
    render(<TijoratSignUpForm legal={{} as any} passwordComplexitySettings={complexity} organization="org-1" />);
    fill("labels.firstname", "Азиз");
    fill("labels.lastname", "Каримов");
    fill("labels.email", "aziz@tijorat.tj");
    fill("password.labels.password", "short");
    fill("password.labels.confirmPassword", "short");
    await waitFor(() => expect(screen.getByTestId("submit-button")).toBeDisabled());

    fill("password.labels.password", "Kassa2026");
    fill("password.labels.confirmPassword", "Kassa2027");
    await waitFor(() => expect(screen.getByTestId("submit-button")).toBeDisabled());
  });

  test("requires accepting the terms when the instance has them", async () => {
    render(
      <TijoratSignUpForm
        legal={{ tosLink: "https://tijorat.plus/terms", privacyPolicyLink: "https://tijorat.plus/privacy" } as any}
        passwordComplexitySettings={complexity}
        organization="org-1"
      />,
    );
    fill("labels.firstname", "Азиз");
    fill("labels.lastname", "Каримов");
    fill("labels.email", "aziz@tijorat.tj");
    fill("password.labels.password", "Kassa2026");
    fill("password.labels.confirmPassword", "Kassa2026");
    await waitFor(() => expect(screen.getByTestId("submit-button")).toBeDisabled());

    for (const checkbox of screen.getAllByRole("checkbox")) {
      fireEvent.click(checkbox);
    }
    await waitFor(() => expect(screen.getByTestId("submit-button")).toBeEnabled());
  });
});
