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
    password_hash VARCHAR(255),
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
    ('admin1', 'Admin Uno', 'admin1@callcenter.local', 'Admin', '3001', 'sip3001pass', '$2b$10$9BsuCKyssqlHDeKSQehNUur5K3BOJ7BE8OpOhbUzzxcdaMcKn8k7m', TRUE),
    ('admin2', 'Admin Dos', 'admin2@callcenter.local', 'AgenteCallCenter', '3002', 'sip3002pass', '$2b$10$2gXsw2jwqORF0wlQ6peWM.wqyFsf3rOI3z46YX29/5fA2usmg4O.O', TRUE),
    ('agente1', 'Agente Uno', 'agente1@callcenter.local', 'AgenteCallCenter', '3005', 'sip3005pass', '$2b$10$4NtezVzCBApid2XDjd2RResFKKbLi24zxlqtsvXEmLAVhqgkq8WtK', TRUE),
    ('agente2', 'Agente Dos', 'agente2@callcenter.local', 'AgenteCallCenter', '3006', 'sip3006pass', '$2b$10$lxv4k5f8HCQ2q2x8S97maely4k/cFNeDgA1pOuGY72lW8YuGDnQHi', TRUE)
ON CONFLICT (username) DO NOTHING;

-- Los usuarios adicionales se crean desde midPoint (http://localhost:8080/midpoint)
-- con rol AgenteCallCenter y se provisionan automáticamente en Asterisk.
-- Usuarios por defecto:
--   admin1 / sip3001pass (ext. 3001, rol Admin)
--   admin2 / sip3002pass (ext. 3002, rol AgenteCallCenter)
--   agente1 / sip3005pass (ext. 3005, rol AgenteCallCenter)
--   agente2 / sip3006pass (ext. 3006, rol AgenteCallCenter)
