const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3000/explore', pretendToBeVisual: true });
Object.assign(global, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event });
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
const { render, screen, cleanup, act, fireEvent, waitFor, within } = require('@testing-library/react');
const { makeStore } = require('../src/store/store.ts');
const { setConversation } = require('../src/store/chatSlice.ts');
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
const userMessage = (id, content) => ({ ...message(id), role: 'user', content });
let requests = [];
test.beforeEach(() => {
  requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    const body = url === '/api/chat' ? conversation([message(1)]) : url === '/api/me/addresses' || url.startsWith('/api/restaurants/reviews?') ? [] : { items: [], total: 0, page: 1, pages: 0 };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
});
test.afterEach(cleanup);
function mount(store) { return render(React.createElement(Provider, { store }, React.createElement(Explore))); }

function delayChat() {
  const fallback = global.fetch;
  let finish;
  global.fetch = (url, options = {}) => {
    if (url !== '/api/chat') return fallback(url, options);
    requests.push({ url, options });
    return new Promise((resolve) => { finish = resolve; });
  };
  return (body, status = 200) => finish(new Response(JSON.stringify(body), { status }));
}

function send(content) {
  fireEvent.change(screen.getByLabelText('맛집 탐색 요청'), { target: { value: content } });
  fireEvent.click(screen.getByLabelText('메시지 보내기'));
}

test('a new chat shows the user message before the server creates the conversation', async () => {
  const finish = delayChat();
  const store = makeStore();
  mount(store);
  const content = '공릉동에서 식사할 곳';
  send(content);
  const log = within(screen.getByRole('log', { name: '채팅 기록' }));
  const optimistic = log.getByText(content).closest('.motion-safe\\:animate-enter');
  assert.ok(optimistic);
  assert.equal(log.getAllByText(content).length, 1);
  assert.ok(log.getByRole('status'));
  assert.equal(log.queryByText('검증 응답 2'), null);
  assert.equal(JSON.parse(requests.find((request) => request.url === '/api/chat').options.body).conversation_id, null);
  await act(async () => finish(conversation([userMessage(1, content), message(2)])));
  assert.equal(log.getAllByText(content).length, 1);
  assert.equal(log.getByText(content).closest('.motion-safe\\:animate-enter'), optimistic);
  assert.ok(log.getByText('검증 응답 2').closest('.motion-safe\\:animate-enter'));
  assert.equal(log.queryByRole('status'), null);
});

test('a completed follow-up with no recommendations clears cards from the previous conditions', async () => {
  const store = makeStore();
  store.dispatch(setConversation(conversation([message(1, [restaurant])])));
  mount(store);
  assert.ok(screen.getByText('검증용 공릉식당'));
  assert.ok(screen.getByText('영업시간은 매장에 문의하세요.'));
  assert.equal(screen.queryByRole('link', { name: '상세정보' }), null);
  await act(async () => { store.dispatch(setConversation(conversation([message(1, [restaurant]), message(2)]))); });
  assert.equal(screen.queryByText('검증용 공릉식당'), null);
  assert.ok(screen.getByText('당신의 한 끼를 기다려요'));
});

test('previous cards remain explicitly labelled while the next recommendation is loading', async () => {
  const finish = delayChat();
  const store = makeStore();
  const content = '공릉동에서 식사할 곳';
  const initial = [userMessage(1, content), message(2, [restaurant])];
  store.dispatch(setConversation(conversation(initial)));
  mount(store);
  send(content);
  const log = within(screen.getByRole('log', { name: '채팅 기록' }));
  assert.ok(screen.getByText('검증용 공릉식당'));
  assert.ok(screen.getByText('새 조건을 확인하는 동안 이전 추천을 표시합니다.'));
  assert.equal(log.getAllByText(content).length, 2);
  assert.equal(log.queryByText('검증 응답 4'), null);
  assert.equal(JSON.parse(requests.find((request) => request.url === '/api/chat').options.body).conversation_id, 1);
  await act(async () => finish(conversation([...initial, userMessage(3, content), message(4)])));
  assert.equal(log.getAllByText(content).length, 2);
  assert.ok(log.getByText('검증 응답 4'));
});

test('a failed chat keeps the message and alert and replaces its local copy on retry', async () => {
  const finish = delayChat();
  mount(makeStore());
  const content = '공릉동 피자집';
  const log = within(screen.getByRole('log', { name: '채팅 기록' }));
  send(content);
  await act(async () => finish({ detail: 'AI 응답을 처리하지 못했습니다.' }, 502));
  assert.equal(log.getAllByText(content).length, 1);
  assert.equal(log.getByRole('alert').textContent, 'AI 응답을 처리하지 못했습니다.');
  assert.equal(screen.getByLabelText('맛집 탐색 요청').value, content);
  fireEvent.click(screen.getByLabelText('메시지 보내기'));
  assert.equal(log.getAllByText(content).length, 1);
  assert.equal(log.queryByRole('alert'), null);
  await act(async () => finish(conversation([userMessage(1, content), message(2)])));
  assert.equal(log.getAllByText(content).length, 1);
  assert.ok(log.getByText('검증 응답 2'));
});

test('the recommendation panel returns to the top when the next answer arrives', async () => {
  const finish = delayChat();
  const store = makeStore();
  const initial = message(1, [restaurant]);
  const updatedRestaurant = { ...restaurant, id: 2, name: '검증용 중계식당', reason: '서울 노원구 중계동에 위치합니다.' };
  store.dispatch(setConversation(conversation([initial])));
  mount(store);
  const panel = screen.getByRole('region', { name: '추천 음식점' });
  panel.scrollTop = 200;
  const content = '중계동으로 바꿔 줘';
  send(content);
  assert.equal(panel.scrollTop, 200);
  await act(async () => finish(conversation([initial, userMessage(2, content), message(3, [updatedRestaurant])])));
  assert.equal(screen.queryByText(restaurant.name), null);
  assert.ok(screen.getByText(updatedRestaurant.name));
  assert.equal(screen.queryByText(restaurant.reason), null);
  assert.ok(screen.getByText(updatedRestaurant.reason));
  assert.equal(panel.scrollTop, 0);
});

test('cards use the Kakao place details link and display the suggested order', async () => {
  const store = makeStore();
  const item = {
    ...restaurant, is_demo: false, category: '피자', source: '카카오 로컬 검색', source_url: 'https://place.map.kakao.com/123',
    opening: { label: '영업시간 내', basis: '등록된 요일별 일정 기준', is_realtime: false },
    hours: { mon: { open: '11:00', close: '21:30' } }, estimated_hours: '11:00–21:30',
    menu_combination: {
      items: [{ name: '페퍼로니 피자', quantity: 1 }], total: 27000, per_person: 13500, party_size: 2,
      basis: 'AI가 제안한 주문입니다. 실제 메뉴와 가격은 매장 안내를 확인하세요.',
    },
  };
  store.dispatch(setConversation(conversation([message(1, [item])])));
  await act(async () => { mount(store); });
  const card = within(screen.getByRole('article'));
  assert.equal(card.getByRole('link', { name: '상세정보' }).getAttribute('href'), item.source_url);
  assert.equal(card.getByRole('link', { name: '길찾기' }).getAttribute('href'), item.directions_url);
  assert.ok(card.getByText('영업시간은 상세정보에서 확인하세요.'));
  assert.ok(card.getByText(item.category));
  assert.ok(card.getByText('페퍼로니 피자 × 1'));
  assert.ok(card.getByText('27,000원'));
  assert.ok(card.getByText('13,500원'));
  assert.equal(card.queryByText(/11:00|영업시간 내|카카오 로컬 검색/), null);
  assert.equal(card.queryByRole('link', { name: '지도 보기' }), null);
});

test('saved recommendations refresh review and visit marks without a new chat', async () => {
  const old = { id: 1, rating: 4, excerpt: '대화 저장 당시 리뷰', created_at: '2026-11-10T00:00:00Z' };
  const current = { ...old, id: 2, excerpt: '새로 등록된 이웃 리뷰' };
  let reviews = [{ id: restaurant.id, visited: false, reviewed: false, review_summary: [current] }];
  const fallback = global.fetch;
  global.fetch = (url, options) => url.startsWith('/api/restaurants/reviews?')
    ? Promise.resolve(new Response(JSON.stringify(reviews))) : fallback(url, options);
  const store = makeStore();
  store.dispatch(setConversation(conversation([message(1, [{ ...restaurant, review_summary: [old] }])])));
  mount(store);
  await screen.findByText(current.excerpt);
  assert.equal(screen.queryByText(old.excerpt), null);
  assert.equal(screen.queryByText('리뷰를 작성했어요!'), null);
  assert.equal(screen.queryByText('방문 O'), null);
  reviews = [{ id: restaurant.id, visited: true, reviewed: false, review_summary: [current] }];
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  assert.ok(screen.getByText('방문 O'));
  assert.equal(screen.queryByText('리뷰를 작성했어요!'), null);
  const updated = { ...current, excerpt: '수정한 이웃 리뷰' };
  reviews = [{ id: restaurant.id, visited: true, reviewed: true, review_summary: [updated] }];
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  assert.ok(screen.getByText('리뷰를 작성했어요!'));
  assert.equal(screen.getByText('방문 O').parentElement, screen.getByText('리뷰를 작성했어요!').parentElement);
  assert.ok(screen.getByText(updated.excerpt));
  assert.equal(screen.queryByText(current.excerpt), null);
  reviews = [{ id: restaurant.id, visited: false, reviewed: false, review_summary: [] }];
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  assert.equal(screen.queryByText('리뷰를 작성했어요!'), null);
  assert.equal(screen.queryByText('방문 O'), null);
  assert.equal(screen.queryByText('이웃 리뷰에서'), null);
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
  await waitFor(() => assert.equal(store.getState().chat.pending, null));
});
