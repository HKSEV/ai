"use client";

import { useState, type ReactNode } from "react";
import { LuSearch } from "react-icons/lu";
import useApiQuery from "@/app/lib/useApiQuery";
import type { PageResult } from "@/app/types/Service";
import { Empty, ErrorState, Loading, Pagination } from "@/components/ui/States";

export interface ListActions {
  refresh: () => void;
  removed: () => void;
}

export default function ManagementList<T extends { id: number }>({
  resource,
  title,
  searchLabel,
  render
}: {
  resource: "users" | "restaurants";
  title: string;
  searchLabel: string;
  render: (item: T, actions: ListActions) => ReactNode;
}) {
  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  const query = useApiQuery<PageResult<T>>(
    "/api/admin/" +
      resource +
      "?" +
      new URLSearchParams({ query: term, page: String(page) })
  );
  const actions = {
    refresh: query.reload,
    removed: () => {
      if (page > 1 && query.data?.items.length === 1) setPage(page - 1);
      else query.reload();
    }
  };
  return (
    <>
      <h1>{title}</h1>
      <form
        className="my-5 flex max-w-lg items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setTerm(input.trim());
          setPage(1);
        }}>
        <input
          className="field"
          aria-label={searchLabel}
          placeholder={searchLabel}
          type="search"
          value={input}
          maxLength={100}
          onChange={(event) => setInput(event.target.value)}
        />
        <button className="button admin-primary" type="submit">
          <LuSearch/>
          검색
        </button>
      </form>
      {query.loading && <Loading/>}
      {query.error && <ErrorState message={query.error} retry={query.reload}/>}
      {query.data && (
        <>
          <p className="mb-3 text-sm text-muted">
            총 {query.data.total.toLocaleString("ko-KR")}건
          </p>
          {query.data.items.length ? (
            <ul className="grid gap-3">
              {query.data.items.map((item) => (
                <li key={item.id}>{render(item, actions)}</li>
              ))}
            </ul>
          ) : (
            <Empty title="조회된 항목이 없습니다."/>
          )}
          <Pagination page={page} pages={query.data.pages} onChange={setPage}/>
        </>
      )}
    </>
  );
}
