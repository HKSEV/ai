-- MySQL 8.4 / utf8mb4. 기존 테이블 업그레이드는 백업 후 별도 마이그레이션이 필요합니다.


CREATE TABLE oauth_states (
	state_hash VARCHAR(64) NOT NULL,
	expires_at DATETIME NOT NULL,
	PRIMARY KEY (state_hash)
)

;

CREATE INDEX ix_oauth_states_expires_at ON oauth_states (expires_at);


CREATE TABLE restaurants (
	id INTEGER NOT NULL AUTO_INCREMENT,
	external_id VARCHAR(100),
	name VARCHAR(150) NOT NULL,
	address VARCHAR(300) NOT NULL,
	area VARCHAR(100) NOT NULL,
	category VARCHAR(100) NOT NULL,
	phone VARCHAR(40),
	latitude FLOAT,
	longitude FLOAT,
	tags JSON NOT NULL,
	hours JSON,
	closed_dates JSON NOT NULL,
	hours_source VARCHAR(100),
	hours_source_url VARCHAR(500),
	hours_checked_at DATETIME,
	source VARCHAR(100) NOT NULL,
	source_url VARCHAR(500),
	checked_at DATETIME,
	is_demo BOOL NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (external_id)
)

;


CREATE TABLE users (
	id INTEGER NOT NULL AUTO_INCREMENT,
	kakao_id VARCHAR(64) NOT NULL,
	email VARCHAR(320),
	address_setup_pending BOOL NOT NULL DEFAULT false,
	nickname VARCHAR(40) NOT NULL,
	nickname_key VARCHAR(40) NOT NULL,
	preferences JSON NOT NULL,
	budget_min INTEGER,
	budget_max INTEGER,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (kakao_id),
	UNIQUE (nickname_key)
)

;


CREATE TABLE addresses (
	id INTEGER NOT NULL AUTO_INCREMENT,
	user_id INTEGER NOT NULL,
	label VARCHAR(30) NOT NULL,
	address VARCHAR(300) NOT NULL,
	latitude FLOAT,
	longitude FLOAT,
	is_default BOOL NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)

;

CREATE INDEX ix_addresses_user_id ON addresses (user_id);


CREATE TABLE auth_sessions (
	token_hash VARCHAR(64) NOT NULL,
	user_id INTEGER NOT NULL,
	expires_at DATETIME NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (token_hash),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)

;

CREATE INDEX ix_auth_sessions_user_id ON auth_sessions (user_id);

CREATE INDEX ix_auth_sessions_expires_at ON auth_sessions (expires_at);


CREATE TABLE conversations (
	id INTEGER NOT NULL AUTO_INCREMENT,
	user_id INTEGER NOT NULL,
	title VARCHAR(100) NOT NULL,
	conditions JSON NOT NULL,
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)

;

CREATE INDEX ix_conversations_updated_at ON conversations (updated_at);

CREATE INDEX ix_conversations_user_id ON conversations (user_id);


CREATE TABLE menus (
	id INTEGER NOT NULL AUTO_INCREMENT,
	restaurant_id INTEGER NOT NULL,
	name VARCHAR(100) NOT NULL,
	price INTEGER,
	servings INTEGER NOT NULL,
	available BOOL NOT NULL,
	source VARCHAR(100) NOT NULL,
	source_url VARCHAR(500),
	checked_at DATETIME,
	PRIMARY KEY (id),
	FOREIGN KEY(restaurant_id) REFERENCES restaurants (id) ON DELETE CASCADE
)

;

CREATE INDEX ix_menus_restaurant_id ON menus (restaurant_id);


CREATE TABLE uploads (
	id VARCHAR(36) NOT NULL,
	user_id INTEGER NOT NULL,
	kind VARCHAR(20) NOT NULL,
	filename VARCHAR(100) NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)

;

CREATE INDEX ix_uploads_user_id ON uploads (user_id);


CREATE TABLE messages (
	id INTEGER NOT NULL AUTO_INCREMENT,
	conversation_id INTEGER NOT NULL,
	`role` VARCHAR(20) NOT NULL,
	content TEXT NOT NULL,
	recommendations JSON NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
)

;

CREATE INDEX ix_messages_conversation_id ON messages (conversation_id);


CREATE TABLE search_records (
	id INTEGER NOT NULL AUTO_INCREMENT,
	user_id INTEGER NOT NULL,
	conversation_id INTEGER NOT NULL,
	query TEXT NOT NULL,
	conditions JSON NOT NULL,
	restaurant_ids JSON NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
	FOREIGN KEY(conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
)

;

CREATE INDEX ix_search_records_user_id ON search_records (user_id);


CREATE TABLE visits (
	id INTEGER NOT NULL AUTO_INCREMENT,
	user_id INTEGER NOT NULL,
	restaurant_id INTEGER NOT NULL,
	visited_on DATE NOT NULL,
	note TEXT NOT NULL,
	receipt_id VARCHAR(36),
	verification_status VARCHAR(30) NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
	FOREIGN KEY(restaurant_id) REFERENCES restaurants (id),
	FOREIGN KEY(receipt_id) REFERENCES uploads (id) ON DELETE SET NULL
)

;

CREATE INDEX ix_visits_user_id ON visits (user_id);


CREATE TABLE posts (
	id INTEGER NOT NULL AUTO_INCREMENT,
	user_id INTEGER NOT NULL,
	kind VARCHAR(20) NOT NULL,
	title VARCHAR(100) NOT NULL,
	content TEXT NOT NULL,
	restaurant_id INTEGER,
	rating INTEGER,
	visited_on DATE,
	visit_id INTEGER,
	photo_ids JSON NOT NULL,
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
	FOREIGN KEY(restaurant_id) REFERENCES restaurants (id),
	FOREIGN KEY(visit_id) REFERENCES visits (id) ON DELETE SET NULL
)

;

CREATE INDEX ix_posts_user_id ON posts (user_id);

CREATE INDEX ix_posts_restaurant_kind ON posts (restaurant_id, kind);

CREATE INDEX ix_posts_created_at ON posts (created_at);

CREATE INDEX ix_posts_kind ON posts (kind);
