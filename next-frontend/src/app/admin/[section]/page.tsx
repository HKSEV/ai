import { notFound } from "next/navigation";
import PostManager from "@/components/admin/PostManager";
import PromptManager from "@/components/admin/PromptManager";
import RestaurantManager from "@/components/admin/RestaurantManager";
import UserManager from "@/components/admin/UserManager";

const pages = {
  ai: PromptManager,
  users: UserManager,
  restaurants: RestaurantManager,
  posts: PostManager
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(pages).map((section) => ({ section }));
}

export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!Object.hasOwn(pages, section)) notFound();
  const Section = pages[section as keyof typeof pages];
  return <Section/>;
}
