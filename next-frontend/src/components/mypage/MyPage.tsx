"use client";

import { useSelector } from "react-redux";
import { LuLeaf } from "react-icons/lu";
import type { RootState } from "@/store/store";
import ProfileForm from "./ProfileForm";
import AddressManager from "./AddressManager";
import MyRecords from "./MyRecords";

export default function MyPage() {
  const user = useSelector((state: RootState) => state.auth.user);
  if (!user) return null;
  return <div className="content-page mypage"><div className="profile-heading"><span className="profile-avatar"><LuLeaf /></span><div><span className="eyebrow">MY LITTLE FOOD JOURNEY</span><h1>{user.nickname}님의 산책</h1><p>취향을 다듬고, 맛있었던 순간을 모아보세요.</p></div></div><div className="profile-grid"><ProfileForm key={JSON.stringify(user)} user={user} /><AddressManager /></div><MyRecords /></div>;
}
