"use client";

import { useSearchParams } from "next/navigation";
import { ErrorState } from "@/components/ui/States";
import PostDetail from "./PostDetail";

export default function PostRoute({ edit = false }: { edit?: boolean }) {
  const id = useSearchParams().get("id");
  if (!id || !/^[1-9]\d*$/.test(id))
    return <ErrorState message="이야기를 찾을 수 없습니다."/>;
  return <PostDetail key={id} id={id} edit={edit}/>;
}
