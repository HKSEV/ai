"""실행 중인 MySQL의 전용 테스트 DB에서 API 저장·권한 흐름을 검증합니다."""

import argparse
import os
import sys
import tempfile
from pathlib import Path
from io import BytesIO
from unittest.mock import patch

from sqlalchemy import make_url, text


parser = argparse.ArgumentParser(description="전용 MySQL 테스트 DB의 테이블을 초기화하고 API를 검증합니다.")
parser.add_argument("--reset", action="store_true", help="_test로 끝나는 전용 DB만 초기화합니다.")
arguments = parser.parse_args()
url = os.getenv("TEST_DATABASE_URL", "")
if not url or not arguments.reset:
  parser.error("TEST_DATABASE_URL과 --reset이 필요합니다. 운영 DB를 지정하지 마세요.")
parsed = make_url(url)
if parsed.drivername != "mysql+pymysql" or not (parsed.database or "").endswith("_test"):
  parser.error("mysql+pymysql 드라이버와 _test로 끝나는 전용 DB 이름이 필요합니다.")

uploads = tempfile.TemporaryDirectory(prefix="nowon-mysql-test-")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.update(
  APP_ENV="test", DATABASE_URL=url, UPLOADS_DIR=uploads.name,
  COOKIE_SECURE="false", FRONTEND_URL="http://localhost:3000",
  KAKAO_REST_API_KEY="", KAKAO_LOCAL_REST_API_KEY="", KAKAO_PLACE_STORAGE_ALLOWED="false",
  GEMINI_API_KEY="", GEMINI_MODEL="", INCLUDE_DEMO_DATA="false",
)
checks = []


def check(label, condition):
  if not condition:
    raise AssertionError(label)
  checks.append(label)
  print("PASS", label, flush=True)


from sqlalchemy import select,func
from config.database import Base,engine,SessionLocal
from config.settings import settings
from entity.models import *
from service import auth_service,chat_service
from dto.chat import SearchConditions,RecommendationResult
from main import app
from fastapi.testclient import TestClient
from PIL import Image
Base.metadata.drop_all(engine)
Base.metadata.create_all(engine)
check('MySQL / 12 application tables',len(Base.metadata.tables)==12)
headers={'X-Requested-With':'nowon-walk','Origin':'http://localhost:3000'}
first=TestClient(app,headers=headers)
second=TestClient(app,headers=headers)
check('no credentials cannot start fake login',first.get('/api/auth/kakao/authorize').status_code==503)
object.__setattr__(settings,'kakao_rest_api_key','qa-only')
from urllib.parse import urlparse,parse_qs
def login(client,kakao_id,destination="/onboarding/address",email=None):
    result=client.get('/api/auth/kakao/authorize')
    state=parse_qs(urlparse(result.json()['authorization_url']).query)['state'][0]
    with patch.object(auth_service,'kakao_identity',return_value=(kakao_id,email)):
        response=client.get('/api/auth/kakao/callback',params={'code':'qa-code','state':state},follow_redirects=False)
    check('OAuth server session '+kakao_id,response.status_code==303 and response.headers['location'].endswith(destination))
    return client.get('/api/auth/me').json()
user=login(first,'mysql-qa-1',email='walk@example.com')
check('signup email persisted and address setup pending',user['email']=='walk@example.com' and user['address_setup_pending'])
check('unshared email allows signup',login(second,'mysql-qa-2')['email'] is None)
body={'nickname':'노원검증곰','preferences':['한식'],'budget_min':5000,'budget_max':15000}
check('profile writes',first.put('/api/me',json=body).status_code==200)
check('other account retains nickname',second.get('/api/auth/me').json()['nickname']!='노원검증곰')
check('nickname collision rejected',second.put('/api/me',json=body).status_code==409)
address=first.post('/api/me/addresses',json={'label':'집','address':'서울 노원구 공릉동 1','latitude':37.65,'longitude':127.06,'is_default':True}).json()
check('address persisted',first.get('/api/me/addresses').json()[0]['address']=='서울 노원구 공릉동 1')
check('profile and completed onboarding survive session recreation',login(first,'mysql-qa-1','/explore','walk@example.com')['nickname']=='노원검증곰')
check('other user cannot read addresses',second.get('/api/me/addresses').json()==[])
check('other user cannot change address',second.put('/api/me/addresses/'+str(address['id']),json={'label':'집','address':'서울 노원구 상계동 1','is_default':True}).status_code==404)
with SessionLocal() as db:
    restaurant=Restaurant(name='QA 가상식당',address='서울 노원구 공릉동 1',area='공릉동',category='한식',source='자동 검증용 가상 데이터',checked_at=utcnow(),is_demo=False)
    db.add(restaurant);db.flush();identity=restaurant.id
    db.add(Menu(restaurant_id=identity,name='QA 정식',price=9000,servings=1,source='자동 검증용 가상 데이터',checked_at=utcnow()))
    db.commit()
output=BytesIO();Image.new('RGB',(24,24),'white').save(output,format='PNG')
upload=first.post('/api/uploads?kind=receipt',files={'file':('receipt.png',output.getvalue(),'image/png')})
check('receipt upload writes',upload.status_code==201)
receipt=upload.json()['id']
check('receipt private',second.get('/api/uploads/'+receipt).status_code==404)
visit=first.post('/api/me/visits',json={'restaurant_id':identity,'visited_on':'2026-11-01','note':'직접 방문했다고 기록','receipt_id':receipt})
check('manual visit not verified by upload',visit.status_code==201 and visit.json()['verification_status']=='not_verified')
photo=first.post('/api/uploads?kind=photo',files={'file':('food.png',output.getvalue(),'image/png')}).json()['id']
post_body={'kind':'review','title':'가상 식당 테스트 리뷰','content':'실제 데이터가 아닌 자동 검증용 리뷰입니다.','restaurant_id':identity,'rating':4,'visited_on':'2026-11-01','visit_id':visit.json()['id'],'photo_ids':[photo]}
post=first.post('/api/posts',json=post_body)
check('review persisted',post.status_code==201)
post_id=post.json()['id']
check('review receipt does not imply verification',first.get('/api/posts/'+str(post_id)).json()['verification_status']=='not_verified')
check('attached photo visible to community',second.get('/api/uploads/'+photo).status_code==200)
check('other user cannot update review',second.put('/api/posts/'+str(post_id),json=post_body).status_code==404)
check('other user cannot delete review',second.delete('/api/posts/'+str(post_id)).status_code==404)
changed=dict(post_body,title='수정된 테스트 리뷰')
check('owner updates review',first.put('/api/posts/'+str(post_id),json=changed).status_code==200)
check('review list filtered from DB',first.get('/api/posts?kind=review&page=1&size=1').json()['items'][0]['title']=='수정된 테스트 리뷰')
def structured(client,prompt,data,schema):
    if schema is SearchConditions:
        old=data['previous']
        return schema(area='공릉동',cuisine='한식',party_size=2,budget_total=20000 if not old else 19000)
    return RecommendationResult(items=[{'restaurant_id':identity,'evidence_keys':['category','menu_budget','community_reviews'],
        'order':{'items':[{'name':'QA 정식','quantity':2}],'estimated_total':18000}}])
with patch.object(chat_service,'get_client',return_value=object()),patch.object(chat_service,'generate_structured',side_effect=structured):
    response=first.post('/api/chat',json={'message':'공릉동에서 둘이 2만원 안에 먹을 곳'})
    check('chat connects DB and mocked Gemini',response.status_code==200)
    conversation=response.json()
    result=conversation['messages'][-1]['recommendations'][0]
    check('menu combination exact arithmetic',result['menu_combination']['total']==18000 and result['menu_combination']['per_person']==9000)
    check('unknown operational data not invented',result['wait_minutes'] is None and result['repeat_visit_rate'] is None and result['opening']['label']=='확인 필요')
    follow=first.post('/api/chat',json={'message':'조금 더 저렴하게','conversation_id':conversation['id']})
    check('follow-up conversation persists prior context',follow.status_code==200 and len(follow.json()['messages'])==4 and follow.json()['conditions']['budget_total']==19000)
check('private conversations inaccessible to another user',second.get('/api/conversations/'+str(conversation['id'])).status_code==404)
check('recommendation adds no visit',first.get('/api/me/visits').json()['total']==1)
with SessionLocal() as db:
    check('independent SQL session reads saved preferences',db.scalar(select(User).where(User.kakao_id=='mysql-qa-1')).preferences==['한식'])
    check('independent SQL session reads conversation/search records',db.scalar(select(func.count()).select_from(SearchRecord))==2)
check('foreign Origin rejected',first.put('/api/me',json=body,headers={'Origin':'https://other.example'}).status_code==403)
check('owner deletes conversation',first.delete('/api/conversations/'+str(conversation['id'])).status_code==204)
with SessionLocal() as db:
    check('conversation deletion cascades searches/messages',db.scalar(select(func.count()).select_from(SearchRecord))==0 and db.scalar(select(func.count()).select_from(Message))==0)
check('owner deletes review',first.delete('/api/posts/'+str(post_id)).status_code==204)
check('deleted photo no longer served',second.get('/api/uploads/'+photo).status_code==404)
check('logout clears server session',first.post('/api/auth/logout').status_code==204 and first.get('/api/auth/me').status_code==401)

with engine.connect() as connection:
  version = connection.scalar(text("SELECT VERSION()"))
print(f"RESULT: {len(checks)} checks passed on MySQL {version}; Kakao and Gemini mocked")
engine.dispose()
uploads.cleanup()
