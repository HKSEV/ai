"use client";

import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import ReactMarkdown from "react-markdown";
import { LuArrowUp, LuCompass, LuHistory, LuLeaf, LuLocateFixed, LuMapPin, LuPlus, LuSparkles } from "react-icons/lu";
import { api, errorMessage, json } from "@/app/lib/api";
import useApiQuery from "@/app/lib/useApiQuery";
import { money } from "@/app/lib/format";
import type { Conversation, ConversationSummary, PageResult } from "@/app/types/Service";
import type { RootState } from "@/store/store";
import { resetChat, setConversation, setInput, setPending } from "@/store/chatSlice";
import { Empty, ErrorState, Loading, Pagination } from "@/components/ui/States";
import { useToast } from "@/components/ui/ToastProvider";
import RestaurantCard from "./RestaurantCard";

const suggestions = ["노원역 근처 조용한 데이트 식당", "상계동에서 혼밥하기 좋은 찌개집", "공릉동에서 4명이 6만 원 안으로 먹을 곳"];

export default function Explore() {
  const { active, input, pending } = useSelector((state: RootState) => state.chat);
  const user = useSelector((state: RootState) => state.auth.user);
  const dispatch = useDispatch();
  const toast = useToast();
  const [historyPage, setHistoryPage] = useState(1);
  const history = useApiQuery<PageResult<ConversationSummary>>("/api/conversations?page=" + historyPage);
  const [showHistory, setShowHistory] = useState(false);
  const [origin, setOrigin] = useState("");
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const results = [...(active?.messages || [])].reverse().find((message) => message.role === "assistant")?.recommendations || [];
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [active?.messages.length, pending]);
  const send = async (value = input) => {
    const message = value.trim();
    if (!message || locked.current) return;
    locked.current = true; dispatch(setPending(true)); setError(""); dispatch(setInput(""));
    try {
      const response = await api<Conversation>("/api/chat", json("POST", { message, conversation_id: active?.id || null, origin_text: origin || null, ...coordinates }));
      dispatch(setConversation(response)); history.reload();
    } catch (error) { setError(errorMessage(error)); dispatch(setInput(message)); }
    finally { locked.current = false; dispatch(setPending(false)); }
  };
  const selectConversation = async (id: number) => {
    if (locked.current) return;
    try {
      const response = await api<Conversation>("/api/conversations/" + id);
      dispatch(setConversation(response)); setShowHistory(false); setError("");
    } catch (error) { toast(errorMessage(error)); }
  };
  const locate = () => {
    if (!navigator.geolocation) { setLocationMessage("이 브라우저에서는 위치를 확인할 수 없어요. 지역을 직접 입력해 주세요."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => { setCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude }); setOrigin(""); setLocationMessage("현재 위치를 출발지로 사용해요. 직선거리만 계산합니다."); setLocating(false); },
      () => { setCoordinates(null); setLocationMessage("위치 권한이 없어도 괜찮아요. 동네·역명·주소를 직접 입력해 주세요."); setLocating(false); },
      { timeout: 10000, maximumAge: 60000 },
    );
  };
  const conditions = active?.conditions;
  return (
    <div className="explore-page">
      <div className="page-heading explore-heading"><div><span className="eyebrow">YOUR NEIGHBORHOOD TABLE</span><h1>오늘은 어떤 한 끼가 좋을까요?</h1><p>취향을 이야기하면, 동네의 새로운 맛을 함께 찾아드려요.</p></div><button className="button secondary history-toggle" onClick={() => setShowHistory(!showHistory)}><LuHistory />산책 기록</button></div>
      <div className="explore-grid">
        <aside className={"conversation-sidebar " + (showHistory ? "is-open" : "")}>
          <button className="button primary full" disabled={pending} onClick={() => { dispatch(resetChat()); setError(""); setShowHistory(false); }}><LuPlus />새로운 산책</button>
          <h2><LuHistory />지난 이야기</h2>
          {history.loading && <Loading />}
          {history.error && <ErrorState message={history.error} retry={history.reload} />}
          {history.data?.items.length === 0 && <p className="helper sidebar-empty">오늘의 첫 산책을 시작해 보세요.</p>}
          <div className="conversation-list">{history.data?.items.map((item) => <button className={active?.id === item.id ? "active" : ""} key={item.id} disabled={pending} onClick={() => selectConversation(item.id)}><LuMessageIcon /><span>{item.title}</span></button>)}</div>
          {history.data && <Pagination page={historyPage} pages={history.data.pages} onChange={setHistoryPage} />}
          <div className="sidebar-note"><LuLeaf /><p>검색 기록은 마이페이지에서<br />확인하고 삭제할 수 있어요.</p></div>
        </aside>
        <section className="chat-panel" aria-label="AI와 맛집 탐색 대화">
          <div className="chat-title"><span className="assistant-avatar"><LuLeaf /></span><div><h2>맛집 산책 도우미</h2><p>Gemini와 함께하는 동네 탐색</p></div><span className="badge">AI</span></div>
          <div className="chat-messages" aria-live="polite">
            {!active?.messages.length && <div className="chat-welcome"><span className="welcome-symbol"><LuCompass /></span><span className="eyebrow">반가워요, {user?.nickname}님</span><h2>어떤 맛을<br />찾아 떠나볼까요?</h2><p>동네, 음식, 예산을 편하게 이야기해 주세요.<br />필요한 조건은 제가 짧게 여쭤볼게요.</p><div className="suggestions">{suggestions.map((text) => <button key={text} onClick={() => send(text)} disabled={pending}>{text}<LuArrowUp /></button>)}</div></div>}
            {active?.messages.map((message) => <div key={message.id} className={"chat-row " + message.role}>{message.role === "assistant" && <span className="message-avatar"><LuLeaf /></span>}<div className="message-bubble"><ReactMarkdown>{message.content}</ReactMarkdown></div></div>)}
            {pending && <div className="chat-row assistant"><span className="message-avatar"><LuLeaf /></span><div className="message-bubble thinking" role="status"><span /><span /><span /><small>조건과 음식점 정보를 살펴보고 있어요.</small></div></div>}
            {error && <div className="inline-error" role="alert">{error}</div>}
            <div ref={bottom} />
          </div>
          {conditions && <div className="condition-chips">{[conditions.area, conditions.cuisine, conditions.party_size ? conditions.party_size + "명" : null, conditions.budget_total ? "총 " + money(conditions.budget_total) : null, conditions.atmosphere, conditions.purpose].filter(Boolean).map((value, i) => <span key={i}>{value}</span>)}</div>}
          <div className="chat-compose">
            <div className="origin-field"><LuMapPin /><input aria-label="출발지 또는 목적지" value={origin} maxLength={300} onChange={(event) => { setOrigin(event.target.value); setCoordinates(null); setLocationMessage(""); }} placeholder="동네·역명·출발지 입력 (선택)" /><button className={"icon-button " + (coordinates ? "selected" : "")} aria-label="현재 위치 사용" disabled={locating} onClick={locate}><LuLocateFixed /></button></div>
            {locationMessage && <p className="helper" role="status">{locationMessage}</p>}
            <form className="message-form" onSubmit={(event) => { event.preventDefault(); send(); }}>
              <textarea aria-label="맛집 탐색 요청" value={input} maxLength={2000} rows={2} onChange={(event) => dispatch(setInput(event.target.value))} placeholder="오늘 먹고 싶은 한 끼를 알려주세요."
                        onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} />
              <button className="send-button" type="submit" aria-label="메시지 보내기" disabled={pending || !input.trim()}><LuArrowUp /></button>
            </form>
            <p className="compose-note">검색은 방문 기록으로 저장되지 않아요. 음식점 정보와 가격은 방문 전 확인해 주세요.</p>
          </div>
        </section>
        <section className="results-panel" aria-label="추천 음식점"><div className="results-title"><span><LuSparkles />이번 산책의 발견</span><small>{results.length ? results.length + "곳" : "나만의 추천"}</small></div>
          {results.length ? <>{pending && <p className="helper">새 조건을 확인하는 동안 이전 추천을 표시합니다.</p>}{results.map((item, index) => <RestaurantCard key={item.id} restaurant={item} index={index} />)}</> : <div className="results-empty"><Empty title="당신의 한 끼를 기다려요" text="대화를 시작하면 조건에 맞는 음식점을 여기에 모아드릴게요." /><div className="tiny-plate"><LuUtensilsIcon /></div></div>}
          <p className="data-note">실시간 영업·대기, 결제 추정액, 재방문율, 외부 방문 인증은 미연동 상태입니다.</p>
        </section>
      </div>
    </div>
  );
}

function LuMessageIcon() { return <LuSparkles size={15} />; }
function LuUtensilsIcon() { return <LuLeaf />; }
