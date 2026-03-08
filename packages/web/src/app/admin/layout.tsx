import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminNav } from "./components/admin-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/");

  const role = (session as any).role;
  if (role !== "admin") redirect("/dashboard");

  return (
    <>
      <AdminNav />
      <div className="max-w-7xl mx-auto px-6 py-8">{children}</div>
    </>
  );
}
