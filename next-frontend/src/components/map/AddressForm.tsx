"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { api, errorMessage, json } from "@/app/lib/api";
import { hasCoordinates } from "@/app/lib/kakaoMap";
import type { Address, MapLocation } from "@/app/types/Service";
import AddressMapPicker from "./AddressMapPicker";

type AddressValues = MapLocation & Pick<Address, "label" | "detail_address" | "is_default">;

export default function AddressForm({
  initial,
  defaultAddress = false,
  children,
  onSave,
  onSaved,
  onPendingChange
}: {
  initial?: Address;
  defaultAddress?: boolean;
  children?: ReactNode;
  onSave?: (address: AddressValues, form: HTMLFormElement) => Promise<void>;
  onSaved?: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [initialLocation] = useState<MapLocation | null>(() =>
    initial && hasCoordinates(initial)
      ? {
          address: initial.address,
          latitude: initial.latitude,
          longitude: initial.longitude
        }
      : null
  );
  const [location, setLocation] = useState(initialLocation);
  const [label, setLabel] = useState(initial?.label || (defaultAddress ? "집" : ""));
  const [detailAddress, setDetailAddress] = useState(initial?.detail_address || "");
  const [isDefault, setDefault] = useState(initial?.is_default || defaultAddress);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !location) return;
    setPending(true);
    onPendingChange?.(true);
    setError("");
    try {
      const address = { ...location, label, detail_address: detailAddress, is_default: isDefault };
      if (onSave) await onSave(address, event.currentTarget);
      else await api(
        initial ? "/api/me/addresses/" + initial.id : "/api/me/addresses",
        json(initial ? "PUT" : "POST", address)
      );
      onSaved?.();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
      onPendingChange?.(false);
    }
  };
  return (
    <form className="form-stack" onSubmit={submit}>
      <label>
        주소 이름
        <input
          className="field"
          required
          maxLength={20}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="집, 직장, 자주 가는 곳"
        />
      </label>
      <AddressMapPicker
        initial={initialLocation}
        location={location}
        onChange={setLocation}
      />
      <label>
        상세 주소 (선택)
        <input
          className="field"
          autoComplete="address-line2"
          placeholder="동·호수 또는 층"
          maxLength={200}
          value={detailAddress}
          onChange={(event) => setDetailAddress(event.target.value)}
        />
      </label>
      {!defaultAddress && (
        <label className="flex-row items-center gap-[.65rem] text-[.8rem] font-medium">
          <input
            className="size-[1.1rem] flex-none accent-forest"
            type="checkbox"
            checked={isDefault}
            onChange={(event) => setDefault(event.target.checked)}
          />
          기본 출발지로 사용
        </label>
      )}
      {children}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="button button-primary"
        disabled={pending || !location}>
        {pending
          ? "저장 중…"
          : defaultAddress
            ? "초기 설정 완료하기"
            : "주소 저장"}
      </button>
    </form>
  );
}
