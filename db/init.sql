CREATE DATABASE IF NOT EXISTS midpoint;
GRANT ALL PRIVILEGES ON midpoint.* TO 'callcenter'@'%';

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    role ENUM('AgenteCallCenter', 'Supervisor', 'Admin') NOT NULL DEFAULT 'AgenteCallCenter',
    sip_extension VARCHAR(10) UNIQUE,
    sip_password VARCHAR(64),
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cdr (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
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
    recording_url VARCHAR(512) DEFAULT '',
    INDEX idx_calldate (calldate),
    INDEX idx_src (src),
    INDEX idx_dst (dst)
);

CREATE TABLE IF NOT EXISTS recordings (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    uniqueid VARCHAR(32) NOT NULL,
    caller VARCHAR(10) DEFAULT '',
    callee VARCHAR(10) DEFAULT '',
    duration INT DEFAULT 0,
    filesize BIGINT DEFAULT 0,
    minio_url VARCHAR(512) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_uniqueid (uniqueid),
    INDEX idx_caller (caller)
);

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    username VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    extension VARCHAR(10),
    ip_address VARCHAR(45),
    details TEXT,
    INDEX idx_timestamp (timestamp),
    INDEX idx_username (username)
);

INSERT INTO users (username, full_name, email, role, sip_extension, sip_password, enabled) VALUES
('agente1', 'Agente Uno', 'agente1@callcenter.local', 'AgenteCallCenter', '1001', 'sip1001pass', 1),
('agente2', 'Agente Dos', 'agente2@callcenter.local', 'AgenteCallCenter', '1002', 'sip1002pass', 1),
('supervisor1', 'Supervisor Uno', 'supervisor1@callcenter.local', 'Supervisor', '2001', 'sip2001pass', 1),
('admin1', 'Admin Uno', 'admin1@callcenter.local', 'Admin', '3001', 'sip3001pass', 1);
