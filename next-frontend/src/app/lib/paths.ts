export function withBasePath(path: string) {
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");

  if (path.startsWith("/api/") && apiUrl)
    return apiUrl + path;

  return path.startsWith("/") && !path.startsWith("//")
    ? (process.env.NEXT_PUBLIC_BASE_PATH || "") + path
    : path;
}

export function postPath(id: number | string, edit = false) {
  return "/community/" + (edit ? "edit" : "detail") + "?id=" + encodeURIComponent(id);
}
