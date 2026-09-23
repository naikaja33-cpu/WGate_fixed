PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS society (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    total_flats INTEGER DEFAULT 0,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL,
    created_by TEXT,
    created_by_id TEXT,
    is_sample INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL,
    created_by TEXT,
    created_by_id TEXT,
    is_sample INTEGER DEFAULT 0,

    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    disabled INTEGER DEFAULT 0,
    is_verified INTEGER DEFAULT 0,

    app_id TEXT,
    is_service INTEGER DEFAULT 0,
    _app_role TEXT,

    role TEXT DEFAULT 'tenant',
    flat_number TEXT,
    phone TEXT,
    society_id TEXT,

    password_hash TEXT,

    FOREIGN KEY (society_id)
        REFERENCES society(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS visitor (
    id TEXT PRIMARY KEY,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL,
    created_by TEXT,
    created_by_id TEXT,
    is_sample INTEGER DEFAULT 0,

    visitor_name TEXT,
    visitor_phone TEXT,

    purpose TEXT,
    flat_number TEXT,
    resident_email TEXT,

    status TEXT DEFAULT 'pending',

    vehicle_number TEXT,
    photo_url TEXT,

    check_in_time TEXT,
    check_out_time TEXT,

    notes TEXT
);

CREATE TABLE IF NOT EXISTS service_ticket (
    id TEXT PRIMARY KEY,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL,
    created_by TEXT,
    created_by_id TEXT,
    is_sample INTEGER DEFAULT 0,

    title TEXT,
    description TEXT,

    category TEXT,
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'open',

    flat_number TEXT,
    resident_email TEXT,

    assigned_to TEXT,
    resolution_notes TEXT,
    photo_url TEXT
);

CREATE TABLE IF NOT EXISTS maintenance_bill (
    id TEXT PRIMARY KEY,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL,
    created_by TEXT,
    created_by_id TEXT,
    is_sample INTEGER DEFAULT 0,

    flat_number TEXT,
    resident_email TEXT,
    resident_name TEXT,

    amount REAL,
    month TEXT,
    month_label TEXT,
    due_date TEXT,

    status TEXT DEFAULT 'pending',

    paid_date TEXT,
    payment_mode TEXT,
    transaction_id TEXT,

    notes TEXT,
    line_items TEXT
);

CREATE TABLE IF NOT EXISTS notice (
    id TEXT PRIMARY KEY,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL,
    created_by TEXT,
    created_by_id TEXT,
    is_sample INTEGER DEFAULT 0,

    title TEXT,
    content TEXT,
    type TEXT,

    society_id TEXT,
    society_name TEXT,

    posted_by TEXT,
    event_date TEXT,

    is_pinned INTEGER DEFAULT 0,

    FOREIGN KEY (society_id)
        REFERENCES society(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS society_settings (
    id TEXT PRIMARY KEY,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL,
    created_by TEXT,
    created_by_id TEXT,
    is_sample INTEGER DEFAULT 0,

    society_id TEXT UNIQUE,
    enabled_menus TEXT,

    FOREIGN KEY (society_id)
        REFERENCES society(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth_session (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (user_id)
        REFERENCES user(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notification (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,

    title TEXT,
    message TEXT,
    type TEXT,

    read INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,

    FOREIGN KEY (user_id)
        REFERENCES user(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public_app_settings (
    id TEXT PRIMARY KEY,
    public_settings_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_email
ON user(email);

CREATE INDEX IF NOT EXISTS idx_user_society
ON user(society_id);

CREATE INDEX IF NOT EXISTS idx_visitor_status
ON visitor(status);

CREATE INDEX IF NOT EXISTS idx_visitor_flat
ON visitor(flat_number);

CREATE INDEX IF NOT EXISTS idx_ticket_status
ON service_ticket(status);

CREATE INDEX IF NOT EXISTS idx_ticket_email
ON service_ticket(resident_email);

CREATE INDEX IF NOT EXISTS idx_bill_status
ON maintenance_bill(status);

CREATE INDEX IF NOT EXISTS idx_bill_email
ON maintenance_bill(resident_email);

CREATE INDEX IF NOT EXISTS idx_notice_society
ON notice(society_id);

CREATE INDEX IF NOT EXISTS idx_notification_user
ON notification(user_id);