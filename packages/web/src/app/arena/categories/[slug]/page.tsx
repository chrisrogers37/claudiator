import { redirect } from "next/navigation";

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/arena/leaderboard?expand=${slug}`);
}
