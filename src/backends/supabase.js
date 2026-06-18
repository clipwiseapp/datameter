'use strict';
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
let supabaseClient = null;
let pgPool = null;
function getPool() {
  if (pgPool) return pgPool;
  pgPool = new Pool({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  return pgPool;
}
function getSBClient() {
  if (supabaseClient) return supabaseClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  supabaseClient = createClient(url, key);
  return supabaseClient;
}
async function executeSQLviaPg(sql) {
  const start = Date.now();
  const pool = getPool();
  try {
    const result = await pool.query(sql);
    return { ok: true, rows: result.rows, rowCount: result.rowCount ?? result.rows.length, durationMs: Date.now() - start };
  } catch (err) {
    return { ok: false, error: err.message, rows: [], rowCount: 0, durationMs: Date.now() - start };
  }
}
async function executeSQLviaRest(sql) {
  const sb = getSBClient();
  const start = Date.now();
  try {
    const match = sql.match(/FROM\s+(\w+)/i);
    const table = match ? match[1] : null;
    if (!table) throw new Error('Could not parse table name from SQL');
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    const limit = limitMatch ? parseInt(limitMatch[1]) : 100;
    const { data, error } = await sb.from(table).select('*').limit(limit);
    if (error) throw new Error(error.message);
    return { ok: true, rows: data || [], rowCount: (data || []).length, durationMs: Date.now() - start };
  } catch (err) {
    return { ok: false, error: err.message, rows: [], rowCount: 0, durationMs: Date.now() - start };
  }
}
async function executeSQL(sql) {
  return process.env.SUPABASE_DB_URL ? executeSQLviaPg(sql) : executeSQLviaRest(sql);
}
module.exports = { executeSQL };
