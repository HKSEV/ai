"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LuArrowLeft, LuImagePlus, LuX } from "react-icons/lu";
import { api, errorMessage, json } from "@/app/lib/api";
import { today } from "@/app/lib/format";
import useApiQuery from "@/app/lib/useApiQuery";
import type {
  PageResult,
  Post,
  RestaurantChoice,
  UploadedFile,
  Visit
} from "@/app/types/Service";
import RestaurantSelect from "@/components/ui/RestaurantSelect";
import { useToast } from "@/components/ui/ToastProvider";

export default function PostForm({ initial }: { initial?: Post }) {
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState<Post["kind"]>(initial?.kind || "experience");
  const [title, setTitle] = useState(initial?.title || "");
  const [content, setContent] = useState(initial?.content || "");
  const [restaurant, setRestaurant] = useState<RestaurantChoice | null>(
    initial?.restaurant_id
      ? { id: initial.restaurant_id, name: initial.restaurant_name || "선택된 음식점" }
      : null
  );
  const [rating, setRating] = useState(initial?.rating || 5);
  const [date, setDate] = useState(initial?.visited_on || today());
  const [visitId, setVisitId] = useState(initial?.visit_id?.toString() || "");
  const [photos, setPhotos] = useState<string[]>(initial?.photo_ids || []);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const visits = useApiQuery<PageResult<Visit>>(
    kind === "review" ? "/api/me/visits?size=30" : null
  );
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    if (photos.length + files.length > 4) {
      setError("사진은 최대 4장까지 첨부할 수 있어요.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const response = await api<UploadedFile>("/api/uploads?kind=photo", {
          method: "POST",
          body: form
        });
        setPhotos((previous) => [...previous, response.id]);
      }
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setUploading(false);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || uploading) return;
    if (kind === "review" && !restaurant) {
      setError("검색 결과에서 음식점을 선택해 주세요.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await api<Post>(
        initial ? "/api/posts/" + initial.id : "/api/posts",
        json(initial ? "PUT" : "POST", {
          kind,
          title,
          content,
          photo_ids: photos,
          restaurant_id: kind === "review" ? restaurant?.id : null,
          rating: kind === "review" ? rating : null,
          visited_on: kind === "review" ? date : null,
          visit_id: kind === "review" && visitId ? Number(visitId) : null
        })
      );
      toast(initial ? "이야기를 수정했어요." : "이야기를 남겼어요.");
      router.push("/community/" + response.id);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="post-page">
      <Link
        className="back-link"
        href={initial ? "/community/" + initial.id : "/community"}>
        <LuArrowLeft/>
        이야기로 돌아가기
      </Link>
      <div className="mb-8">
        <span className="eyebrow mb-[.7rem]">SHARE YOUR TABLE</span>
        <h1 className="text-[1.7rem] mobile:text-[1.4rem]">
          {initial ? "이야기 다듬기" : "나누고 싶은 한 끼가 있나요?"}
        </h1>
        <p className="mt-[.6rem] text-[.86rem] text-muted">
          직접 경험한 이야기가 이웃에게 좋은 발견이 됩니다.
        </p>
      </div>
      <form
        className="surface form-stack p-8 tablet:p-8 mobile:p-[1.2rem]"
        onSubmit={submit}>
        <fieldset>
          <legend>이야기 유형</legend>
          <div className="grid grid-cols-2 gap-[.8rem] mobile:gap-[.6rem]">
            {(
              [
                ["experience", "서비스 사용 후기", "탐색하면서 느낀 점을 나눠요"],
                ["review", "음식점 리뷰", "직접 방문한 식당을 소개해요"]
              ] as const
            ).map(([value, title, description]) => (
              <button
                type="button"
                key={value}
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
                className="rounded-xl border border-line p-4 text-left text-[.9rem]
                font-[650] aria-pressed:border-[#8da283] aria-pressed:bg-forest-soft
                aria-pressed:text-forest mobile:p-[.8rem] mobile:text-[.78rem]">
                {title}
                <small
                  className="mt-1 block text-[.69rem] text-muted
                mobile:text-[.62rem]">
                  {description}
                </small>
              </button>
            ))}
          </div>
        </fieldset>
        {kind === "review" && (
          <div
            className="flex flex-col gap-4 rounded-[.8rem] bg-[#f5f5ed] p-[1.4rem]
          mobile:p-4">
            <RestaurantSelect
              value={restaurant}
              onChange={(choice) => {
                setRestaurant(choice);
                setVisitId("");
              }}
            />
            <div className="two-fields">
              <label>
                별점
                <select
                  className="field"
                  value={rating}
                  onChange={(event) => setRating(Number(event.target.value))}>
                  {[5, 4, 3, 2, 1].map((value) => (
                    <option value={value} key={value}>
                      {"★".repeat(value)} ({value}점)
                    </option>
                  ))}
                </select>
              </label>
              <label>
                방문일
                <input
                  className="field"
                  type="date"
                  required
                  max={today()}
                  value={date}
                  onChange={(event) => {
                    setDate(event.target.value);
                    setVisitId("");
                  }}
                />
              </label>
            </div>
            <label>
              방문 기록 연결 (선택)
              <select
                className="field"
                value={visitId}
                onChange={(event) => {
                  const visit = visits.data?.items.find(
                    (item) => String(item.id) === event.target.value
                  );
                  setVisitId(event.target.value);
                  if (visit) {
                    setRestaurant({
                      id: visit.restaurant_id,
                      name: visit.restaurant_name
                    });
                    setDate(visit.visited_on);
                  }
                }}>
                <option value="">연결하지 않음</option>
                {visits.data?.items.map((visit) => (
                  <option key={visit.id} value={visit.id}>
                    {visit.restaurant_name} · {visit.visited_on}
                  </option>
                ))}
              </select>
            </label>
            <p className="helper">
              영수증 첨부와 방문 인증 완료는 구분됩니다. 검증 절차가 완료된 경우에만
              인증 표시가 붙어요.
            </p>
          </div>
        )}
        <label>
          제목
          <input
            className="field"
            value={title}
            minLength={2}
            maxLength={100}
            required
            onChange={(event) => setTitle(event.target.value)}
            placeholder="이야기에 어울리는 제목을 적어주세요"
          />
        </label>
        <label>
          이야기
          <textarea
            className="field leading-[1.65]"
            value={content}
            minLength={10}
            maxLength={10000}
            rows={9}
            required
            onChange={(event) => setContent(event.target.value)}
            placeholder="10자 이상으로 편하게 이야기해 주세요."
          />
          <span className="text-right text-[.65rem] font-normal text-muted">
            {content.length.toLocaleString()} / 10,000
          </span>
        </label>
        <div>
          <div className="section-heading">
            <h3 className="mobile:text-[.84rem]">
              사진 첨부 <small className="mobile:text-[.6rem]">(선택 · 최대 4장)</small>
            </h3>
            <label
              className="button button-secondary button-small cursor-pointer
            flex-row mobile:px-[.7rem] mobile:pt-[.45rem] mobile:pb-[.45rem]">
              <LuImagePlus/>
              {uploading ? "업로드 중…" : "사진 선택"}
              <input
                className="hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={uploading || photos.length >= 4}
                onChange={(event) => {
                  upload(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          <p className="helper">
            JPG·PNG·WebP, 파일당 5MB 이하 · 영수증은 마이페이지에서 비공개로 첨부해
            주세요.
          </p>
          <div className="mt-[.8rem] flex flex-wrap items-center gap-2">
            {photos.map((id, i) => (
              <span className="attachment" key={id}>
                사진 {i + 1}
                <button
                  className="inline-grid place-items-center p-[.3rem] text-[.75rem]
                  text-coral"
                  type="button"
                  aria-label={"사진 " + (i + 1) + " 제거"}
                  onClick={() => setPhotos(photos.filter((value) => value !== id))}>
                  <LuX/>
                </button>
              </span>
            ))}
          </div>
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Link className="button button-secondary" href="/community">
            취소
          </Link>
          <button
            className="button button-primary"
            type="submit"
            disabled={pending || uploading}>
            {pending ? "저장 중…" : initial ? "수정하기" : "이야기 남기기"}
          </button>
        </div>
      </form>
    </div>
  );
}
