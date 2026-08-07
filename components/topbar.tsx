import { auth } from "@/auth";
import { Brand } from "./brand";
import { TopbarNav } from "./topbar-nav";
import { SignOutButton } from "./sign-out-button";

export async function Topbar() {
  const session = await auth();
  const email = session?.user?.email ?? "";

  return (
    <header className="topbar">
      <Brand href="/" />
      <TopbarNav />
      <div className="topbar-user">
        <span>{email}</span>
        <SignOutButton />
      </div>
    </header>
  );
}
