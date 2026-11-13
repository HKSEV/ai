"use client";

import Link from "next/link";
import { useSelector } from "react-redux";
import { LuArrowUpRight, LuLeaf } from "react-icons/lu";
import type { RootState } from "@/store/store";
import ProfileForm from "./ProfileForm";
import AddressManager from "./AddressManager";
import MyRecords from "./MyRecords";

export default function MyPage() {
  const user = useSelector((state: RootState) => state.auth.user);
  if (!user) return null;
  return (
    <div className="content-page">
      <div className="mb-10 flex items-center gap-6 mobile:mb-[1.6rem] mobile:items-start mobile:gap-4">
        <span className="grid size-20 flex-none place-items-center rounded-[50%_50%_50%_18%] bg-forest-soft text-[2.3rem] text-forest mobile:size-14 mobile:text-[1.8rem]"><LuLeaf /></span>
        <div>
          <span className="eyebrow text-[.65rem] mobile:text-[.5rem]">MY LITTLE FOOD JOURNEY</span>
          <h1 className="my-[.4rem] text-[1.85rem] wrap-anywhere mobile:text-[1.35rem]">{user.nickname}님의 산책</h1>
          <p className="text-[.82rem] text-muted mobile:text-[.72rem]">취향을 다듬고, 맛있었던 순간을 모아보세요.</p>
          {user.role === "ADMIN" && <nav className="mt-3" aria-label="계정 메뉴">
            <Link className="button button-secondary button-small" href="/admin"><LuArrowUpRight />관리자 페이지</Link>
          </nav>}
        </div>
      </div>
      <div className="grid grid-cols-2 items-start gap-6 tablet:gap-4 mobile:grid-cols-1 mobile:gap-[1.2rem]">
        <ProfileForm key={JSON.stringify(user)} user={user} /><AddressManager />
      </div>
      <MyRecords />
    </div>
  );
}
