CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE,
    description TEXT,
    poster TEXT,
    backdrop TEXT,
    year INTEGER,
    genre TEXT,
    rating REAL DEFAULT 0,
    duration TEXT,
    language TEXT,
    quality TEXT,
    featured INTEGER DEFAULT 0,
    download_url TEXT,
    watch_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_movies_title
ON movies(title);

CREATE INDEX IF NOT EXISTS idx_movies_year
ON movies(year);

CREATE INDEX IF NOT EXISTS idx_movies_featured
ON movies(featured);
