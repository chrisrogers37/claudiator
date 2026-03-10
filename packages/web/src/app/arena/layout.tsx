import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ArenaNav } from "./components/arena-nav";

export default async function ArenaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/");

  return (
    <>
      <ArenaNav />
      <div className="max-w-5xl mx-auto px-6 py-8">{children}</div>
    </>
  );
}
