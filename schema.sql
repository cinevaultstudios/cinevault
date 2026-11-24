
-- =========================================
-- CINEVAULT DATABASE SCHEMA
-- CLOUDFLARE D1 / SQLITE
-- COMPLETE INITIAL DATABASE STRUCTURE
-- =========================================

PRAGMA foreign_keys = ON;

-- =========================================
-- MOVIES
-- =========================================

CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT,
    description TEXT DEFAULT '',
    poster TEXT DEFAULT '',
    backdrop TEXT DEFAULT '',
    year INTEGER,
    genre TEXT DEFAULT '',
    rating REAL DEFAULT 0,
    duration TEXT DEFAULT '',
    language TEXT DEFAULT '',
    country TEXT DEFAULT '',
    director TEXT DEFAULT '',
    quality TEXT DEFAULT '',
    featured INTEGER DEFAULT 0,
    download_url TEXT DEFAULT '',
    download_url_2 TEXT DEFAULT '',
    watch_url TEXT DEFAULT '',
    ad_url TEXT DEFAULT '',
    ad_count INTEGER NOT NULL DEFAULT 4,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_movies_title
ON movies(title);

CREATE INDEX IF NOT EXISTS idx_movies_year
ON movies(year);

CREATE INDEX IF NOT EXISTS idx_movies_genre
ON movies(genre);

CREATE INDEX IF NOT EXISTS idx_movies_language
ON movies(language);

CREATE INDEX IF NOT EXISTS idx_movies_rating
ON movies(rating);

CREATE INDEX IF NOT EXISTS idx_movies_featured
ON movies(featured);

CREATE INDEX IF NOT EXISTS idx_movies_slug
ON movies(slug);

CREATE INDEX IF NOT EXISTS idx_movies_created
ON movies(created_at);

-- =========================================
-- WEBSITE SETTINGS
-- =========================================

CREATE TABLE IF NOT EXISTS site_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL DEFAULT '',
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- =========================================
-- MOVIE COLLECTIONS
-- =========================================

CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    image TEXT DEFAULT '',
    icon TEXT DEFAULT '',
    genre TEXT DEFAULT '',
    link_url TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_collections_sort
ON collections(sort_order);

CREATE INDEX IF NOT EXISTS idx_collections_active
ON collections(is_active);

-- =========================================
-- END OF CINEVAULT DATABASE SCHEMA
-- =========================================
