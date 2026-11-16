export function withBasePath(path: string) {
  return path.startsWith("/") && !path.startsWith("//")
    ? (process.env.NEXT_PUBLIC_BASE_PATH || "") + path
    : path;
}

export function postPath(id: number | string, edit = false) {
  return "/community/" + (edit ? "edit" : "detail") + "?id=" + encodeURIComponent(id);
}
