-- PostgreSQL Schema Migration for V360 SKU Library
CREATE TABLE IF NOT EXISTS skus (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(100) UNIQUE NOT NULL,
    stone_id VARCHAR(100),
    frame_count INT DEFAULT 0,
    has_video BOOLEAN DEFAULT false,
    has_html BOOLEAN DEFAULT false,
    thumbnail_url TEXT,
    v360_url TEXT,
    modern_url TEXT,
    video_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_skus_sku ON skus(sku);
CREATE INDEX IF NOT EXISTS idx_skus_created_at ON skus(created_at DESC);
