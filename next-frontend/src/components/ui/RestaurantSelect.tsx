"use client";

import { useEffect, useId, useState, type KeyboardEvent } from "react";
import useApiQuery from "@/app/lib/useApiQuery";
import type { RestaurantChoice, RestaurantOption } from "@/app/types/Service";

export default function RestaurantSelect({
  value,
  onChange
}: {
  value: RestaurantChoice | null;
  onChange: (restaurant: RestaurantChoice | null) => void;
}) {
  const inputId = useId();
  const listId = inputId + "-options";
  const [search, setSearch] = useState("");
  const [lookup, setLookup] = useState("");
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const term = search.trim();
  const searching = open && !value && !composing && !!term;
  useEffect(() => {
    if (!searching) return;
    const timer = setTimeout(() => setLookup(term), 220);
    return () => clearTimeout(timer);
  }, [searching, term]);
  const query = useApiQuery<RestaurantOption[]>(
    searching && term === lookup
      ? "/api/restaurants?query=" + encodeURIComponent(lookup)
      : null
  );
  const options = query.data || [];
  const expanded = searching && options.length > 0;
  const choose = (item: RestaurantOption) => {
    onChange({ id: item.id, name: item.name });
    setOpen(false);
    setHighlighted(-1);
  };
  const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (composing || event.nativeEvent.isComposing) return;
    if (event.key === "Escape" && searching) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setHighlighted(-1);
    } else if (event.key === "Enter" && !value) {
      event.preventDefault();
      if (expanded && options[highlighted]) choose(options[highlighted]);
    } else if (
      !value &&
      term &&
      (event.key === "ArrowDown" || event.key === "ArrowUp")
    ) {
      event.preventDefault();
      setOpen(true);
      if (!expanded) return;
      const next =
        event.key === "ArrowDown"
          ? (highlighted + 1) % options.length
          : (Math.max(highlighted, 0) + options.length - 1) % options.length;
      setHighlighted(next);
      document
        .getElementById(listId + "-" + next)
        ?.scrollIntoView?.({ block: "nearest" });
    }
  };
  return (
    <div className="flex min-w-0 flex-col gap-[.45rem]">
      <label htmlFor={inputId}>음식점</label>
      <input
        id={inputId}
        className="field"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={
          expanded && highlighted >= 0 ? listId + "-" + highlighted : undefined
        }
        autoComplete="off"
        required
        value={value?.name ?? search}
        maxLength={150}
        placeholder="음식점 이름을 입력해 주세요"
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setHighlighted(-1);
        }}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        onKeyDown={handleKey}
        onChange={(event) => {
          setSearch(event.target.value.slice(0, 100));
          setOpen(true);
          setHighlighted(-1);
          if (value) onChange(null);
        }}
      />
      {expanded && (
        <ul
          className="max-h-56 overflow-auto overscroll-contain rounded-[.7rem] border
          border-line bg-paper p-1"
          id={listId}
          role="listbox"
          aria-label="음식점 검색 결과">
          {options.map((item, index) => (
            <li
              key={item.id}
              id={listId + "-" + index}
              role="option"
              aria-selected={index === highlighted}
              className="grid cursor-pointer gap-[.18rem] rounded-[.45rem] px-3
              py-[.65rem] text-[.83rem] leading-[1.45] hover:bg-forest-soft
              aria-selected:bg-forest-soft"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item)}>
              <strong>
                {item.name}
                {item.is_demo && " · 개발 예시"}
              </strong>
              <span className="text-[.74rem] text-muted">{item.address}</span>
            </li>
          ))}
        </ul>
      )}
      {searching && (term !== lookup || query.loading) && (
        <p className="helper" role="status">
          음식점을 찾고 있어요.
        </p>
      )}
      {query.error && (
        <p className="inline-error" role="alert">
          {query.error}
        </p>
      )}
      {query.data?.length === 0 && (
        <p className="helper" role="status">
          일치하는 등록 음식점이 없어요.
        </p>
      )}
    </div>
  );
}
