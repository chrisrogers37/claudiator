import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/admin-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/");
  if (!(session as any).isAdmin) redirect("/dashboard");

  return (
    <div className="flex min-h-screen bg-[#0d1117]">
      <AdminNav />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
