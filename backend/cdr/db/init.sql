CREATE DATABASE midpoint;

\c callcenter

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    role VARCHAR(50) NOT NULL DEFAULT 'AgenteCallCenter',
    sip_extension VARCHAR(10) UNIQUE,
    sip_password VARCHAR(64),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cdr (
    id BIGSERIAL PRIMARY KEY,
    calldate TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    clid VARCHAR(80) DEFAULT '',
    src VARCHAR(80) DEFAULT '',
    dst VARCHAR(80) DEFAULT '',
    dcontext VARCHAR(80) DEFAULT '',
    channel VARCHAR(80) DEFAULT '',
    dstchannel VARCHAR(80) DEFAULT '',
    lastapp VARCHAR(80) DEFAULT '',
    lastdata VARCHAR(80) DEFAULT '',
    duration INT DEFAULT 0,
    billsec INT DEFAULT 0,
    disposition VARCHAR(45) DEFAULT '',
    amaflags INT DEFAULT 0,
    accountcode VARCHAR(20) DEFAULT '',
    uniqueid VARCHAR(32) DEFAULT '',
    userfield VARCHAR(255) DEFAULT '',
    recording_url VARCHAR(512) DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_cdr_calldate ON cdr (calldate);
CREATE INDEX IF NOT EXISTS idx_cdr_src ON cdr (src);
CREATE INDEX IF NOT EXISTS idx_cdr_dst ON cdr (dst);

CREATE TABLE IF NOT EXISTS recordings (
    id BIGSERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    uniqueid VARCHAR(32) NOT NULL,
    caller VARCHAR(10) DEFAULT '',
    callee VARCHAR(10) DEFAULT '',
    duration INT DEFAULT 0,
    filesize BIGINT DEFAULT 0,
    minio_url VARCHAR(512) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recordings_uniqueid ON recordings (uniqueid);
CREATE INDEX IF NOT EXISTS idx_recordings_caller ON recordings (caller);

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    username VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    extension VARCHAR(10),
    ip_address VARCHAR(45),
    details TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log (timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_log_username ON audit_log (username);

INSERT INTO users (username, full_name, email, role, sip_extension, sip_password, password_hash, enabled) VALUES
    ('admin1', 'Admin Uno', 'admin1@callcenter.local', 'Admin', '3001', 'sip3001pass', '$2b$10$EXPot4x5TnUu25w1Jo9coOgeJUqvkijPWpKXF1WQhEAnv3MP5DMt2', TRUE)
ON CONFLICT (username) DO NOTHING;

-- Los usuarios adicionales se crean desde midPoint (http://localhost:8080/midpoint)
-- con rol AgenteCallCenter y se provisionan automáticamente en Asterisk.
