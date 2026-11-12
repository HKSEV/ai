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
    <div className="explore-page">
      <div className="page-heading explore-heading"><div><span className="eyebrow">YOUR NEIGHBORHOOD TABLE</span><h1>오늘은 어떤 한 끼가 좋을까요?</h1><p>취향을 이야기하면, 동네의 새로운 맛을 함께 찾아드려요.</p></div><button className="button secondary history-toggle" onClick={() => setShowHistory(!showHistory)}><LuHistory />산책 기록</button></div>
      <div className="explore-grid">
        <aside className={"conversation-sidebar " + (showHistory ? "is-open" : "")}>
          <button className="button primary full" disabled={busy} onClick={() => { dispatch(resetChat()); setError(""); setShowHistory(false); }}><LuPlus />새로운 산책</button>
          <h2><LuHistory />지난 이야기</h2>
          {history.loading && <Loading />}
          {history.error && <ErrorState message={history.error} retry={history.reload} />}
          {history.data?.items.length === 0 && <p className="helper sidebar-empty">오늘의 첫 산책을 시작해 보세요.</p>}
          <div className="conversation-list">{history.data?.items.map((item) => <div className="conversation-item" key={item.id}><button className={"conversation-open " + (active?.id === item.id ? "active" : "")} disabled={busy} onClick={() => selectConversation(item.id)}><LuMessageIcon /><span>{item.title}</span></button><button className="icon-button danger-text" aria-label={item.title + " 대화 삭제"} disabled={busy} onClick={() => { setDeleteError(""); setRemoving(item); }}><LuTrash2 /></button></div>)}</div>
          {history.data && <Pagination page={historyPage} pages={history.data.pages} onChange={setHistoryPage} />}
          <div className="sidebar-note"><LuLeaf /><p>검색 기록은 마이페이지에서도 관리할 수 있어요.</p></div>
        </aside>
        <section className="chat-panel" aria-label="AI와 맛집 탐색 대화">
          <div className="chat-title"><span className="assistant-avatar"><LuLeaf /></span><div><h2>맛집 산책 도우미</h2><p>AI와 함께하는 동네 탐색</p></div><span className="badge">AI</span></div>
          <div className="chat-messages" aria-live="polite">
            {!active?.messages.length && <div className="chat-welcome"><span className="welcome-symbol"><LuCompass /></span><span className="eyebrow">반가워요, {user?.nickname}님</span><h2>어떤 맛을<br />찾아 떠나볼까요?</h2><p>동네, 음식, 예산을 편하게 이야기해 주세요.<br />필요한 조건은 제가 짧게 여쭤볼게요.</p><div className="suggestions">{suggestions.map((text) => <button key={text} onClick={() => send(text)} disabled={busy}>{text}<LuArrowUp /></button>)}</div></div>}
            {active?.messages.map((message) => <div key={message.id} className={"chat-row " + message.role}>{message.role === "assistant" && <span className="message-avatar"><LuLeaf /></span>}<div className="message-bubble"><ReactMarkdown>{message.content}</ReactMarkdown></div></div>)}
            {pending && <div className="chat-row assistant"><span className="message-avatar"><LuLeaf /></span><div className="message-bubble thinking" role="status"><span /><span /><span /><small>조건과 음식점 정보를 살펴보고 있어요.</small></div></div>}
            {error && <div className="inline-error" role="alert">{error}</div>}
            <div ref={bottom} />
          </div>
          {conditions && <div className="condition-chips">{[conditions.area, conditions.cuisine, conditions.party_size ? conditions.party_size + "명" : null, conditions.budget_total ? "총 " + money(conditions.budget_total) : null, conditions.radius_metres ? "반경 " + distanceLabel(conditions.radius_metres) : null, conditions.atmosphere, conditions.purpose].filter(Boolean).map((value, i) => <span key={i}>{value}</span>)}</div>}
          <div className="chat-compose">
            <div className="origin-field"><LuMapPin /><input aria-label="출발지 또는 목적지" value={origin} maxLength={300} disabled={busy} onChange={(event) => { setOrigin(event.target.value); setCoordinates(null); setLocationMessage(""); }} placeholder="동네·역명·출발지 입력 (선택)" /><button type="button" className="icon-button" aria-label="지도에서 기준 위치 선택" disabled={busy} onClick={() => setMapRequest({})}><LuMap /></button><button type="button" className={"icon-button " + (coordinates ? "selected" : "")} aria-label="현재 위치 사용" disabled={busy} onClick={locate}><LuLocateFixed /></button></div>
            {locating && <p className="helper" role="status">검색 기준 위치를 확인하고 있습니다.</p>}
            {locationMessage && <p className="helper" role="status">{locationMessage}</p>}
            <form className="message-form" onSubmit={(event) => { event.preventDefault(); send(); }}>
              <textarea aria-label="맛집 탐색 요청" value={input} maxLength={2000} rows={2} onChange={(event) => dispatch(setInput(event.target.value))} placeholder="오늘 먹고 싶은 한 끼를 알려주세요."
                        onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} />
              <button className="send-button" type="submit" aria-label="메시지 보내기" disabled={busy || !input.trim()}><LuArrowUp /></button>
            </form>
            <p className="compose-note">검색은 방문 기록으로 저장되지 않아요. 음식점 정보와 가격은 방문 전 확인해 주세요.</p>
          </div>
        </section>
        <section ref={resultsPanel} className="results-panel" aria-label="추천 음식점"><div className="results-title"><span><LuSparkles />이번 산책의 발견</span><small>{results.length ? results.length + "곳" : "나만의 추천"}</small></div>
          {conditions?.search_origin && conditions.radius_metres && <p className="search-origin-summary"><LuMapPin /><span>기준 위치 <strong>{conditions.search_origin.label}</strong> · 직선거리 반경 {distanceLabel(conditions.radius_metres)}</span></p>}
          {results.length ? <>{pending && <p className="helper">새 조건을 확인하는 동안 이전 추천을 표시합니다.</p>}{answerId && results.some(hasCoordinates) && <div ref={mapArea}><RestaurantMap answerId={answerId} restaurants={results} selected={selected} onSelect={setMapSelection} /></div>}{results.map((item, index) => <RestaurantCard key={item.id} restaurant={item} index={index} reviewed={reviewedIds?.includes(item.id)} selected={selected?.id === item.id} onSelect={answerId && hasCoordinates(item) ? () => {
            setMapSelection({ answer: answerId, id: item.id });
            mapArea.current?.scrollIntoView({ block: "nearest" });
          } : undefined} />)}</> : <div className="results-empty"><Empty title="당신의 한 끼를 기다려요" text="대화를 시작하면 조건에 맞는 음식점을 여기에 모아드릴게요." /><div className="tiny-plate"><LuUtensilsIcon /></div></div>}
          <p className="data-note">실시간 영업·대기, 결제 추정액, 재방문율, 외부 방문 인증은 미연동 상태입니다.</p>
        </section>
      </div>
      {mapRequest && <Modal title="지도에서 검색 기준 위치 선택" wide onClose={() => setMapRequest(null)}>{(close) => <SearchPosition onSelect={(position) => {
        close(); setLocationMessage("지도에서 선택한 위치를 기준으로 직선거리를 계산합니다.");
        if (mapRequest.message) void send(mapRequest.message, position);
        else setSearchPosition(position);
      }} />}</Modal>}
      {removing && <Modal title="대화를 삭제할까요?" busy={deleting} onClose={() => setRemoving(null)}>{(close) => <><p>이 대화의 메시지와 검색 기록이 함께 삭제됩니다.</p>{deleteError && <p className="inline-error" role="alert">{deleteError}</p>}<div className="form-actions"><button className="button secondary" disabled={deleting} onClick={close}>취소</button><button className="button danger" disabled={deleting} onClick={() => remove(close)}>{deleting ? "삭제 중…" : "삭제하기"}</button></div></>}</Modal>}
    </div>
  );
}

function SearchPosition({ onSelect }: { onSelect: (location: MapLocation) => void }) {
  const [location, setLocation] = useState<MapLocation | null>(null);
  return <div className="form-stack">
    <AddressMapPicker initial={null} location={location} onChange={setLocation} />
    <button type="button" className="button primary" disabled={!location} onClick={() => { if (location) onSelect(location); }}>이 위치에서 검색</button>
  </div>;
}

function LuMessageIcon() { return <LuSparkles size={15} />; }
function LuUtensilsIcon() { return <LuLeaf />; }
