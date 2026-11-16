import { Suspense } from "react";
import PostRoute from "@/components/community/PostRoute";
import { Loading } from "@/components/ui/States";

export default function Page() {
  return (
    <Suspense fallback={<Loading/>}>
      <PostRoute/>
    </Suspense>
  );
}
