const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3000/explore' });
Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event });
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith('@/')) request = path.join(__dirname, '../src', request.slice(2));
  return originalResolve.call(this, request, parent, ...rest);
};
const originalLoad = Module._load;
Module._load = function (request, parent, ...rest) {
  if (request === 'next/navigation') return { useRouter: () => ({ push() {}, replace() {} }), usePathname: () => '/explore' };
  return originalLoad.call(this, request, parent, ...rest);
};
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
}
const React = require('react');
const { Provider } = require('react-redux');
const { render, screen, cleanup, act, fireEvent, waitFor } = require('@testing-library/react');
const { makeStore } = require('../src/store/store.ts');
const { setConversation, setPending } = require('../src/store/chatSlice.ts');
const Explore = require('../src/components/explore/Explore.tsx').default;
const restaurant = {
  id: 1, name: '검증용 공릉식당', address: '서울 노원구 공릉동', area: '공릉동', category: '한식',
  is_demo: true, distance_metres: null, reason: '한식 음식점입니다.', confirmed_matches: ['한식'],
  opening: { label: '확인 필요', basis: '영업시간 정보 없음', is_realtime: false },
  hours_source: null, hours_checked_at: null, menus: [], menu_combination: null,
  review_summary: [], source: '자동 검증용 예시', checked_at: null, source_url: null,
  map_url: 'https://map.kakao.com/link/search/test', directions_url: 'https://map.kakao.com/link/search/test',
};
const conversation = (messages) => ({ id: 1, title: '테스트', conditions: { area: '공릉동' }, messages });
const message = (id, recommendations = []) => ({ id, role: 'assistant', content: '검증 응답 ' + id, recommendations, created_at: '2026-11-10T00:00:00Z' });
let requests = [];
test.beforeEach(() => {
  requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    const body = url === '/api/chat' ? conversation([message(1)]) : url === '/api/me/addresses' ? [] : { items: [], total: 0, page: 1, pages: 0 };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
});
test.afterEach(cleanup);
function mount(store) { return render(React.createElement(Provider, { store }, React.createElement(Explore))); }

test('a completed follow-up with no recommendations clears cards from the previous conditions', async () => {
  const store = makeStore();
  store.dispatch(setConversation(conversation([message(1, [restaurant])])));
  mount(store);
  assert.ok(screen.getByText('검증용 공릉식당'));
  await act(async () => { store.dispatch(setConversation(conversation([message(1, [restaurant]), message(2)]))); });
  assert.equal(screen.queryByText('검증용 공릉식당'), null);
  assert.ok(screen.getByText('당신의 한 끼를 기다려요'));
});

test('previous cards remain explicitly labelled while the next recommendation is loading', async () => {
  const store = makeStore();
  store.dispatch(setConversation(conversation([message(1, [restaurant])])));
  store.dispatch(setPending(true));
  mount(store);
  assert.ok(screen.getByText('검증용 공릉식당'));
  assert.ok(screen.getByText('새 조건을 확인하는 동안 이전 추천을 표시합니다.'));
  await act(async () => { store.dispatch(setPending(false)); });
});

test('the recommendation panel returns to the top when the next answer arrives', async () => {
  const store = makeStore();
  const initial = message(1, [restaurant]);
  const updatedRestaurant = { ...restaurant, id: 2, name: '검증용 중계식당' };
  store.dispatch(setConversation(conversation([initial])));
  mount(store);
  const panel = screen.getByRole('region', { name: '추천 음식점' });
  panel.scrollTop = 200;
  await act(async () => { store.dispatch(setPending(true)); });
  assert.equal(panel.scrollTop, 200);
  await act(async () => {
    store.dispatch(setConversation(conversation([initial, message(2, [updatedRestaurant])])));
    store.dispatch(setPending(false));
  });
  assert.equal(screen.queryByText(restaurant.name), null);
  assert.ok(screen.getByText(updatedRestaurant.name));
  assert.equal(panel.scrollTop, 0);
});

test('denied location permission still permits a typed origin and a chat request', async () => {
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(_accept, reject) { reject({ code: 1 }); } } });
  const store = makeStore();
  mount(store);
  fireEvent.click(screen.getByLabelText('현재 위치 사용'));
  await screen.findByText(/현재 위치를 확인하지 못했습니다/);
  fireEvent.change(screen.getByLabelText('출발지 또는 목적지'), { target: { value: '공릉역' } });
  fireEvent.change(screen.getByLabelText('맛집 탐색 요청'), { target: { value: '한식집 찾아줘' } });
  fireEvent.click(screen.getByLabelText('메시지 보내기'));
  await waitFor(() => assert.ok(requests.some((request) => request.url === '/api/chat')));
  const request = requests.find((entry) => entry.url === '/api/chat');
  const body = JSON.parse(request.options.body);
  assert.equal(body.origin_text, '공릉역');
  assert.equal(body.message, '한식집 찾아줘');
  assert.equal(body.latitude, undefined);
  await waitFor(() => assert.equal(store.getState().chat.pending, false));
});
