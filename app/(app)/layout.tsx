import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Topbar } from "@/components/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <>
      <Topbar />
      <main className="container">{children}</main>
    </>
  );
}
