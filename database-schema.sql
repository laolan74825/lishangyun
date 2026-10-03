-- ============================================================
-- 礼云随笔 — 数据库建表脚本
-- 数据库：SQLite（轻量级，适合本地存储场景）
-- 版本：v2.3
-- 编制日期：2026-09-07
-- ============================================================

-- ---------------------------------------------------------
-- 1. 人员表（person）
-- 说明：日常人情往来的人员档案，用于长期关系维护与智能匹配
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS person (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            VARCHAR(50) NOT NULL                COMMENT '真实姓名',
    nickname        VARCHAR(50)                         COMMENT '称呼/昵称，如"二舅"',
    phone           VARCHAR(20)                         COMMENT '电话号码，用于精确匹配',
    aliases         JSON DEFAULT '[]'                   COMMENT '历史别名数组，JSON格式，用于智能匹配',
    relation_tag    VARCHAR(20) DEFAULT '其他'           COMMENT '关系标签：亲戚/朋友/同事/同学/邻居/其他',
    note            TEXT                                COMMENT '备注',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间'
);

CREATE INDEX IF NOT EXISTS idx_person_name ON person(name);
CREATE INDEX IF NOT EXISTS idx_person_phone ON person(phone);

-- ---------------------------------------------------------
-- 2. 收款账户表（payment_account）
-- 说明：现金收银人与微信收款账户的全局配置
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_account (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            VARCHAR(50) NOT NULL                COMMENT '自定义显示名称，如"李四-微信"',
    type            VARCHAR(10) NOT NULL                COMMENT '账户类型：cash（现金）/ wechat（微信）',
    identifier      VARCHAR(50)                         COMMENT '微信号标识（仅微信类型时填写）',
    daily_limit     INTEGER DEFAULT 2000000000          COMMENT '每日限额金额（单位：分），默认200000万',
    qr_code         TEXT                                COMMENT '微信收款二维码图片（Base64或URL，仅微信类型）',
    is_active       BOOLEAN DEFAULT 1                   COMMENT '是否系统默认：1默认 / 0非默认（每种类型唯一）',
    is_disabled     BOOLEAN DEFAULT 0                   COMMENT '是否停用：1停用（业务页面不可选择）/ 0正常',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',

    CONSTRAINT chk_payment_type CHECK (type IN ('cash', 'wechat'))
);

CREATE INDEX IF NOT EXISTS idx_payment_type ON payment_account(type);
CREATE INDEX IF NOT EXISTS idx_payment_active ON payment_account(is_active);
CREATE INDEX IF NOT EXISTS idx_payment_disabled ON payment_account(is_disabled);

-- ---------------------------------------------------------
-- 3. 礼簿表（guestbook）
-- 说明：一次宴席的独立收礼账本
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS guestbook (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            VARCHAR(100) NOT NULL               COMMENT '礼簿名称，如"张小明婚礼收礼"',
    event_type      VARCHAR(30) NOT NULL                COMMENT '事由类型：婚礼/寿宴/满月酒/乔迁/升学/丧葬/其他',
    event_date      DATE NOT NULL                       COMMENT '宴席日期',
    status          VARCHAR(20) DEFAULT '收礼中'         COMMENT '状态：收礼中 / 已完成',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    completed_at    DATETIME                            COMMENT '标记完成的时间',
    operator_note   TEXT                                COMMENT '创建者备注',

    CONSTRAINT chk_guestbook_status CHECK (status IN ('收礼中', '已完成'))
);

CREATE INDEX IF NOT EXISTS idx_guestbook_status ON guestbook(status);
CREATE INDEX IF NOT EXISTS idx_guestbook_date ON guestbook(event_date);

-- ---------------------------------------------------------
-- 4. 礼簿收礼记录表（gb_record）
-- 说明：礼簿内的单笔收礼记录，是系统的核心数据表
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS gb_record (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    guestbook_id    INTEGER NOT NULL                    COMMENT '所属礼簿ID',
    person_id       INTEGER                             COMMENT '合并后关联的日常人员ID（可为空）',
    guest_name      VARCHAR(50) NOT NULL                COMMENT '宾客姓名（礼簿中原始录入）',
    phone           VARCHAR(20)                         COMMENT '电话号码，用于精确匹配',
    amount          INTEGER NOT NULL                    COMMENT '金额（单位：分）',
    payment_method  VARCHAR(10) NOT NULL                COMMENT '收款方式：cash / wechat / other',
    account_id      INTEGER                             COMMENT '关联收款账户ID',
    note            TEXT                                COMMENT '备注，可记录付款方微信昵称等',
    agent_name      VARCHAR(50)                         COMMENT '经办人/代理人姓名（如为代理送礼）',
    check_status    VARCHAR(20) DEFAULT 'unchecked'     COMMENT '对账状态：unchecked（未对账）/ checked（已对账）',
    record_time     DATETIME DEFAULT CURRENT_TIMESTAMP  COMMENT '记账时间，漏记补记时可手动设置，精确到秒',
    client_id       VARCHAR(50)                         COMMENT '客户端标识',
    operator_name   VARCHAR(50)                         COMMENT '终端记账员姓名',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP  COMMENT '数据创建时间（系统时间，不可改）',

    CONSTRAINT chk_payment_method CHECK (payment_method IN ('cash', 'wechat', 'other')),
    CONSTRAINT chk_check_status CHECK (check_status IN ('unchecked', 'checked')),
    FOREIGN KEY (guestbook_id) REFERENCES guestbook(id) ON DELETE CASCADE,
    FOREIGN KEY (person_id) REFERENCES person(id) ON DELETE SET NULL,
    FOREIGN KEY (account_id) REFERENCES payment_account(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_gbrecord_guestbook ON gb_record(guestbook_id);
CREATE INDEX IF NOT EXISTS idx_gbrecord_person ON gb_record(person_id);
CREATE INDEX IF NOT EXISTS idx_gbrecord_account ON gb_record(account_id);
CREATE INDEX IF NOT EXISTS idx_gbrecord_check ON gb_record(check_status);
CREATE INDEX IF NOT EXISTS idx_gbrecord_recordtime ON gb_record(record_time);
CREATE INDEX IF NOT EXISTS idx_gbrecord_name ON gb_record(guest_name);

-- ---------------------------------------------------------
-- 5. 操作日志表（operation_log）
-- 说明：记录每一笔收礼操作的新增/编辑/删除，用于审计追溯
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS operation_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    guestbook_id    INTEGER NOT NULL                    COMMENT '所属礼簿ID',
    gb_record_id    INTEGER                             COMMENT '被操作的收礼记录ID（可为空）',
    action_type     VARCHAR(20) NOT NULL                COMMENT '操作类型：CREATE / UPDATE / DELETE / MERGE',
    operator_name   VARCHAR(50)                         COMMENT '终端记账员姓名',
    client_id       VARCHAR(50)                         COMMENT '客户端标识',
    before_data     JSON                                COMMENT '操作前完整数据快照（JSON）',
    after_data      JSON                                COMMENT '操作后完整数据快照（JSON）',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP  COMMENT '操作时间（精确到毫秒）',

    CONSTRAINT chk_action_type CHECK (action_type IN ('CREATE', 'UPDATE', 'DELETE', 'MERGE')),
    FOREIGN KEY (guestbook_id) REFERENCES guestbook(id) ON DELETE CASCADE,
    FOREIGN KEY (gb_record_id) REFERENCES gb_record(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_olog_guestbook ON operation_log(guestbook_id);
CREATE INDEX IF NOT EXISTS idx_olog_record ON operation_log(gb_record_id);
CREATE INDEX IF NOT EXISTS idx_olog_operator ON operation_log(operator_name);
CREATE INDEX IF NOT EXISTS idx_olog_time ON operation_log(created_at);

-- ---------------------------------------------------------
-- 6. 终端设置表（terminal_settings）
-- 说明：每个协作终端的记账员、默认收款人等配置
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS terminal_settings (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    guestbook_id            INTEGER NOT NULL            COMMENT '所属礼簿ID',
    client_id               VARCHAR(50) NOT NULL        COMMENT '客户端唯一标识',
    operator_name           VARCHAR(50) NOT NULL        COMMENT '终端记账员姓名',
    default_cash_account    INTEGER                     COMMENT '默认现金收银人ID',
    default_wechat_account  INTEGER                     COMMENT '默认微信收款账户ID',
    updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP  COMMENT '更新时间',

    FOREIGN KEY (guestbook_id) REFERENCES guestbook(id) ON DELETE CASCADE,
    FOREIGN KEY (default_cash_account) REFERENCES payment_account(id) ON DELETE SET NULL,
    FOREIGN KEY (default_wechat_account) REFERENCES payment_account(id) ON DELETE SET NULL,
    UNIQUE(guestbook_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_terminal_guestbook ON terminal_settings(guestbook_id);
CREATE INDEX IF NOT EXISTS idx_terminal_client ON terminal_settings(client_id);

-- ============================================================
-- 常用查询视图
-- ============================================================

-- 视图：礼簿汇总统计（总金额、总笔数、各账户金额）
CREATE VIEW IF NOT EXISTS v_guestbook_summary AS
SELECT
    g.id AS guestbook_id,
    g.name AS guestbook_name,
    COUNT(r.id) AS total_records,
    COALESCE(SUM(r.amount), 0) AS total_amount,
    SUM(CASE WHEN r.check_status = 'checked' THEN 1 ELSE 0 END) AS checked_count,
    SUM(CASE WHEN r.check_status = 'unchecked' THEN 1 ELSE 0 END) AS unchecked_count
FROM guestbook g
LEFT JOIN gb_record r ON g.id = r.guestbook_id
GROUP BY g.id, g.name;

-- 视图：按账户统计（单礼簿内各收款账户金额）
CREATE VIEW IF NOT EXISTS v_account_summary AS
SELECT
    r.guestbook_id,
    a.id AS account_id,
    a.name AS account_name,
    a.type AS account_type,
    COUNT(r.id) AS record_count,
    COALESCE(SUM(r.amount), 0) AS total_amount
FROM gb_record r
JOIN payment_account a ON r.account_id = a.id
GROUP BY r.guestbook_id, a.id, a.name, a.type;

-- ============================================================
-- 插入示例数据（可选，用于开发和测试）
-- ============================================================

-- 示例人员
INSERT INTO person (name, nickname, phone, relation_tag) VALUES
('王大壮', '大壮哥', '13800138001', '朋友'),
('李秀英', '秀英姐', '13900139002', '亲戚'),
('赵大伟', '大伟', '13700137003', '同事'),
('刘建国', '建国舅', NULL, '亲戚');

-- 示例收款账户
INSERT INTO payment_account (name, type, identifier, daily_limit, is_active) VALUES
('张三（现金）', 'cash', NULL, 0, 1),
('王五（现金）', 'cash', NULL, 0, 1),
('李四-微信1', 'wechat', 'wx_li4', 2000000000, 1),
('赵六-微信2', 'wechat', 'wx_zhao6', 2000000000, 1);

-- 示例礼簿
INSERT INTO guestbook (name, event_type, event_date, status) VALUES
('张小明婚礼收礼', '婚礼', '2026-10-01', '收礼中');

-- ============================================================
-- 说明
-- ============================================================
-- 1. 本脚本基于 SQLite 语法，适用于浏览器端（sql.js）或移动端本地数据库。
-- 2. 金额字段统一使用 INTEGER（单位：分），避免浮点数精度问题。
-- 3. JSON 字段在 SQLite 中存储为 TEXT，应用层负责序列化/反序列化。
-- 4. 外键约束需确保 SQLite 的 foreign_keys 开关已启用：
--    PRAGMA foreign_keys = ON;
-- 5. 索引设计基于需求文档中的高频查询场景：
--    - 按礼簿查记录（gb_record.guestbook_id）
--    - 按人员查往来（gb_record.person_id / person.phone）
--    - 按账户统计（gb_record.account_id）
--    - 对账筛选（gb_record.check_status）
--    - 操作日志追溯（operation_log.guestbook_id / operator_name）
-- 6. 终端设置表使用 UNIQUE(guestbook_id, client_id) 确保每个终端在
--    同一礼簿中只有一条配置记录。
-- ============================================================
