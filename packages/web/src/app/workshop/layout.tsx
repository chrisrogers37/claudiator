import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";

export default async function WorkshopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/");

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-200">
      <Nav />
      <div className="max-w-7xl mx-auto px-6 py-8">{children}</div>
    </div>
  );
}
