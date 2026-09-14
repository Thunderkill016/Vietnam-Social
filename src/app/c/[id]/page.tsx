import { CommunityPage } from "@/components/community-page";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CommunityPage id={id} />;
}
