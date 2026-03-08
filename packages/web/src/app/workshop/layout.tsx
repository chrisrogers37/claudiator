import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function WorkshopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/");

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">{children}</div>
  );
}
