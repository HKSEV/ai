const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3000" });
for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLDialogElement", "Event", "KeyboardEvent", "MouseEvent", "MutationObserver", "File", "FileList"]) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
HTMLElement.prototype.scrollIntoView = function () {};
HTMLDialogElement.prototype.showModal = function () { this.open = true; };
HTMLDialogElement.prototype.close = function () { this.open = false; };

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const React = require("react");
const { render, screen, fireEvent, waitFor, cleanup, act } = require("@testing-library/react");
const { Provider } = require("react-redux");
const root = path.resolve(__dirname, "../src");
const navigation = [];
const router = { push: (value) => navigation.push(value), replace: (value) => navigation.push(value) };
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.startsWith("@/")) request = path.join(root, request.slice(2));
  if (request === "next/navigation") return { useRouter: () => router, usePathname: () => "/explore" };
  if (request === "next/link") return { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) };
  if (request === "next/image") return { __esModule: true, default: ({ unoptimized: _unoptimized, fill: _fill, ...props }) => React.createElement("img", props) };
  if (request === "react-markdown") return { __esModule: true, default: ({ children }) => React.createElement("div", null, children) };
  return originalLoad.call(this, request, parent, isMain);
};
for (const ext of [".ts", ".tsx"]) {
  require.extensions[ext] = function (module, filename) {
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText;
    module._compile(output, filename);
  };
}
const { makeStore } = require("../src/store/store.ts");
const { setUser, clearUser } = require("../src/store/authSlice.ts");
const ToastProvider = require("../src/components/ui/ToastProvider.tsx").default;
const user = { id: 1, nickname: "공릉미식가", preferences: ["한식"], budget_min: 10000, budget_max: 20000, created_at: "2026-11-01T00:00:00+00:00" };
const page = (items = []) => ({ items, page: 1, pages: items.length ? 1 : 0, total: items.length });
let calls = [];
function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
function setup(Component, props = {}, authenticated = true) {
  const store = makeStore();
  store.dispatch(authenticated ? setUser(user) : clearUser());
  render(React.createElement(Provider, { store }, React.createElement(ToastProvider, null, React.createElement(Component, props))));
  return store;
}
test.beforeEach(() => {
  calls = []; navigation.length = 0;
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return response(String(url).includes("restaurants") || String(url).includes("addresses") ? [] : page());
  };
});
test.afterEach(() => cleanup());

test("landing keeps login on failure and reports configuration error", async () => {
  global.fetch = async (url) => { calls.push({ url }); return response({ detail: "카카오 로그인 설정이 필요합니다." }, 503); };
  const Home = require("../src/app/page.tsx").default;
  setup(Home, {}, false);
  fireEvent.click(screen.getByRole("button", { name: "카카오로 시작하기" }));
  await screen.findByText("카카오 로그인 설정이 필요합니다.");
  assert.equal(calls[0].url, "/api/auth/kakao/authorize");
  assert.equal(navigation.length, 0);
  assert.equal(screen.getByRole("button", { name: "카카오로 시작하기" }).disabled, false);
});

test("anonymous guard redirects and never renders private content", async () => {
  const AuthGuard = require("../src/components/layout/AuthGuard.tsx").default;
  setup(AuthGuard, { children: React.createElement("p", null, "개인 주소") }, false);
  await waitFor(() => assert.deepEqual(navigation, ["/"]));
  assert.equal(screen.queryByText("개인 주소"), null);
});

test("community form saves through API then opens persisted detail", async () => {
  global.fetch = async (url, options = {}) => { calls.push({ url: String(url), options }); return response({ id: 42 }, 201); };
  const PostForm = require("../src/components/community/PostForm.tsx").default;
  setup(PostForm);
  fireEvent.change(screen.getByLabelText("제목"), { target: { value: "새로운 동네 산책" } });
  fireEvent.change(screen.getByLabelText(/이야기.*10,000/), { target: { value: "좋은 음식점을 발견해서 이웃에게 소개하고 싶습니다." } });
  fireEvent.click(screen.getByRole("button", { name: "이야기 남기기" }));
  await waitFor(() => assert.deepEqual(navigation, ["/community/42"]));
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.kind, "experience");
  assert.equal(payload.title, "새로운 동네 산책");
  assert.equal(new Headers(calls[0].options.headers).get("X-Requested-With"), "nowon-walk");
});

test("review autocomplete disambiguates matching names and clears the selection when edited", async () => {
  const matches = [
    { id: 11, name: "검증용 식탁", address: "서울 노원구 상계동 1" },
    { id: 12, name: "검증용 식탁", address: "서울 노원구 공릉동 2" },
  ];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return String(url).startsWith("/api/restaurants?") ? response(matches) : url === "/api/posts" ? response({ id: 42 }, 201) : response(page());
  };
  const PostForm = require("../src/components/community/PostForm.tsx").default;
  setup(PostForm);
  fireEvent.click(screen.getByRole("button", { name: /음식점 리뷰/ }));
  const input = screen.getByRole("combobox", { name: "음식점" });
  fireEvent.change(input, { target: { value: "식탁" } });
  const place = await screen.findByRole("option", { name: /공릉동 2/ });
  fireEvent.click(place);
  assert.equal(input.value, "검증용 식탁");
  fireEvent.change(input, { target: { value: "검증" } });
  fireEvent.change(screen.getByLabelText("제목"), { target: { value: "검증용 리뷰" } });
  fireEvent.change(screen.getByLabelText(/이야기.*10,000/), { target: { value: "자동완성으로 선택한 음식점에 남기는 검증용 리뷰입니다." } });
  fireEvent.click(screen.getByRole("button", { name: "이야기 남기기" }));
  await screen.findByText("검색 결과에서 음식점을 선택해 주세요.");
  assert.equal(calls.some(({ url }) => url === "/api/posts"), false);
  fireEvent.focus(input);
  await screen.findByRole("option", { name: /공릉동 2/ });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.click(screen.getByRole("button", { name: "이야기 남기기" }));
  await waitFor(() => assert.deepEqual(navigation, ["/community/42"]));
  assert.equal(JSON.parse(calls.find(({ url }) => url === "/api/posts").options.body).restaurant_id, 12);
});

test("post edit denies another author", async () => {
  global.fetch = async () => response({ id: 2, is_owner: false });
  const PostDetail = require("../src/components/community/PostDetail.tsx").default;
  setup(PostDetail, { id: "2", edit: true });
  await screen.findByText("본인이 작성한 글만 수정할 수 있어요.");
  assert.equal(screen.queryByLabelText("제목"), null);
});

test("profile saves preferences and updates shared nickname", async () => {
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return response({ ...user, ...JSON.parse(options.body) });
  };
  const ProfileForm = require("../src/components/mypage/ProfileForm.tsx").default;
  const store = setup(ProfileForm, { user });
  fireEvent.change(screen.getByLabelText(/산책 닉네임/), { target: { value: "노원한입탐험가" } });
  fireEvent.click(screen.getByRole("button", { name: "일식" }));
  fireEvent.click(screen.getByRole("button", { name: "취향 저장하기" }));
  await waitFor(() => assert.equal(store.getState().auth.user.nickname, "노원한입탐험가"));
  assert.deepEqual(store.getState().auth.user.preferences, ["한식", "일식"]);
  assert.equal(calls[0].url, "/api/me");
});

test("address form saves a confirmed map point through the private endpoint", async () => {
  let mapClick;
  class LatLng {
    constructor(latitude, longitude) { this.latitude = latitude; this.longitude = longitude; }
    getLat() { return this.latitude; }
    getLng() { return this.longitude; }
  }
  process.env.KAKAO_JAVASCRIPT_KEY = "map-test";
  global.ResizeObserver = class { observe() {} disconnect() {} };
  window.kakao = { maps: {
    load(callback) { callback(); },
    LatLng,
    Map: class { setCenter() {} },
    Marker: class { setPosition() {} setMap() {} },
    event: {
      addListener(_target, type, listener) { if (type === "click") mapClick = listener; },
      removeListener() {},
    },
    services: {
      Status: { OK: "OK" },
      Geocoder: class { coord2Address(_x, _y, callback) { callback([{ road_address: { address_name: "서울 노원구 공릉로 1" } }], "OK"); } },
    },
  } };
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return response(options.method === "POST" ? { id: 3 } : []);
  };
  const AddressManager = require("../src/components/mypage/AddressManager.tsx").default;
  setup(AddressManager);
  await screen.findByText("출발지를 등록해 보세요.");
  fireEvent.click(screen.getByRole("button", { name: "주소 추가" }));
  fireEvent.change(screen.getByLabelText("주소 이름"), { target: { value: "집" } });
  assert.equal(screen.getByRole("button", { name: "주소 저장" }).disabled, true);
  await waitFor(() => assert.equal(typeof mapClick, "function"));
  await act(async () => mapClick({ latLng: new LatLng(37.65, 127.06) }));
  assert.equal(screen.getByLabelText("선택한 주소").readOnly, true);
  assert.equal(screen.getByLabelText("선택한 주소").value, "서울 노원구 공릉로 1");
  fireEvent.click(screen.getByLabelText("기본 출발지로 사용"));
  fireEvent.click(screen.getByRole("button", { name: "주소 저장" }));
  await screen.findByText("주소를 저장했어요.");
  const post = calls.find((call) => call.options.method === "POST");
  assert.equal(post.url, "/api/me/addresses");
  assert.deepEqual(JSON.parse(post.options.body), {
    label: "집", address: "서울 노원구 공릉로 1", latitude: 37.65, longitude: 127.06, is_default: true,
  });
});

test("chat ignores composing Enter and prevents duplicate submissions", async () => {
  let finish;
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (options.method === "POST") return new Promise((resolve) => { finish = resolve; });
    return response(page());
  };
  const Explore = require("../src/components/explore/Explore.tsx").default;
  setup(Explore);
  await screen.findByText("오늘의 첫 산책을 시작해 보세요.");
  const input = screen.getByLabelText("맛집 탐색 요청");
  fireEvent.change(input, { target: { value: "공릉동 혼밥" } });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 0);
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.keyDown(input, { key: "Enter" });
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 1);
  await act(async () => finish(response({ id: 1, title: "산책", conditions: { area: "공릉동" }, messages: [] })));
});

test("geolocation denial keeps manual origin available", async () => {
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (_success, denied) => denied({ code: 1 }) } });
  const Explore = require("../src/components/explore/Explore.tsx").default;
  setup(Explore);
  await screen.findByText("오늘의 첫 산책을 시작해 보세요.");
  fireEvent.click(screen.getByRole("button", { name: "현재 위치 사용" }));
  await screen.findByText(/현재 위치를 확인하지 못했습니다/);
  fireEvent.change(screen.getByLabelText("출발지 또는 목적지"), { target: { value: "공릉역" } });
  assert.equal(screen.getByLabelText("출발지 또는 목적지").value, "공릉역");
});
