// Tijorat+ fork: "My account" (src/tijorat/account, TIJORAT_FORK.md).
import { loadAccountData } from "@/tijorat/account/data";
import { AccountPage } from "@/tijorat/account/ui/account-page";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page() {
  const result = await loadAccountData();
  if (result.kind === "signedOut") {
    redirect("/loginname");
  }
  if (result.kind === "mfaRequired") {
    // the login's second-factor check; on success it returns here via DEFAULT_REDIRECT_URI
    redirect("/mfa?" + new URLSearchParams(result.params));
  }
  return <AccountPage data={result.data} />;
}
