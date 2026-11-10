import argparse
from pathlib import Path

from sqlalchemy.dialects import mysql
from sqlalchemy.schema import CreateIndex, CreateTable

from config.database import Base, engine
from entity import models


def main():
  parser = argparse.ArgumentParser(description="노원맛집산책 MySQL 초기 테이블 생성")
  parser.add_argument("--sql", type=Path, help="접속 없이 MySQL DDL 파일만 생성")
  args = parser.parse_args()
  if args.sql:
    lines = ["-- MySQL 8.4 / utf8mb4. 기존 테이블 업그레이드는 백업 후 별도 마이그레이션이 필요합니다."]
    for table in Base.metadata.sorted_tables:
      lines.append(str(CreateTable(table).compile(dialect=mysql.dialect())) + ";")
      lines.extend(str(CreateIndex(index).compile(dialect=mysql.dialect())) + ";" for index in table.indexes)
    args.sql.parent.mkdir(parents=True, exist_ok=True)
    args.sql.write_text("\n".join(line.rstrip() for line in "\n\n".join(lines).splitlines()) + "\n", encoding="utf-8")
    print("MySQL DDL을 생성했습니다.")
    return
  if engine is None:
    raise SystemExit("backend/.env에 MySQL 연결 정보를 설정해 주세요.")
  Base.metadata.create_all(engine)
  print(str(len(Base.metadata.tables)) + "개 테이블을 확인했습니다. 기존 데이터는 삭제하지 않습니다.")


if __name__ == "__main__":
  main()
