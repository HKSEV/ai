export const money = (value: number) =>
  new Intl.NumberFormat("ko-KR").format(value) + "원";
export const checkedTime = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(value))
    : "확인 시각 정보 없음";
export const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());

export function distanceLabel(metres: number) {
  return metres < 1000
    ? metres + "m"
    : new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(
        metres / 1000
      ) + "km";
}
