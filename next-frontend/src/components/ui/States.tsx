import { LuLeaf, LuRefreshCw } from "react-icons/lu";

export function Loading({ text = "잠시만 기다려 주세요." }: { text?: string }) {
  return <div className="state" role="status"><span className="spinner" /><p>{text}</p></div>;
}

export function Empty({ title, text }: { title: string; text?: string }) {
  return <div className="state"><LuLeaf size={30} /><h3>{title}</h3>{text && <p>{text}</p>}</div>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="state error-state" role="alert"><p>{message}</p>{retry && <button className="button secondary" onClick={retry}><LuRefreshCw />다시 시도</button>}</div>;
}

export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label="목록 페이지">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)}>이전</button>
      <span>{page} / {pages}</span>
      <button disabled={page >= pages} onClick={() => onChange(page + 1)}>다음</button>
    </nav>
  );
}
