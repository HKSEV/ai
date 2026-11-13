import { LuLeaf, LuRefreshCw } from "react-icons/lu";

const state = "flex flex-col items-center gap-[.85rem] text-center text-muted";
const stateText = "max-w-96 text-[.85rem]";
const pageButton =
  "min-h-[38px] rounded-lg border border-line bg-paper px-[.7rem] py-[.3rem]";

export function Loading({ text = "잠시만 기다려 주세요." }: { text?: string }) {
  return (
    <div className={state + " px-4 py-14"} role="status">
      <span
        className="size-[1.6rem] animate-loading rounded-full border-2 border-line
      border-t-forest"
      />
      <p className={stateText}>{text}</p>
    </div>
  );
}

export function Empty({
  title,
  text,
  compact = false
}: {
  title: string;
  text?: string;
  compact?: boolean;
}) {
  return (
    <div className={state + (compact ? " px-6 py-10" : " px-4 py-14")}>
      <LuLeaf size={30}/>
      <h3 className="text-[.95rem] text-navy">{title}</h3>
      {text && <p className={compact ? "max-w-96 text-[.76rem]" : stateText}>{text}</p>}
    </div>
  );
}

export function ErrorState({
  message,
  retry
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className={state + " px-4 py-14"} role="alert">
      <p className={stateText}>{message}</p>
      {retry && (
        <button className="button button-secondary" onClick={retry}>
          <LuRefreshCw/>
          다시 시도
        </button>
      )}
    </div>
  );
}

export function Pagination({
  page,
  pages,
  onChange,
  compact = false
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
  compact?: boolean;
}) {
  if (pages <= 1) return null;
  return (
    <nav
      className={
        "mx-auto mt-8 flex items-center justify-center " +
        (compact ? "gap-1 text-[.65rem]" : "gap-4 text-[.8rem]")
      }
      aria-label="목록 페이지">
      <button
        className={pageButton}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}>
        이전
      </button>
      <span>
        {page} / {pages}
      </span>
      <button
        className={pageButton}
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}>
        다음
      </button>
    </nav>
  );
}
