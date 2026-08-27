const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

let pool = null;
let isConnected = false;

function initPool() {
  const connectionString = process.env.DATABASE_URL || process.env.PGDATABASE_URL;
  if (!connectionString) {
    console.log('[DB] No DATABASE_URL found. Running in filesystem fallback mode.');
    return false;
  }

  try {
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1') ? false : { rejectUnauthorized: false }
    });
    return true;
  } catch (err) {
    console.error('[DB] Failed to create Postgres pool:', err.message);
    return false;
  }
}

async function init() {
  if (!initPool()) return false;

  try {
    const client = await pool.connect();
    console.log('[DB] Connected to PostgreSQL Database successfully!');

    // Read and run schema.sql
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await client.query(sql);
      console.log('[DB] Database schema migration executed successfully!');
    }

    client.release();
    isConnected = true;
    return true;
  } catch (err) {
    console.error('[DB] PostgreSQL connection error:', err.message);
    isConnected = false;
    return false;
  }
}

async function getAllSkus() {
  if (!isConnected || !pool) return null;
  try {
    const res = await pool.query('SELECT * FROM skus ORDER BY created_at DESC');
    return res.rows;
  } catch (err) {
    console.error('[DB] Error querying getAllSkus:', err.message);
    return null;
  }
}

async function getSku(sku) {
  if (!isConnected || !pool) return null;
  try {
    const res = await pool.query('SELECT * FROM skus WHERE LOWER(sku) = LOWER($1)', [sku]);
    return res.rows[0] || null;
  } catch (err) {
    console.error('[DB] Error querying getSku:', err.message);
    return null;
  }
}

async function upsertSku(skuData) {
  if (!isConnected || !pool) return false;
  const { sku, stoneId, frameCount, hasVideo, hasHtml, thumbnail, v360Url, modernUrl, videoUrl, createdAt } = skuData;

  const sql = `
    INSERT INTO skus (sku, stone_id, frame_count, has_video, has_html, thumbnail_url, v360_url, modern_url, video_url, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
    ON CONFLICT (sku) DO UPDATE SET
      stone_id = EXCLUDED.stone_id,
      frame_count = EXCLUDED.frame_count,
      has_video = EXCLUDED.has_video,
      has_html = EXCLUDED.has_html,
      thumbnail_url = EXCLUDED.thumbnail_url,
      v360_url = EXCLUDED.v360_url,
      modern_url = EXCLUDED.modern_url,
      video_url = EXCLUDED.video_url,
      updated_at = CURRENT_TIMESTAMP;
  `;

  try {
    await pool.query(sql, [
      sku,
      stoneId || sku,
      frameCount || 0,
      hasVideo || false,
      hasHtml || false,
      thumbnail || null,
      v360Url || null,
      modernUrl || null,
      videoUrl || null,
      createdAt || new Date()
    ]);
    return true;
  } catch (err) {
    console.error(`[DB] Error upserting SKU ${sku}:`, err.message);
    return false;
  }
}

async function deleteSku(sku) {
  if (!isConnected || !pool) return false;
  try {
    await pool.query('DELETE FROM skus WHERE LOWER(sku) = LOWER($1)', [sku]);
    return true;
  } catch (err) {
    console.error(`[DB] Error deleting SKU ${sku}:`, err.message);
    return false;
  }
}

module.exports = {
  init,
  getAllSkus,
  getSku,
  upsertSku,
  deleteSku,
  get isConnected() { return isConnected; }
};
