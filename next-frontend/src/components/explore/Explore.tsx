"use client";

import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import ReactMarkdown from "react-markdown";
import { LuArrowUp, LuCompass, LuHistory, LuLeaf, LuLocateFixed, LuMap, LuMapPin, LuPlus, LuSparkles, LuTrash2 } from "react-icons/lu";
import { api, deleteConversation, errorMessage, json } from "@/app/lib/api";
import useApiQuery from "@/app/lib/useApiQuery";
import { distanceLabel, money } from "@/app/lib/format";
import { hasCoordinates, locationSupported } from "@/app/lib/kakaoMap";
import type { Address, Conversation, ConversationSummary, Coordinates, MapLocation, PageResult } from "@/app/types/Service";
import type { RootState } from "@/store/store";
import { conversationDeleted, resetChat, setConversation, setInput, setPending } from "@/store/chatSlice";
import AddressMapPicker from "@/components/map/AddressMapPicker";
import Modal from "@/components/ui/Modal";
import { Empty, ErrorState, Loading, Pagination } from "@/components/ui/States";
import { useToast } from "@/components/ui/ToastProvider";
import RestaurantCard from "./RestaurantCard";
import RestaurantMap from "./RestaurantMap";

const suggestions = ["노원역 근처 조용한 데이트 식당", "상계동에서 혼밥하기 좋은 찌개집", "공릉동에서 4명이 6만 원 안으로 먹을 곳"];
const radiusRequest = /반경\s*(?:약\s*)?\d|\d\s*(?:km|㎞|킬로(?:미터)?|m|미터)\s*(?:이내|안|내|범위|반경)/i;
const currentLocationRequest = /(?:내|제|현재|현)\s*위치|(?:내|제)\s*주변/;
const chatRow = "mt-[.8rem] mb-[1.3rem] flex items-start gap-[.6rem]";
const chatBubble = "max-w-[88%] px-4 py-[.85rem] text-[.8rem] leading-[1.7] break-keep wrap-anywhere mobile:max-w-[87%] mobile:p-[.8rem] mobile:text-[.78rem]";
const assistantBubble = "rounded-[0_.9rem_.9rem_.9rem] bg-[#f1f3eb]";
const messageAvatar = "mt-[.2rem] grid size-[1.7rem] flex-none place-items-center rounded-[50%_50%_50%_18%] bg-forest text-[.9rem] text-white";
const thinkingDot = "size-1 animate-thinking rounded-full bg-forest";
const positionButton = "icon-button size-[30px] text-[1rem]";
type SearchLocation = MapLocation & { isDefault?: boolean };

function currentPosition() {
  return new Promise<MapLocation>((resolve, reject) => {
    if (!navigator.geolocation) { reject(); return; }
    navigator.geolocation.getCurrentPosition(({ coords: { latitude, longitude } }) => {
      const coordinates = { latitude, longitude };
      if (locationSupported(coordinates)) resolve({ ...coordinates, address: "현재 위치" });
      else reject();
    }, reject, { timeout: 10000, maximumAge: 60000 });
  });
}

async function savedPosition() {
  const addresses = await api<Address[]>("/api/me/addresses").catch(() => []);
  if (!Array.isArray(addresses)) return null;
  const address = addresses.find((item) => item.is_default && hasCoordinates(item)) || addresses.find(hasCoordinates);
  return address && hasCoordinates(address) ? { address: address.address, latitude: address.latitude, longitude: address.longitude, isDefault: address.is_default } : null;
}

export default function Explore() {
  const { active, input, pending } = useSelector((state: RootState) => state.chat);
  const user = useSelector((state: RootState) => state.auth.user);
  const dispatch = useDispatch();
  const toast = useToast();
  const [historyPage, setHistoryPage] = useState(1);
  const history = useApiQuery<PageResult<ConversationSummary>>("/api/conversations?page=" + historyPage);
  const [showHistory, setShowHistory] = useState(false);
  const [origin, setOrigin] = useState("");
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locationMessage, setLocationMessage] = useState("출발지를 입력하지 않으면 기본 주소를 추천에 활용해요.");
  const [locating, setLocating] = useState(false);
  const [opening, setOpening] = useState(false);
  const [mapRequest, setMapRequest] = useState<{ message?: string } | null>(null);
  const [removing, setRemoving] = useState<ConversationSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [mapSelection, setMapSelection] = useState<{ answer: number; id: number } | null>(null);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const resultsPanel = useRef<HTMLElement>(null);
  const mapArea = useRef<HTMLDivElement>(null);
  const answer = [...(active?.messages || [])].reverse().find((message) => message.role === "assistant");
  const answerId = answer?.id;
  const results = answer?.recommendations || [];
  const reviewedParams = new URLSearchParams(results.map((item) => ["ids", String(item.id)]));
  const { data: reviewedIds, reload: reloadReviewed } = useApiQuery<number[]>(results.length ? "/api/restaurants/reviewed?" + reviewedParams : null);
  const selected = mapSelection?.answer === answerId ? mapSelection : null;
  const busy = pending || locating || opening || deleting;
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [active?.messages.length, pending]);
  useEffect(() => { if (resultsPanel.current) resultsPanel.current.scrollTop = 0; }, [answerId]);
  useEffect(() => {
    if (!answerId) return;
    const refresh = () => reloadReviewed();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [answerId, reloadReviewed]);
  const setSearchPosition = (position: SearchLocation) => {
    if (position.isDefault) {
      setOrigin(""); setCoordinates(null);
      return;
    }
    setOrigin(position.address); setCoordinates({ latitude: position.latitude, longitude: position.longitude });
  };
  const locateWithFallback = async () => {
    try {
      const position = await currentPosition();
      setLocationMessage("현재 위치를 기준으로 직선거리를 계산합니다.");
      return position;
    } catch {
      const position = await savedPosition();
      setLocationMessage(position ? "현재 위치를 확인하지 못해 저장된 주소를 사용합니다." : "현재 위치를 확인하지 못했습니다. 지도에서 기준 위치를 선택하거나 동네·역명을 입력해 주세요.");
      return position;
    }
  };
  const send = async (value = input, chosen?: SearchLocation) => {
    const message = value.trim();
    if (!message || locked.current || pending) return;
    locked.current = true; setError("");
    try {
      const radius = radiusRequest.test(message);
      const wantsCurrent = currentLocationRequest.test(message) && (radius || !!active?.conditions.radius_metres);
      const needsPoint = radius && !coordinates && !origin.trim() && !active?.conditions.search_origin;
      let position = chosen;
      if (!position && (wantsCurrent || needsPoint)) {
        setLocating(true);
        position = (wantsCurrent ? await locateWithFallback() : !origin ? await savedPosition() : null) || undefined;
        if (!position) { dispatch(setInput(message)); setMapRequest({ message }); return; }
      }
      if (position) setSearchPosition(position);
      setLocating(false); dispatch(setPending(true)); dispatch(setInput(""));
      const point = position ? { latitude: position.latitude, longitude: position.longitude } : coordinates;
      const departure = position?.isDefault ? {} : { origin_text: position?.address || origin || null, ...point };
      const response = await api<Conversation>("/api/chat", json("POST", { message, conversation_id: active?.id || null, ...departure }));
      const previousMessages = new Map(active?.id === response.id ? active.messages.map((item) => [item.id, item]) : []);
      dispatch(setConversation({ ...response, messages: response.messages.map((item) => previousMessages.get(item.id) || item) }));
      history.reload();
    } catch (error) { setError(errorMessage(error)); dispatch(setInput(message)); }
    finally { locked.current = false; setLocating(false); dispatch(setPending(false)); }
  };
  const selectConversation = async (id: number) => {
    if (locked.current) return;
    locked.current = true; setOpening(true);
    try {
      const response = await api<Conversation>("/api/conversations/" + id);
      dispatch(setConversation(response)); setShowHistory(false); setError("");
      setOrigin(""); setCoordinates(null); setLocationMessage("");
    } catch (error) { toast(errorMessage(error)); }
    finally { locked.current = false; setOpening(false); }
  };
  const locate = async () => {
    if (locked.current) return;
    locked.current = true; setLocating(true);
    try {
      const position = await locateWithFallback();
      if (position) setSearchPosition(position);
      else setCoordinates(null);
    } finally { locked.current = false; setLocating(false); }
  };
  const remove = async (close: () => void) => {
    if (!removing || locked.current) return;
    locked.current = true; setDeleting(true); setDeleteError("");
    try {
      await deleteConversation(removing.id);
      dispatch(conversationDeleted(removing.id));
      if (historyPage > 1 && history.data?.items.length === 1) setHistoryPage(historyPage - 1);
      else history.reload();
      close(); toast("대화를 삭제했어요.");
    } catch (error) { setDeleteError(errorMessage(error)); }
    finally { locked.current = false; setDeleting(false); }
  };
  const conditions = active?.conditions;
  return (
    <div className="mx-auto max-w-[1504px] px-8 pt-[2.2rem] pb-8 compact:px-5 mobile:px-4 mobile:pt-[1.6rem]">
      <div className="mb-[1.7rem] flex items-center justify-between mobile:items-start mobile:gap-4 narrow:flex-wrap">
        <div>
          <span className="eyebrow mb-[.45rem] text-[.6rem] mobile:text-[.49rem] mobile:tracking-[.1em]">YOUR NEIGHBORHOOD TABLE</span>
          <h1 className="text-[1.65rem] mobile:text-[1.24rem]">오늘은 어떤 한 끼가 좋을까요?</h1>
          <p className="mt-[.6rem] text-[.8rem] text-muted mobile:max-w-56 mobile:text-[.71rem]">취향을 이야기하면, 동네의 새로운 맛을 함께 찾아드려요.</p>
        </div>
        <button className="button button-secondary hidden tablet:inline-flex mobile:mt-[.7rem] mobile:min-h-9 mobile:gap-[.3rem] mobile:px-[.6rem] mobile:pt-[.45rem] mobile:pb-[.45rem] mobile:text-[.68rem] narrow:mt-0" aria-expanded={showHistory} onClick={() => setShowHistory(!showHistory)}><LuHistory />산책 기록</button>
      </div>
      <div className="grid grid-cols-[185px_minmax(320px,1.1fr)_minmax(300px,1fr)] items-start gap-[1.4rem] compact:grid-cols-[155px_minmax(300px,1fr)_minmax(270px,1fr)] compact:gap-4 tablet:grid-cols-[minmax(320px,1.1fr)_minmax(280px,1fr)] mobile:grid-cols-1 mobile:gap-[1.4rem]">
        <aside className={"min-w-0 pt-[.15rem] " + (showHistory ? "tablet:col-span-full tablet:max-h-[350px] tablet:overflow-y-auto tablet:rounded-2xl tablet:border tablet:border-line tablet:bg-paper tablet:p-4 mobile:col-auto" : "tablet:hidden")}>
          <button className="button button-primary w-full p-[.8rem] text-[.8rem]" disabled={busy} onClick={() => { dispatch(resetChat()); setError(""); setShowHistory(false); }}><LuPlus />새로운 산책</button>
          <h2 className="mx-2 mt-[1.7rem] mb-[.8rem] flex items-center gap-2 text-[.75rem] text-muted"><LuHistory />지난 이야기</h2>
          {history.loading && <Loading />}
          {history.error && <ErrorState message={history.error} retry={history.reload} />}
          {history.data?.items.length === 0 && <p className="helper p-2">오늘의 첫 산책을 시작해 보세요.</p>}
          <div className="flex flex-col gap-1 tablet:grid tablet:grid-cols-3 mobile:grid-cols-2">
            {history.data?.items.map((item) => <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-[.12rem]" key={item.id}>
              <button className="flex min-w-0 items-center gap-[.55rem] rounded-lg px-[.6rem] py-[.7rem] text-left text-[.76rem] text-[#606e65] hover:bg-forest-soft hover:text-forest aria-pressed:bg-forest-soft aria-pressed:text-forest"
                      aria-pressed={active?.id === item.id} disabled={busy} onClick={() => selectConversation(item.id)}><LuMessageIcon /><span className="truncate">{item.title}</span></button>
              <button className="icon-button w-9 text-[.95rem] text-[#ae5945]" aria-label={item.title + " 대화 삭제"} disabled={busy} onClick={() => { setDeleteError(""); setRemoving(item); }}><LuTrash2 /></button>
            </div>)}
          </div>
          {history.data && <Pagination compact page={historyPage} pages={history.data.pages} onChange={setHistoryPage} />}
          <div className="mt-6 flex gap-[.6rem] border-t border-line px-2 py-6 text-[.67rem] text-[#879181] tablet:hidden"><LuLeaf /><p>검색 기록은 마이페이지에서도 관리할 수 있어요.</p></div>
        </aside>
        <section className="flex h-[735px] max-h-[max(680px,calc(100dvh-235px))] min-w-0 flex-col overflow-hidden rounded-[1.15rem] border border-line bg-paper shadow-surface mobile:h-[700px] mobile:max-h-none mobile:min-h-[620px] mobile:rounded-2xl" aria-label="AI와 맛집 탐색 대화">
          <div className="flex items-center gap-[.7rem] border-b border-[#ebede5] px-[1.3rem] py-[1.1rem] mobile:p-4">
            <span className="grid size-[2.3rem] flex-none place-items-center rounded-[50%_50%_50%_18%] bg-forest text-[1.2rem] text-white"><LuLeaf /></span>
            <div><h2 className="text-[.92rem]">맛집 산책 도우미</h2><p className="mt-1 text-[.7rem] leading-[1.45] text-muted">AI와 함께하는 동네 탐색</p></div>
            <span className="badge ml-auto">AI</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[1.1rem] py-[1.3rem] mobile:px-[.9rem] mobile:py-[1.1rem]" aria-live="polite">
            {!active?.messages.length && <div className="px-[.6rem] pt-6 pb-4 text-center mobile:px-2 mobile:pt-[1.3rem] mobile:pb-2">
              <span className="mx-auto mb-[1.3rem] grid size-[3.8rem] place-items-center rounded-full bg-[#f0f2e9] text-[2.1rem] text-forest shadow-[0_0_0_8px_#f7f7f1]"><LuCompass /></span>
              <span className="eyebrow text-[.68rem] tracking-[.02em]">반가워요, {user?.nickname}님</span>
              <h2 className="mt-[.65rem] mb-[.85rem] text-[1.75rem] leading-[1.55] text-forest-dark mobile:text-[1.6rem]">어떤 맛을<br />찾아 떠나볼까요?</h2>
              <p className="text-[.78rem] leading-[1.85] text-muted">동네, 음식, 예산을 편하게 이야기해 주세요.<br />필요한 조건은 제가 짧게 여쭤볼게요.</p>
              <div className="mt-[1.8rem] flex flex-col gap-2 mobile:mt-[1.4rem]">
                {suggestions.map((text) => <button className="flex items-center justify-between gap-2 rounded-[.7rem] border border-[#eeeede] bg-[#f7f6ef] px-[.9rem] py-[.8rem] text-left text-[.72rem] hover:bg-forest-soft mobile:text-[.7rem]" key={text} onClick={() => send(text)} disabled={busy}>
                  {text}<LuArrowUp className="rotate-45 text-coral" />
                </button>)}
              </div>
            </div>}
            {active?.messages.map((message) => <div key={message.id} className={chatRow + (message.role === "user" ? " justify-end" : "")}>
              {message.role === "assistant" && <span className={messageAvatar}><LuLeaf /></span>}
              <div className={chatBubble + " [&_p+p]:mt-[.7rem] [&_h3]:mt-[.85rem] [&_h3]:mb-1 [&_h3]:text-[.85rem] [&_h3]:text-forest-dark [&_ul]:pl-[1.4rem] [&_ol]:pl-[1.4rem] [&_a]:text-forest [&_a]:underline " + (message.role === "user" ? "rounded-[.9rem_0_.9rem_.9rem] bg-[#e7ede1] text-forest-dark" : assistantBubble)}>
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            </div>)}
            {pending && <div className={chatRow}>
              <span className={messageAvatar}><LuLeaf /></span>
              <div className={chatBubble + " " + assistantBubble + " flex flex-wrap items-center gap-1"} role="status">
                <span className={thinkingDot} /><span className={thinkingDot + " [animation-delay:.2s]"} /><span className={thinkingDot + " [animation-delay:.4s]"} />
                <small className="mt-[.3rem] block w-full text-[.65rem]">조건과 음식점 정보를 살펴보고 있어요.</small>
              </div>
            </div>}
            {error && <div className="inline-error" role="alert">{error}</div>}
            <div ref={bottom} />
          </div>
          {conditions && <div className="flex flex-wrap gap-[.3rem] px-4 pt-[.6rem]">{[conditions.area, conditions.cuisine, conditions.party_size ? conditions.party_size + "명" : null, conditions.budget_total ? "총 " + money(conditions.budget_total) : null, conditions.radius_metres ? "반경 " + distanceLabel(conditions.radius_metres) : null, conditions.atmosphere, conditions.purpose].filter(Boolean).map((value, i) => <span className="rounded-full bg-forest-soft px-[.6rem] py-[.2rem] text-[.65rem] text-forest" key={i}>{value}</span>)}</div>}
          <div data-chat-composer className="border-t border-[#f0f0e8] bg-paper px-4 pt-[.9rem] pb-[.85rem] mobile:p-[.8rem]">
            <div className="flex items-center gap-[.4rem] text-muted">
              <LuMapPin className="text-[.9rem]" />
              <input className="field border-0 bg-transparent px-[.2rem] pt-[.48rem] pb-[.38rem] text-[.76rem] mobile:px-[.2rem] mobile:pt-[.48rem] mobile:pb-[.38rem] mobile:text-[.875rem]" aria-label="출발지 또는 목적지" value={origin} maxLength={300} disabled={busy} onChange={(event) => { setOrigin(event.target.value); setCoordinates(null); setLocationMessage(""); }} placeholder="동네·역명·출발지 입력 (선택)" />
              <button type="button" className={positionButton} aria-label="지도에서 기준 위치 선택" disabled={busy} onClick={() => setMapRequest({})}><LuMap /></button>
              <button type="button" className={positionButton + " aria-pressed:bg-forest-soft aria-pressed:text-forest"} aria-pressed={!!coordinates} aria-label="현재 위치 사용" disabled={busy} onClick={locate}><LuLocateFixed /></button>
            </div>
            {locating && <p className="helper" role="status">검색 기준 위치를 확인하고 있습니다.</p>}
            {locationMessage && <p className="helper" role="status">{locationMessage}</p>}
            <form className="mt-[.55rem] flex items-end gap-2 rounded-[.8rem] border border-[#dde2d3] bg-[#f6f6ef] p-[.6rem]" onSubmit={(event) => { event.preventDefault(); send(); }}>
              <textarea className="field max-h-40 flex-1 resize-none border-0 bg-transparent px-[.3rem] pt-[.26rem] pb-[.18rem] text-[.83rem] leading-[1.55] focus:ring-0 mobile:px-[.3rem] mobile:pt-[.26rem] mobile:pb-[.18rem] mobile:text-[.875rem]" aria-label="맛집 탐색 요청" value={input} maxLength={2000} rows={2} onChange={(event) => dispatch(setInput(event.target.value))} placeholder="오늘 먹고 싶은 한 끼를 알려주세요."
                        onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} />
              <button className="grid size-[2.1rem] flex-none place-items-center rounded-[.6rem] bg-forest text-[1.1rem] text-white" type="submit" aria-label="메시지 보내기" disabled={busy || !input.trim()}><LuArrowUp /></button>
            </form>
            <p className="mt-[.6rem] text-center text-[.59rem] leading-[1.6] text-[#90958b] mobile:text-[.55rem]">검색은 방문 기록으로 저장되지 않아요. 음식점 정보와 가격은 방문 전 확인해 주세요.</p>
          </div>
        </section>
        <section ref={resultsPanel} className="max-h-[735px] min-w-0 overflow-y-auto overscroll-contain px-[.2rem] pb-[.2rem] mobile:max-h-none mobile:overflow-visible mobile:p-0" aria-label="추천 음식점">
          <div className="flex items-center justify-between px-[.1rem] pt-[.35rem] pb-[1.1rem] mobile:px-[.2rem] mobile:pt-[.2rem] mobile:pb-[.9rem]">
            <span className="flex items-center gap-[.45rem] text-[.86rem] font-[650] text-forest"><LuSparkles />이번 산책의 발견</span>
            <small className="text-[.68rem] text-muted">{results.length ? results.length + "곳" : "나만의 추천"}</small>
          </div>
          {conditions?.search_origin && conditions.radius_metres && <p className="mb-[.65rem] flex items-start gap-[.4rem] text-[.76rem] text-forest-dark"><LuMapPin className="mt-[.2rem]" /><span>기준 위치 <strong>{conditions.search_origin.label}</strong> · 직선거리 반경 {distanceLabel(conditions.radius_metres)}</span></p>}
          {results.length ? <>{pending && <p className="helper">새 조건을 확인하는 동안 이전 추천을 표시합니다.</p>}{answerId && results.some(hasCoordinates) && <div ref={mapArea}><RestaurantMap answerId={answerId} restaurants={results} selected={selected} onSelect={setMapSelection} /></div>}{results.map((item, index) => <RestaurantCard key={item.id} restaurant={item} index={index} reviewed={reviewedIds?.includes(item.id)} selected={selected?.id === item.id} onSelect={answerId && hasCoordinates(item) ? () => {
            setMapSelection({ answer: answerId, id: item.id });
            mapArea.current?.scrollIntoView({ block: "nearest" });
          } : undefined} />)}</> : <div className="min-h-[340px] rounded-[1.1rem] border border-dashed border-[#d5ddcf] bg-[#eef0e66b] px-2 py-6 mobile:min-h-[280px]">
            <Empty compact title="당신의 한 끼를 기다려요" text="대화를 시작하면 조건에 맞는 음식점을 여기에 모아드릴게요." />
            <div className="m-auto grid size-14 place-items-center rounded-full border border-[#cfd8c5] text-[1.5rem] text-[#9cae91] shadow-[0_0_0_6px_#e7ebdf]"><LuUtensilsIcon /></div>
          </div>}
          <p className="mx-[.35rem] mt-[.9rem] text-[.65rem] leading-[1.8] text-[#899080] mobile:text-[.66rem]">실시간 영업·대기, 결제 추정액, 재방문율, 외부 방문 인증은 미연동 상태입니다.</p>
        </section>
      </div>
      {mapRequest && <Modal title="지도에서 검색 기준 위치 선택" wide onClose={() => setMapRequest(null)}>{(close) => <SearchPosition onSelect={(position) => {
        close(); setLocationMessage("지도에서 선택한 위치를 기준으로 직선거리를 계산합니다.");
        if (mapRequest.message) void send(mapRequest.message, position);
        else setSearchPosition(position);
      }} />}</Modal>}
      {removing && <Modal title="대화를 삭제할까요?" busy={deleting} onClose={() => setRemoving(null)}>{(close) => <><p className="my-4 text-[.9rem] text-muted">이 대화의 메시지와 검색 기록이 함께 삭제됩니다.</p>{deleteError && <p className="inline-error" role="alert">{deleteError}</p>}<div className="form-actions mt-6"><button className="button button-secondary" disabled={deleting} onClick={close}>취소</button><button className="button button-danger" disabled={deleting} onClick={() => remove(close)}>{deleting ? "삭제 중…" : "삭제하기"}</button></div></>}</Modal>}
    </div>
  );
}

function SearchPosition({ onSelect }: { onSelect: (location: MapLocation) => void }) {
  const [location, setLocation] = useState<MapLocation | null>(null);
  return <div className="form-stack">
    <AddressMapPicker initial={null} location={location} onChange={setLocation} />
    <button type="button" className="button button-primary" disabled={!location} onClick={() => { if (location) onSelect(location); }}>이 위치에서 검색</button>
  </div>;
}

function LuMessageIcon() { return <LuSparkles size={15} />; }
function LuUtensilsIcon() { return <LuLeaf />; }
