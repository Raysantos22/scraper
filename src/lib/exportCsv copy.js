require('dotenv').config()
const { execFile } = require('child_process')
const express = require('express')
const cors    = require('cors')
const mysql   = require('mysql2/promise')
const fs      = require('fs')      // ← add this
const path    = require('path')    // ← add this

const app = express()
app.use(cors({
  origin: [
    'https://scraper-five-pi.vercel.app',
    'http://localhost:5173',
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))
app.use(express.json())

const pool = mysql.createPool({
  host:               process.env.DB_HOST,
  user:               process.env.DB_USER,
  password:           process.env.DB_PASSWORD,
  database:           process.env.DB_NAME,
  port:               process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit:    10,
})

const SKU_LOOKUP_THRESHOLD = 200
const PRICE_RUNS_DIR = '/home/emega/client/ozhair/scraper/creatorsapi-python-sdk/examples'

function buildWhere(query) {
  const { search, category, stock, supplier_id, minQty, minPrice, maxPrice, freshness, override, uploaded } = query
  const conditions = []
  const params     = []
  if (search) {
    conditions.push('(title LIKE ? OR sku LIKE ? OR brand LIKE ?)')
    params.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }
  if (category)        { conditions.push('category = ?');    params.push(category) }
  if (stock === 'in')  conditions.push('stock > 0')
  if (stock === 'out') conditions.push('stock = 0')
  if (supplier_id)     { conditions.push('supplier_id = ?'); params.push(supplier_id) }
  if (minQty)          { conditions.push('stock >= ?');      params.push(minQty) }
  if (minPrice)        { conditions.push('price >= ?');      params.push(minPrice) }
  if (maxPrice)        { conditions.push('price <= ?');      params.push(maxPrice) }

  // Updated At (freshness)
  if (freshness) {
    if (freshness === 'today') {
      conditions.push('DATE(updated_at) = CURDATE()')
    } else if (freshness.startsWith('stale_')) {
      const days = parseInt(freshness.replace('stale_', ''))
      conditions.push('updated_at < DATE_SUB(NOW(), INTERVAL ? DAY)')
      params.push(days)
    } else {
      conditions.push('updated_at >= DATE_SUB(NOW(), INTERVAL ? DAY)')
      params.push(parseInt(freshness))
    }
  }

  // Uploaded At (created_at)
  if (uploaded) {
    if (uploaded === 'today') {
      conditions.push('DATE(created_at) = CURDATE()')
    } else if (uploaded.startsWith('stale_')) {
      const days = parseInt(uploaded.replace('stale_', ''))
      conditions.push('created_at < DATE_SUB(NOW(), INTERVAL ? DAY)')
      params.push(days)
    } else {
      conditions.push('created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)')
      params.push(parseInt(uploaded))
    }
  }

  if (override === 'true') conditions.push('is_overridden = 1')
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params }
}
// --- CONTENT VIOLATION SCAN (title + description of paired eBay/AutoDS items) -


// --- KEYSET-PAGINATED CSV (fast at any depth ï¿½ no OFFSET, no full-scan-and-discard) ---
function csvEscape(v) {
  const s = v == null ? '' : String(v)
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

// baseSql must select a `cursor_key` column (usually the sku/order column) and
// must NOT include its own ORDER BY/LIMIT ï¿½ those are added here.
// cursorCol is the raw column expression used for keyset comparison, e.g. 'c.sku'
async function keysetCsvExport(res, baseSql, params, cursorCol, columns, filename, batchSize = 5000) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.write(columns.join(',') + '\n')

  let lastKey = null
  while (true) {
    const whereClause = lastKey === null ? '' : `AND ${cursorCol} > ?`
    const queryParams = lastKey === null ? params : [...params, lastKey]

    const [rows] = await pool.query(
      `${baseSql} ${whereClause} ORDER BY ${cursorCol} ASC LIMIT ?`,
      [...queryParams, batchSize]
    )
    if (rows.length === 0) break

    let chunk = ''
    for (const row of rows) {
      chunk += columns.map(c => csvEscape(row[c])).join(',') + '\n'
    }
    const ok = res.write(chunk)
    if (!ok) await new Promise(resolve => res.once('drain', resolve))

    lastKey = rows[rows.length - 1].__cursor_key
    if (rows.length < batchSize) break
  }
  res.end()
}
let _keywordRegexes = []
async function loadBannedKeywords() {
  const [rows] = await pool.query(
    'SELECT keyword, match_type FROM banned_keywords WHERE active = 1'
  )
  _keywordRegexes = rows.map(r => ({
    keyword: r.keyword,
    re: r.match_type === 'exact_word'
      ? new RegExp(`\\b${r.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      : new RegExp(r.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
  }))
}
loadBannedKeywords().catch(e => console.error('loadBannedKeywords init error:', e.message))

const _URL_RE          = /(?:https?:\/\/|www\.)\S+/gi
const _DOMAIN_RE       = /\b[a-zA-Z0-9][a-zA-Z0-9-]*\.(?:com|net|org|co|io|shop|store)(?:\.au|\.uk|\.nz)?\b/gi
const _EMAIL_RE        = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi
const _CONTACT_RE      = /(contact us|visit us|visit our (?:website|store|page)|for more information[^.]*?(?:contact|visit)[^.]*)/gi
const _PHONE_RE        = /(?:\+?61[\s.-]?)?(?:\(0\)|0)?[2-478][\s.-]?\d{4}[\s.-]?\d{4}\b|\b1[38]00[\s.-]?\d{3}[\s.-]?\d{3}\b/gi
const _PHONE_LABEL_RE  = /\b(?:tel|telephone|call us now|call us on|mobile)\b\s*[:\-]\s*(?=\d)/gi
const _AMAZON_RE       = /\bamazon(\.com)?\b/gi

// New: messaging apps mentioned by name (WeChat, Line, Viber, Skype, Discord, Snapchat, TikTok, Kakao)
const _MESSAGING_APP_RE = /\b(?:wechat|we chat|line id|viber|skype|discord|snapchat|kakao ?talk)\b/gi

// New: "DM us", "message us", "inbox us", "follow us on" phrasing
const _DM_PHRASE_RE = /\b(?:dm (?:us|me)|message us|inbox us|follow us on|add us on|find us on)\b/gi

// New: @handle style social mentions (e.g. @mystorename)
const _SOCIAL_HANDLE_RE = /(?<![\w.])@[a-zA-Z0-9_.]{3,30}\b/g

function checkText(text) {
  if (!text) return []
  const hits = []
  if (_URL_RE.test(text))           hits.push('url')
  if (_EMAIL_RE.test(text))         hits.push('email')
  if (_CONTACT_RE.test(text))       hits.push('contact_phrase')
  if (_PHONE_RE.test(text) || _PHONE_LABEL_RE.test(text)) hits.push('phone')
  if (_DOMAIN_RE.test(text))        hits.push('domain')
  if (_AMAZON_RE.test(text))        hits.push('amazon_mention')
  if (_MESSAGING_APP_RE.test(text)) hits.push('messaging_app')
  if (_DM_PHRASE_RE.test(text))     hits.push('dm_phrase')
  if (_SOCIAL_HANDLE_RE.test(text)) hits.push('social_handle')
  ;[_URL_RE,_DOMAIN_RE,_EMAIL_RE,_CONTACT_RE,_PHONE_RE,_PHONE_LABEL_RE,_AMAZON_RE,_MESSAGING_APP_RE,_DM_PHRASE_RE,_SOCIAL_HANDLE_RE].forEach(r => r.lastIndex = 0)
  for (const { keyword, re } of _keywordRegexes) {
    if (re.test(text)) hits.push(`keyword:${keyword}`)
  }
  return hits
}

async function scanContentViolations() {
  const [rows] = await pool.query(`
    SELECT ec.sku, ec.store_name, ec.item_id, sm.origin_sku, ap.autods_id, ap.title, ap.description
    FROM ebay_current ec
    JOIN sku_map sm
      ON SUBSTRING(ec.sku, 2) COLLATE utf8mb4_0900_ai_ci = sm.ebay_sku COLLATE utf8mb4_0900_ai_ci
    JOIN autods_products ap
      ON sm.origin_sku COLLATE utf8mb4_0900_ai_ci = ap.sku COLLATE utf8mb4_0900_ai_ci
    WHERE ec.sku LIKE 'A%' AND ec.sku NOT LIKE 'ALX_%' AND ec.sku NOT LIKE 'AZDP_%'
      AND (ap.title IS NOT NULL OR ap.description IS NOT NULL)
  `)

  const values = []
  for (const r of rows) {
    const titleHits = checkText(r.title).map(h => `title:${h}`)
    const descHits  = checkText(r.description).map(h => `desc:${h}`)
    const allHits   = [...titleHits, ...descHits]
    if (allHits.length) {
      values.push([
        r.store_name,
        r.sku,
        r.sku,
        r.origin_sku,
        r.autods_id,
        r.item_id,
        (r.title || '').slice(0, 500),
        (r.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000),
        allHits.join(', ')
      ])
    }
  }

  await pool.query('TRUNCATE TABLE content_violation_flags')
  if (values.length) {
    const CHUNK = 500
    for (let i = 0; i < values.length; i += CHUNK) {
      await pool.query(
        `INSERT INTO content_violation_flags (store_name, sku, ebay_sku, origin_sku, autods_id, item_id, title, description, reason) VALUES ?`,
        [values.slice(i, i + CHUNK)]
      )
    }
  }
  return values.length
}

function csvRes(res, rows, columns, filename) {
  const escape = v => {
    const s = v == null ? '' : String(v)
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const header = columns.join(',')
  const body = rows.map(row => columns.map(c => escape(row[c])).join(',')).join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(header + '\n' + body)
}
// --- Refresh banned_skus_store_cache -----------------------------------------
async function refreshBannedSkusCache() {
  const conn = await pool.getConnection()
  try {
    // --- eBay-live banned cache: build into a shadow table, then atomic swap ---
    await conn.query('DROP TABLE IF EXISTS banned_skus_on_ebay_new')
    await conn.query('CREATE TABLE banned_skus_on_ebay_new LIKE banned_skus_on_ebay')

    await conn.query(`
      INSERT INTO banned_skus_on_ebay_new
      SELECT * FROM (
        SELECT ec.store_name,ec.sku,ec.item_id,ec.price,ec.quantity,bs.sku AS banned_sku,
          COALESCE(sm.origin_sku,ec.group_sku,ec.sku) AS origin_sku,
          ap.autods_id,bs.reason,bs.added_at,ec.snapshot_date
        FROM banned_skus bs
        JOIN ebay_current ec ON ec.sku=bs.sku COLLATE utf8mb4_0900_ai_ci
        LEFT JOIN sku_map sm ON sm.ebay_sku=SUBSTR(ec.sku,2) COLLATE utf8mb4_0900_ai_ci
        LEFT JOIN autods_products ap ON ap.sku=COALESCE(sm.origin_sku,ec.group_sku) COLLATE utf8mb4_0900_ai_ci
        UNION
        SELECT ec.store_name,ec.sku,ec.item_id,ec.price,ec.quantity,bs.sku,
          COALESCE(sm.origin_sku,ec.group_sku,ec.sku),ap.autods_id,bs.reason,bs.added_at,ec.snapshot_date
        FROM banned_skus bs
        JOIN ebay_current ec ON ec.group_sku=bs.sku COLLATE utf8mb4_0900_ai_ci
        LEFT JOIN sku_map sm ON sm.ebay_sku=SUBSTR(ec.sku,2) COLLATE utf8mb4_0900_ai_ci
        LEFT JOIN autods_products ap ON ap.sku=COALESCE(sm.origin_sku,ec.group_sku) COLLATE utf8mb4_0900_ai_ci
        UNION
        SELECT ec.store_name,ec.sku,ec.item_id,ec.price,ec.quantity,bs.sku,sm.origin_sku,
          ap.autods_id,bs.reason,bs.added_at,ec.snapshot_date
        FROM banned_skus bs
        JOIN sku_map sm ON sm.origin_sku=bs.sku COLLATE utf8mb4_0900_ai_ci
        JOIN ebay_current ec ON ec.sku=CONCAT('A',sm.ebay_sku) COLLATE utf8mb4_0900_ai_ci
        LEFT JOIN autods_products ap ON ap.sku=sm.origin_sku COLLATE utf8mb4_0900_ai_ci
      ) t
    `)

    await conn.query('DROP TABLE IF EXISTS banned_skus_on_ebay_old')
    await conn.query(`
      RENAME TABLE
        banned_skus_on_ebay     TO banned_skus_on_ebay_old,
        banned_skus_on_ebay_new TO banned_skus_on_ebay
    `)
    await conn.query('DROP TABLE IF EXISTS banned_skus_on_ebay_old')

    // --- Per-store counts, derived from the table we just swapped in ---
    await conn.query('DELETE FROM banned_skus_store_cache')
    await conn.query(`
      INSERT INTO banned_skus_store_cache (store_name, banned_count)
      SELECT store_name, COUNT(*) FROM banned_skus_on_ebay
      GROUP BY store_name
      ON DUPLICATE KEY UPDATE banned_count=VALUES(banned_count), updated_at=NOW()
    `)

    // --- AutoDS-side banned cache: same shadow-swap pattern ---
    await conn.query('DROP TABLE IF EXISTS banned_autods_cache_new')
    await conn.query('CREATE TABLE banned_autods_cache_new LIKE banned_autods_cache')
    await conn.query(`
      INSERT INTO banned_autods_cache_new
      SELECT ap.sku, ap.autods_id, ap.price, ap.stock,
        ap.inventory_status, ap.is_active,
        bs.reason, bs.added_at, ap.updated_at
      FROM autods_products ap
      JOIN banned_skus bs ON ap.sku = bs.sku COLLATE utf8mb4_0900_ai_ci
      WHERE ap.is_active = 1
    `)
    await conn.query('DROP TABLE IF EXISTS banned_autods_cache_old')
    await conn.query(`
      RENAME TABLE
        banned_autods_cache     TO banned_autods_cache_old,
        banned_autods_cache_new TO banned_autods_cache
    `)
    await conn.query('DROP TABLE IF EXISTS banned_autods_cache_old')

    console.log('refreshBannedSkusCache: completed OK')
  } catch (e) {
    console.error('refreshBannedSkusCache error:', e.message)
    console.error(e.stack)
    // Don't leave half-built shadow tables lying around blocking the next run
    try {
      await conn.query('DROP TABLE IF EXISTS banned_skus_on_ebay_new')
      await conn.query('DROP TABLE IF EXISTS banned_autods_cache_new')
    } catch (_) {}
    throw e   // propagate — callers must know this failed, not swallow it
  } finally {
    conn.release()
  }
}
// -----------------------------------------------------------------------------
// ADD PRODUCT (by ASIN via Amazon Creators API) ï¿½ paste into server.js
// Put this block anywhere in the PRODUCTS section, e.g. right after the
// existing `app.get('/api/products/:id', ...)` route and before
// `app.put('/api/products/:id', ...)`.
//
// Requires at the top of server.js (add next to your other requires):
//   const { execFile } = require('child_process')
// -----------------------------------------------------------------------------

// fetch_single_product.py lives in the same folder as the working
// sample_get_items_urbanvista1.py ï¿½ this is the folder where
// `sys.path.append('..')` correctly resolves to creatorsapi_python_sdk.
const ADD_PRODUCT_SCRIPT = '/home/emega/client/ozhair/scraper/creatorsapi-python-sdk/examples/fetch_single_product.py'

// Must use the venv's python3 ï¿½ this is where pydantic/dateutil/etc are
// actually installed, NOT the system python3.
const PYTHON_BIN = '/home/emega/client/ozhair/scraper/ozhair/venv/bin/python3'

// Parses "name1:value1 | name2:value2" into [{name, value}, ...] pairs.
// Splits each pair on the FIRST colon only, since values can contain their
// own colons (e.g. "color_name:A: Grey/Beige").
function parseVariationAttrs(attrString) {
  const options = []
  if (!attrString) return options
  const pairs = attrString.split(' | ')
  for (const pair of pairs) {
    const idx = pair.indexOf(':')
    if (idx === -1) continue
    const name = pair.slice(0, idx).trim()
    const value = pair.slice(idx + 1).trim()
    options.push({ name, value })
  }
  return options
}

// POST /api/products/add   { asin, supplier_id }
// Which Amazon account is used to fetch is picked automatically inside
// fetch_single_product.py ï¿½ no dropdown needed for that on the frontend.
app.post('/api/products/add', async (req, res) => {
  const { asin, supplier_id } = req.body || {}

  if (!asin || !supplier_id) {
    return res.status(400).json({ error: 'asin and supplier_id are required' })
  }
  if (!/^[A-Z0-9]{10}$/i.test(asin.trim())) {
    return res.status(400).json({ error: 'ASIN looks invalid (expected 10 alphanumeric chars)' })
  }

  let fetched
  try {
    fetched = await runAddProductScript(asin.trim())
  } catch (err) {
    console.error('fetch_single_product.py failed:', err.message)
    return res.status(502).json({ error: err.message || 'Failed to fetch product from Amazon' })
  }

  try {
    const [existing] = await pool.query(
      'SELECT product_id FROM products WHERE sku = ? LIMIT 1',
      [fetched.sku]
    )
    if (existing.length) {
      return res.status(409).json({
        error: 'Product with this SKU already exists',
        product_id: existing[0].product_id,
      })
    }

    const [result] = await pool.query(
      `INSERT INTO products
         (sku, title, brand, price, stock, images, description, product_url, category, metadata, supplier_id, product_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        fetched.sku,
        fetched.title,
        fetched.brand || null,
        fetched.price,
        fetched.stock,
        JSON.stringify(fetched.images),
        fetched.description || null,
        fetched.detail_page_url || null,
        fetched.category || null,
        JSON.stringify(fetched.metadata || {}),
        supplier_id,
        fetched.product_type || 'simple',
      ]
    )

    // Insert variant siblings, if this ASIN turned out to be a variation parent.
    if (Array.isArray(fetched.variants) && fetched.variants.length) {
      for (const v of fetched.variants) {
        const opts = parseVariationAttrs(v.variation_attributes)
        const variantMetadata = {
          condition: v.condition || '',
          merchant_name: v.merchant_name || '',
          dimensions: {
            length: v.item_length || '',
            width: v.item_width || '',
            height: v.item_height || '',
            unit: v.item_length_unit || '',
          },
          category: v.category || '',
          description: v.description || '',
          detail_page_url: v.detail_page_url || '',
          brand: v.brand || '',
        }
        await pool.query(
          `INSERT INTO variants
             (product_id, variant_sku, variant_name, price, stock, images,
              option1_name, option1_value, option2_name, option2_value, option3_name, option3_value,
              metadata, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            result.insertId,
            v.sku,
            v.title || null,
            v.price,
            v.stock,
            JSON.stringify(v.images || []),
            opts[0]?.name || null, opts[0]?.value || null,
            opts[1]?.name || null, opts[1]?.value || null,
            opts[2]?.name || null, opts[2]?.value || null,
            JSON.stringify(variantMetadata),
          ]
        )
      }
    }

    const [[newRow]] = await pool.query('SELECT * FROM products WHERE product_id = ?', [result.insertId])
    return res.status(201).json(newRow)
  } catch (err) {
    console.error('Add product DB insert failed:', err.message)
    return res.status(500).json({ error: 'Fetched product but failed to save it to the database' })
  }
})

function runAddProductScript(asin) {
  return new Promise((resolve, reject) => {
    execFile(
      PYTHON_BIN,
      [ADD_PRODUCT_SCRIPT, '--asin', asin],
      { timeout: 30_000 },
      (err, stdout, stderr) => {
        if (stderr) console.log('[fetch_single_product.py]', stderr.trim())

        if (err) {
          const lastLine = stderr.trim().split('\n').pop() || 'Script failed'
          return reject(new Error(lastLine.replace(/^ERROR:\s*/, '')))
        }
        try {
          resolve(JSON.parse(stdout.trim()))
        } catch {
          reject(new Error('Could not parse product data from script output'))
        }
      }
    )
  })
}
// --- SYNC LAST-SYNCED --------------------------------------------------------
app.get('/api/sync/last-synced', async (req, res) => {
  try {
    const [[ebay]]   = await pool.query('SELECT MAX(scraped_at) AS last_updated FROM ebay_current')
    const [[autods]] = await pool.query('SELECT MAX(updated_at) AS updated_at FROM autods_products')
    res.json({
      ebay:   ebay?.last_updated ? new Date(ebay.last_updated).toISOString() : null,
      autods: autods?.updated_at ? new Date(autods.updated_at).toISOString() : null,
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
// --- BANNED SKUS -------------------------------------------------------------
app.get('/api/banned-skus', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM banned_skus ORDER BY added_at DESC')
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/banned-skus/count', async (req, res) => {
  try {
    const [[total]]   = await pool.query('SELECT COUNT(*) AS total FROM banned_skus')
    const [[onEbay]]  = await pool.query('SELECT COALESCE(SUM(banned_count), 0) AS on_ebay FROM banned_skus_store_cache')
    const [[autods]]  = await pool.query('SELECT COUNT(*) AS total, SUM(CASE WHEN stock > 0 THEN 1 ELSE 0 END) AS with_stock FROM banned_autods_cache')
    res.json({
      total:              total.total,
      on_ebay:            onEbay.on_ebay,
      autods_total:       autods.total,
      autods_with_stock:  autods.with_stock,
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
app.get('/api/banned-skus/combined', async (req, res) => {
  try {
    const [[bannedRows], [liveRows]] = await Promise.all([
      pool.query('SELECT * FROM banned_skus ORDER BY added_at DESC'),
      pool.query('SELECT * FROM banned_skus_on_ebay'),
    ])
    res.json({ banned: bannedRows, live: liveRows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/banned-skus/live', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM banned_skus_on_ebay')
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})
app.get('/api/ebay/listings/export', async (req, res) => {
  try {
    const { store_name, search, stock } = req.query
    const conditions = ['1=1']
    const params = []
    if (store_name) { conditions.push('ec.store_name = ?'); params.push(store_name) }
    if (search)     { conditions.push('(ec.sku LIKE ? OR ec.item_id LIKE ?)'); params.push(`%${search}%`, `%${search}%`) }
    if (stock === 'in')  conditions.push('ec.quantity > 0')
    if (stock === 'out') conditions.push('ec.quantity = 0')
    if (stock === 'low') conditions.push('ec.quantity > 0 AND ec.quantity <= 3')
    const where = conditions.join(' AND ')
    const [rows] = await pool.query(`
      SELECT
        ec.sku, ec.group_sku, sm.origin_sku, ap.autods_id,
        ec.item_id, ec.price, ec.quantity,
        ap.oos_since,
        COALESCE(ec.scraped_at, ec.snapshot_date) AS snapshot
      FROM ebay_current ec
      LEFT JOIN sku_map sm
        ON SUBSTRING(ec.sku, 2) COLLATE utf8mb4_0900_ai_ci = sm.ebay_sku COLLATE utf8mb4_0900_ai_ci
        AND ec.sku LIKE 'A%' AND ec.sku NOT LIKE 'AZDP_%'
      LEFT JOIN autods_products ap
        ON sm.origin_sku COLLATE utf8mb4_0900_ai_ci = ap.sku COLLATE utf8mb4_0900_ai_ci
      WHERE ${where}
      ORDER BY ec.sku ASC
    `, params)
    const slug    = (store_name || 'store').replace(/\s+/g, '_')
    const suffix  = stock ? `_${stock}` : ''
    const date    = new Date().toISOString().slice(0, 10)
    csvRes(
      res, rows,
      ['sku','group_sku','origin_sku','autods_id','item_id','price','quantity','oos_since','snapshot'],
      `${slug}${suffix}_listings_${date}.csv`
    )
  } catch (e) { res.status(500).json({ error: e.message }) }
})
// All banned SKUs with eBay + AutoDS details where available
app.get('/api/banned-skus/export-all', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        b.sku,
        b.reason,
        b.added_at,
        b.added_by,
        e.store_name,
        e.item_id,
        e.price,
        e.quantity,
        e.origin_sku,
        e.autods_id
      FROM banned_skus b
      LEFT JOIN banned_skus_on_ebay e
        ON b.sku COLLATE utf8mb4_0900_ai_ci = e.sku COLLATE utf8mb4_0900_ai_ci
      ORDER BY b.added_at DESC
    `)
    csvRes(
      res, rows,
      ['sku','origin_sku','autods_id','store_name','item_id','price','quantity','reason','added_at','added_by'],
      `banned_skus_all_${new Date().toISOString().slice(0,10)}.csv`
    )
  } catch (e) { res.status(500).json({ error: e.message }) }
})
app.get('/api/banned-skus/autods', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM banned_autods_cache ORDER BY stock DESC, updated_at DESC'
    )
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/banned-skus/autods/count', async (req, res) => {
  try {
    const [[total]]  = await pool.query('SELECT COUNT(*) AS total FROM banned_autods_cache')
    const [[active]] = await pool.query('SELECT COUNT(*) AS active FROM banned_autods_cache WHERE stock > 0')
    res.json({ total: total.total, with_stock: active.active })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
app.get('/api/banned-skus/export', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM banned_skus_on_ebay')
    csvRes(res, rows, ['store_name','sku','item_id','price','quantity','reason','added_at','snapshot_date'],
      `banned_skus_live_${new Date().toISOString().slice(0,10)}.csv`)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/banned-skus/refresh-cache', async (req, res) => {
  try {
    await refreshBannedSkusCache()   // never throws — the function already caught its own error
    res.json({ success: true, message: 'Banned SKUs cache refreshed' })  // always fires
  } catch (e) { res.status(500).json({ error: e.message }) }
})
app.post('/api/banned-skus', async (req, res) => {
  try {
    const { sku, reason } = req.body
    await pool.query(
      'INSERT INTO banned_skus (sku, reason) VALUES (?) ON DUPLICATE KEY UPDATE reason=VALUES(reason)',
      [[sku, reason || 'Banned item']]
    )
    refreshBannedSkusCache()
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Bulk import ï¿½ single SQL insert for up to 500 SKUs at a time1
app.post('/api/banned-skus/bulk', async (req, res) => {
  try {
    const { items } = req.body // [{ sku, reason }, ...]
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'No items provided' })

    const values = items
      .filter(i => i.sku?.trim())
      .map(i => [i.sku.trim().toUpperCase(), i.reason?.trim() || 'Bulk import'])

    if (values.length === 0)
      return res.status(400).json({ error: 'No valid SKUs' })

    const [result] = await pool.query(
      `INSERT INTO banned_skus (sku, reason) VALUES ?
       ON DUPLICATE KEY UPDATE reason = VALUES(reason)`,
      [values]
    )

    refreshBannedSkusCache()
    res.json({
      success:  true,
      inserted: result.affectedRows,
      total:    values.length,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/banned-skus/:sku', async (req, res) => {
  try {
    await pool.query('DELETE FROM banned_skus WHERE sku = ?', [req.params.sku])
    refreshBannedSkusCache()
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// --- HEALTH ------------------------------------------------------------------1
app.get('/health', (req, res) => res.json({ status: 'ok' }))

// --- EBAY --------------------------------------------------------------------
app.get('/api/ebay/summary', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM ebay_store_stats ORDER BY store_name ASC')
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/ebay/chart', async (req, res) => {
  try {
    const { since } = req.query
    const [rows] = await pool.query(`
      SELECT snapshot_date, store_name,
        COUNT(*) AS total_items,
        SUM(CASE WHEN quantity > 0 THEN 1 ELSE 0 END) AS active_listings,
        SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END) AS out_of_stock
      FROM ebay_listings
      WHERE snapshot_date >= ?
      GROUP BY store_name, snapshot_date
      ORDER BY snapshot_date ASC
    `, [since])
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/ebay/listings', async (req, res) => {
  try {
    const { store_name, page = 0, limit = 50, search, stock } = req.query
    const offset = parseInt(page) * parseInt(limit)
    const conditions = ['1=1']
    const params = []
    if (store_name) { conditions.push('ec.store_name = ?'); params.push(store_name) }
    if (search)     { conditions.push('(ec.sku LIKE ? OR ec.item_id LIKE ?)'); params.push(`%${search}%`, `%${search}%`) }
    if (stock === 'in')  conditions.push('ec.quantity > 0')
    if (stock === 'out') conditions.push('ec.quantity = 0')
    if (stock === 'low') conditions.push('ec.quantity > 0 AND ec.quantity <= 3')
    const where = conditions.join(' AND ')
    const [rows] = await pool.query(`
      SELECT
        ec.id, ec.store_name, ec.sku, ec.price, ec.quantity,
        ec.item_id, ec.group_sku, ec.snapshot_date,
	ec.scraped_at,
        COALESCE(ec.scraped_at, ec.snapshot_date) AS updated_at,
        sm.origin_sku,
        ap.autods_id,
        ap.oos_since
      FROM ebay_current ec
      LEFT JOIN sku_map sm
        ON SUBSTRING(ec.sku, 2) COLLATE utf8mb4_0900_ai_ci = sm.ebay_sku COLLATE utf8mb4_0900_ai_ci
        AND ec.sku LIKE 'A%' AND ec.sku NOT LIKE 'AZDP_%'
      LEFT JOIN autods_products ap
        ON sm.origin_sku COLLATE utf8mb4_0900_ai_ci = ap.sku COLLATE utf8mb4_0900_ai_ci
      WHERE ${where}
      ORDER BY ec.sku ASC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset])
    const [[{ total }]] = await pool.query(`
      SELECT COUNT(*) as total FROM ebay_current ec WHERE ${where}
    `, params)
    res.json({ data: rows, count: total })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
// --- STORES ------------------------------------------------------------------
app.get('/api/stores/combined', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        e.store_name,
        e.total_items,
        e.active_listings,
        e.out_of_stock,
        e.amazon_items,
        e.other_items,
        e.ozh_items,
        e.priceline_items,
        e.totaltools_items,
        e.mecca_items,
        e.sephora_items,
        e.house_items,
        e.vb_items,
        e.avg_price,
        e.last_updated,
        COALESCE(s.paired,            0) AS paired,
        COALESCE(s.not_updating,      0) AS not_updating,
        COALESCE(s.not_updating_azdp, 0) AS not_updating_azdp,
        COALESCE(s.not_on_ebay,       0) AS not_on_ebay,
        s.computed_at,
        COALESCE(b.banned_count,      0) AS banned_count
      FROM ebay_store_stats e
      LEFT JOIN stores_summary_cache s
        ON e.store_name COLLATE utf8mb4_unicode_ci = s.store_name COLLATE utf8mb4_unicode_ci
      LEFT JOIN banned_skus_store_cache b
        ON e.store_name = b.store_name
      ORDER BY e.total_items DESC
    `)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/stores/summary', async (req, res) => {
  try {
    const [[ebayRow]] = await pool.query(`
      SELECT SUM(total_items) AS total_listings, SUM(active_listings) AS total_active,
        SUM(out_of_stock) AS total_oos, COUNT(*) AS store_count, MAX(last_updated) AS last_updated
      FROM ebay_store_stats
    `)
    const [[syncRow]] = await pool.query('SELECT * FROM summary_cache WHERE id = 1')
    res.json({ ...ebayRow, ...(syncRow || {}) })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/stores/suppliers', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        SUM(amazon_items)     AS amazon,
        SUM(ozh_items)        AS ozh,
        SUM(priceline_items)  AS priceline,
        SUM(totaltools_items) AS totaltools,
        SUM(mecca_items)      AS mecca,
        SUM(sephora_items)    AS sephora,
        SUM(house_items)      AS house,
        SUM(vb_items)         AS vb,
        SUM(other_items)      AS other
      FROM ebay_store_stats
    `)
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// --- SYNC --------------------------------------------------------------------
app.get('/api/sync/summary', async (req, res) => {
  try {
    const [[row]] = await pool.query('SELECT * FROM summary_cache WHERE id = 1')
    if (!row) return res.status(503).json({ error: 'Cache not yet computed.' })
    res.json(row)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/sync/stores', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM stores_summary_cache ORDER BY not_updating DESC')
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/sync/refresh', async (req, res) => {
  try {
    await pool.query('CALL refresh_summary_cache()')
    res.json({ success: true, message: 'Cache refreshed successfully' })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
app.post('/api/sync/refresh-store-stats', async (req, res) => {
  try {
    // Step 1: Rebuild ebay_store_stats from ebay_current (live listings table)
    await pool.query(`
      UPDATE ebay_store_stats ess
      JOIN (
        SELECT
          store_name,
          COUNT(*)                                                        AS total_items,
          SUM(CASE WHEN quantity > 0 THEN 1 ELSE 0 END)                  AS active_listings,
          SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END)                  AS out_of_stock,
          SUM(CASE WHEN sku LIKE 'A%' OR sku LIKE 'AZDP_%' THEN 1 ELSE 0 END) AS amazon_items,
          SUM(CASE WHEN sku NOT LIKE 'A%' AND sku NOT LIKE 'AZDP_%' THEN 1 ELSE 0 END) AS other_items,
          SUM(CASE WHEN sku LIKE 'OZH_%'  THEN 1 ELSE 0 END)            AS ozh_items,
          SUM(CASE WHEN sku LIKE 'PL_%'   THEN 1 ELSE 0 END)            AS priceline_items,
          SUM(CASE WHEN sku LIKE 'TOT_%'  THEN 1 ELSE 0 END)            AS totaltools_items,
          SUM(CASE WHEN sku LIKE 'MCC_%'  THEN 1 ELSE 0 END)            AS mecca_items,
          SUM(CASE WHEN sku LIKE 'SEP_%'  THEN 1 ELSE 0 END)            AS sephora_items,
          SUM(CASE WHEN sku LIKE 'HOU_%'  THEN 1 ELSE 0 END)            AS house_items,
          SUM(CASE WHEN sku LIKE 'VB_%'   THEN 1 ELSE 0 END)            AS vb_items,
          AVG(price)                                                      AS avg_price
        FROM ebay_current
        GROUP BY store_name
      ) fresh ON ess.store_name = fresh.store_name
      SET
        ess.total_items      = fresh.total_items,
        ess.active_listings  = fresh.active_listings,
        ess.out_of_stock     = fresh.out_of_stock,
        ess.amazon_items     = fresh.amazon_items,
        ess.other_items      = fresh.other_items,
        ess.ozh_items        = fresh.ozh_items,
        ess.priceline_items  = fresh.priceline_items,
        ess.totaltools_items = fresh.totaltools_items,
        ess.mecca_items      = fresh.mecca_items,
        ess.sephora_items    = fresh.sephora_items,
        ess.house_items      = fresh.house_items,
        ess.vb_items         = fresh.vb_items,
        ess.avg_price        = fresh.avg_price,
        ess.last_updated     = NOW()
    `)

    // Step 2: Also refresh the summary cache (pair rates, AutoDS counts)
    try { await pool.query('CALL refresh_summary_cache()') } catch (_) {}

    // Step 3: Refresh banned SKUs cache
    try {
      await pool.query('DELETE FROM banned_skus_store_cache')
      await pool.query(`
        INSERT INTO banned_skus_store_cache (store_name, banned_count)
        SELECT store_name, COUNT(*) AS banned_count
        FROM banned_skus_on_ebay
        GROUP BY store_name
        ON DUPLICATE KEY UPDATE banned_count = VALUES(banned_count), updated_at = NOW()
      `)
    } catch (_) {}

    res.json({ success: true, message: 'Store stats refreshed from ebay_current' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
app.get('/api/sync/export-csv', async (req, res) => {
  try {
    const { status, store_name } = req.query
    const statusMap = {
      active_no_autods: "status COLLATE utf8mb4_0900_ai_ci = 'EBAY_ONLY' AND ebay_qty > 0",
      dead_no_autods:   "status COLLATE utf8mb4_0900_ai_ci = 'EBAY_ONLY' AND ebay_qty = 0",
      active_no_skumap: "status COLLATE utf8mb4_0900_ai_ci = 'NO_SKU_MAP' AND ebay_qty > 0",
      dead_no_skumap:   "status COLLATE utf8mb4_0900_ai_ci = 'NO_SKU_MAP' AND ebay_qty = 0",
      matched:          "status COLLATE utf8mb4_0900_ai_ci = 'MATCHED'",
    }
    const condition  = statusMap[status] || "status IS NOT NULL"
    const conditions = [condition]
    const params     = []
    if (store_name) { conditions.push('store_name COLLATE utf8mb4_0900_ai_ci = ?'); params.push(store_name) }
    const [rows] = await pool.query(
      `SELECT store_name, ebay_sku, amazon_id, item_id, ebay_price, ebay_qty,
              autods_price, autods_stock, status, snapshot_date
       FROM sync_amazon_comparison WHERE ${conditions.join(' AND ')}
       ORDER BY store_name, ebay_sku`, params)
    csvRes(res, rows, ['store_name','ebay_sku','amazon_id','item_id','ebay_price','ebay_qty','autods_price','autods_stock','status','snapshot_date'],
      `sync_${status || 'export'}_${new Date().toISOString().slice(0,10)}.csv`)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/sync/export-autods-only', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        c.sku,
        a.autods_id,
        COALESCE(a.price, c.price)           AS price,
        COALESCE(a.stock, c.stock)           AS stock,
        a.product_status,
        a.inventory_status,
        a.oos_since,
        DATE_FORMAT(COALESCE(a.updated_at, c.updated_at), '%Y-%m-%d %H:%i:%s') AS updated_at
      FROM sync_autods_not_ebay_cache c
      LEFT JOIN autods_products a
        ON c.sku COLLATE utf8mb4_0900_ai_ci = a.sku COLLATE utf8mb4_0900_ai_ci
      ORDER BY a.stock DESC, a.price ASC
    `)
    csvRes(res, rows, ['sku','autods_id','price','stock','product_status','inventory_status','oos_since','updated_at'], `autods_not_on_ebay_${new Date().toISOString().slice(0,10)}.csv`)
  } catch (e) { res.status(500).json({ error: e.message }) }
})
// --- EXPORT COUNTS -----------------------------------------------------------
// All counts come from pre-computed cache tables or ebay_store_stats aggregates
// to avoid slow full-table scans on ebay_current (no sku index)
// --- EXPORT COUNTS -----------------------------------------------------------
// All counts come from pre-computed cache tables or ebay_store_stats aggregates
// to avoid slow full-table scans on ebay_current (no sku index)
app.get('/api/export/counts', async (req, res) => {
  try {
    const [
      [cacheRows],
      [storeRows],
    ] = await Promise.all([
      pool.query('SELECT * FROM summary_cache WHERE id = 1'),
      // Pull amazon vs supplier active/oos from ebay_store_stats (instant ï¿½ 53 rows)
      pool.query(`
        SELECT
          SUM(active_listings)                         AS total_active,
          SUM(out_of_stock)                            AS total_oos,
          SUM(amazon_items)                            AS amazon_total,
          SUM(active_listings) - SUM(amazon_items)     AS supplier_active,
          SUM(out_of_stock)    - SUM(other_items)      AS supplier_oos
        FROM ebay_store_stats
      `),
    ])

    const cache = cacheRows[0] || {}
    const store = storeRows[0] || {}

    const paired         = Number(cache.paired            || 0)
    const notUpd         = Number(cache.not_updating      || 0)
    const notUpdAzdp     = Number(cache.not_updating_azdp || 0)
    const autodsTotal    = Number(cache.autods_total      || 0)
    const ebayTotalAmz   = Number(cache.ebay_total_amazon || 0)

    // Amazon active/oos derived from store stats
    const totalActive    = Number(store.total_active   || 0)
    const totalOos       = Number(store.total_oos      || 0)
    const amazonTotal    = Number(store.amazon_total   || 0)
    const supplierActive = Number(store.supplier_active || 0)
    const supplierOos    = Number(store.supplier_oos   || 0)
    // Amazon active = total active minus supplier active
    const amazonActive   = totalActive - supplierActive
    // Amazon OOS = total oos minus supplier oos
    const amazonOos      = totalOos - supplierOos
    // OOS with no AutoDS = amazon OOS that are not paired
    // paired count is active+oos combined, so oos_no_autods = amazon_oos - (paired - amazon_active paired)
    // Best approximation from cache: total amazon oos - paired that are oos
    // Use: ebay_total_amazon - paired = total not monitored; split by active/oos ratio
    const notMonitored   = ebayTotalAmz - paired  // total amazon listings with no autods
    const oosNoAutods    = Math.round(notMonitored * (amazonOos / (ebayTotalAmz || 1)))

    res.json({
      // eBay Amazon
      'ebay-active-amazon':        amazonActive,
      'ebay-oos-amazon':           amazonOos,
      // eBay Supplier
      'ebay-active-supplier':      supplierActive,
      'ebay-oos-supplier':         supplierOos,
      // legacy keys kept for frontend compatibility
      'ebay-active':               amazonActive,
      'ebay-oos':                  amazonOos,
      // No AutoDS
      'ebay-active-no-autods':     notUpd,
      'ebay-dead-no-autods':       oosNoAutods,
      'ebay-no-autods':            notMonitored,
      // AutoDS ï¿½ READ FROM SUMMARY_CACHE, NOT FROM CACHE TABLE
      'autods-matched':            paired,
      'autods-all':                autodsTotal,
      'autods-not-ebay':           Number(cache.not_on_ebay || 0),  // ? Changed: now reads from SP
      'not-updating-azdp':         notUpdAzdp,
      // Supplier inventory
      'all-paired':                paired,
   'active-truly-healthy':   Number(cache.active_truly_healthy   || 0),
   'active-autods-inactive': Number(cache.active_autods_inactive || 0),
   'active-autods-oos':      Number(cache.active_autods_oos      || 0),
   'active-autods-onhold':   Number(cache.active_autods_onhold   || 0),
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
// --- EXPORT CSV ROUTES -------------------------------------------------------

// eBay Amazon active listings
app.get('/api/export/ebay-active', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT store_name, sku, item_id, price, quantity
      FROM ebay_current
      WHERE sku LIKE 'A%' AND quantity > 0
      ORDER BY store_name, sku`)
    csvRes(res, rows, ['store_name','sku','item_id','price','quantity'], 'ebay_amazon_active.csv')
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// eBay Amazon OOS listings
app.get('/api/export/ebay-oos', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        ec.store_name, ec.sku, ec.item_id, ec.price, ec.quantity,
        sm.origin_sku, ap.autods_id,
        ap.product_status, ap.inventory_status
      FROM ebay_current ec
      LEFT JOIN sku_map sm
        ON SUBSTRING(ec.sku, 2) COLLATE utf8mb4_0900_ai_ci = sm.ebay_sku COLLATE utf8mb4_0900_ai_ci
        AND ec.sku LIKE 'A%' AND ec.sku NOT LIKE 'AZDP_%'
      LEFT JOIN autods_products ap
        ON sm.origin_sku COLLATE utf8mb4_0900_ai_ci = ap.sku COLLATE utf8mb4_0900_ai_ci
      WHERE ec.sku LIKE 'A%' AND ec.quantity = 0
      ORDER BY ec.store_name, ec.sku
    `)
    csvRes(res, rows,
      ['store_name','sku','origin_sku','autods_id','item_id','price','quantity','product_status','inventory_status'],
      'ebay_amazon_oos.csv')
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// eBay Supplier (non-Amazon) active listings
app.get('/api/export/ebay-active-supplier', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT store_name, sku, item_id, price, quantity
      FROM ebay_current
      WHERE sku NOT LIKE 'A%' AND quantity > 0
      ORDER BY store_name, sku`)
    csvRes(res, rows, ['store_name','sku','item_id','price','quantity'], 'ebay_supplier_active.csv')
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// eBay Supplier (non-Amazon) OOS listings
app.get('/api/export/ebay-oos-supplier', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT store_name, sku, item_id, price, quantity
      FROM ebay_current
      WHERE sku NOT LIKE 'A%' AND quantity = 0
      ORDER BY store_name, sku`)
    csvRes(res, rows, ['store_name','sku','item_id','price','quantity'], 'ebay_supplier_oos.csv')
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Active Amazon listings with no AutoDS monitoring (EBAY_ONLY status, active)
app.get('/api/export/ebay-active-no-autods', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        s.store_name, 
        s.ebay_sku AS sku, 
        s.amazon_id,
        s.item_id, 
        s.ebay_price AS price, 
        s.ebay_qty AS quantity, 
        a.autods_id,
        s.status
      FROM sync_amazon_comparison s
      LEFT JOIN autods_products a
        ON s.amazon_id COLLATE utf8mb4_0900_ai_ci = a.sku COLLATE utf8mb4_0900_ai_ci
      WHERE s.status COLLATE utf8mb4_0900_ai_ci = 'EBAY_ONLY'
      AND s.ebay_qty > 0
      AND s.ebay_sku COLLATE utf8mb4_0900_ai_ci LIKE 'A%'
      ORDER BY s.store_name, s.ebay_sku`)
    csvRes(res, rows, ['store_name','sku','amazon_id','item_id','price','quantity','autods_id','status'], 'ebay_active_no_autods.csv')
  } catch (e) { res.status(500).json({ error: e.message }) }
})
// OOS Amazon listings with no AutoDS monitoring (EBAY_ONLY status, oos)
app.get('/api/export/ebay-oos-no-autods', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        s.store_name, 
        s.ebay_sku AS sku, 
        s.amazon_id,
        s.item_id, 
        s.ebay_price AS price, 
        s.ebay_qty AS quantity, 
        a.autods_id,
        s.status
      FROM sync_amazon_comparison s
      LEFT JOIN autods_products a
        ON s.amazon_id COLLATE utf8mb4_0900_ai_ci = a.sku COLLATE utf8mb4_0900_ai_ci
      WHERE s.status COLLATE utf8mb4_0900_ai_ci = 'EBAY_ONLY'
      AND s.ebay_qty = 0
      AND s.ebay_sku COLLATE utf8mb4_0900_ai_ci LIKE 'A%'
      ORDER BY s.store_name, s.ebay_sku`)
    csvRes(res, rows, ['store_name','sku','amazon_id','item_id','price','quantity','autods_id','status'], 'ebay_oos_no_autods.csv')
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// eBay listings not in AutoDS at all (no SKU map match)
app.get('/api/export/ebay-no-autods', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        s.store_name, 
        s.ebay_sku AS sku, 
        s.amazon_id,
        s.item_id, 
        s.ebay_price AS price, 
        s.ebay_qty AS quantity,
        CASE WHEN s.ebay_qty > 0 THEN 'active' ELSE 'oos' END AS stock_status, 
        a.autods_id,
        s.status
      FROM sync_amazon_comparison s
      LEFT JOIN autods_products a
        ON s.amazon_id COLLATE utf8mb4_0900_ai_ci = a.sku COLLATE utf8mb4_0900_ai_ci
      WHERE s.status COLLATE utf8mb4_0900_ai_ci = 'EBAY_ONLY'
      AND s.ebay_sku COLLATE utf8mb4_0900_ai_ci LIKE 'A%'
      ORDER BY s.store_name, s.ebay_sku`)
    csvRes(res, rows, ['store_name','sku','amazon_id','item_id','price','quantity','stock_status','autods_id','status'], 'ebay_not_in_autods.csv')
  } catch (e) { res.status(500).json({ error: e.message }) }
})
// AutoDS all products
app.get('/api/export/autods-all', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT sku, autods_id, price, stock, inventory_status, oos_since, updated_at FROM autods_products ORDER BY sku'
    )
    csvRes(res, rows, ['sku','autods_id','price','stock','inventory_status','oos_since','updated_at'], 'autods_all.csv')
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// AutoDS matched (paired) with active eBay listings
app.get('/api/export/autods-matched', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT s.store_name, s.ebay_sku, s.amazon_id, s.item_id,
        s.ebay_price, s.ebay_qty, a.price AS autods_price,
        a.stock AS autods_stock, a.updated_at AS autods_updated_at
      FROM sync_amazon_comparison s
      JOIN autods_products a
        ON s.amazon_id COLLATE utf8mb4_0900_ai_ci = a.sku COLLATE utf8mb4_0900_ai_ci
      WHERE s.status = 'MATCHED'
      ORDER BY s.store_name, s.ebay_sku`)
    csvRes(res, rows, ['store_name','ebay_sku','amazon_id','item_id','ebay_price','ebay_qty','autods_price','autods_stock','autods_updated_at'], 'autods_matched.csv')
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/export/autods-not-ebay', async (req, res) => {
  try {
    await keysetCsvExport(
      res,
      `SELECT
        c.sku,
        c.sku AS __cursor_key,
        a.autods_id,
        COALESCE(a.price, c.price)           AS price,
        COALESCE(a.stock, c.stock)           AS stock,
        a.product_status,
        a.inventory_status,
        a.oos_since,
        DATE_FORMAT(COALESCE(a.updated_at, c.updated_at), '%Y-%m-%d %H:%i:%s') AS updated_at
      FROM sync_autods_not_ebay_cache c
      LEFT JOIN autods_products a
        ON c.sku COLLATE utf8mb4_0900_ai_ci = a.sku COLLATE utf8mb4_0900_ai_ci
      WHERE 1=1`,
      [],
      'c.sku',
      ['sku','autods_id','price','stock','product_status','inventory_status','oos_since','updated_at'],
      'autods_not_on_ebay.csv'
    )
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message })
    else res.end()
  }
})
// AZDP listings not updating in AutoDS
app.get('/api/export/not-updating-azdp', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT store_name, ebay_sku, amazon_id, item_id, ebay_price, ebay_qty, snapshot_date
      FROM sync_amazon_comparison
      WHERE status = 'EBAY_ONLY' AND ebay_sku LIKE 'AZDP%'
      ORDER BY store_name, ebay_sku`)
    csvRes(res, rows, ['store_name','ebay_sku','amazon_id','item_id','ebay_price','ebay_qty','snapshot_date'], 'not_updating_azdp.csv')
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// All paired listings
app.get('/api/export/all-paired', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT store_name, ebay_sku, amazon_id, item_id, ebay_price, ebay_qty,
             autods_price, autods_stock, status, snapshot_date
      FROM sync_amazon_comparison
      WHERE status = 'MATCHED'
      ORDER BY store_name, ebay_sku`)
    csvRes(res, rows, ['store_name','ebay_sku','amazon_id','item_id','ebay_price','ebay_qty','autods_price','autods_stock','status','snapshot_date'], 'all_paired.csv')
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Non-Amazon supplier products never listed on eBay
app.get('/api/export/nonamazon-unlisted', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        CASE
          WHEN p.sku LIKE 'PL_%'  THEN 'Priceline'
          WHEN p.sku LIKE 'OZH_%' THEN 'OZH'
          WHEN p.sku LIKE 'KG_%'  THEN 'KG'
          WHEN p.sku LIKE 'TOT_%' THEN 'Total Tools'
          WHEN p.sku LIKE 'MCC_%' THEN 'Mecca'
          WHEN p.sku LIKE 'SEP_%' THEN 'Sephora'
          WHEN p.sku LIKE 'HOU_%' THEN 'House'
          WHEN p.sku LIKE 'VB_%'  THEN 'Vics Basement'
          WHEN p.sku LIKE 'ALX_%' THEN 'ALX'
          ELSE 'other'
        END AS supplier,
        p.sku, p.title, p.price, p.stock
      FROM products p
      WHERE (p.sku LIKE 'PL_%' OR p.sku LIKE 'OZH_%' OR p.sku LIKE 'KG_%'
          OR p.sku LIKE 'TOT_%' OR p.sku LIKE 'MCC_%' OR p.sku LIKE 'SEP_%'
          OR p.sku LIKE 'HOU_%' OR p.sku LIKE 'VB_%'  OR p.sku LIKE 'ALX_%')
        AND p.sku NOT IN (SELECT sku FROM ebay_current)
      ORDER BY supplier, p.sku`)
    csvRes(res, rows, ['supplier','sku','title','price','stock'], 'nonamazon_never_listed.csv')
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// --- SUPPLIERS ---------------------------------------------------------------
app.get('/api/suppliers', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM suppliers')
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})
app.post('/api/suppliers', async (req, res) => {
  try {
    const { supplier_name } = req.body || {}
    const name = supplier_name?.trim()
    if (!name) return res.status(400).json({ error: 'supplier_name is required' })
 
    // Avoid dupes (case-insensitive) ï¿½ if "Amazon AU" already exists, return it
    // instead of creating a second row.
    const [existing] = await pool.query(
      'SELECT * FROM suppliers WHERE LOWER(supplier_name) = LOWER(?) LIMIT 1',
      [name]
    )
    if (existing.length) return res.status(200).json(existing[0])
 
    const [result] = await pool.query(
      'INSERT INTO suppliers (supplier_name) VALUES (?)',
      [name]
    )
    const [[newRow]] = await pool.query(
      'SELECT * FROM suppliers WHERE supplier_id = ?',
      [result.insertId]
    )
    res.status(201).json(newRow)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// --- PRODUCTS ----------------------------------------------------------------
app.get('/api/products/categories', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category')
    res.json(rows.map(r => r.category))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/products/override-skus', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT sku FROM product_overrides')
    res.json(rows.map(r => r.sku))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/products/avg-price', async (req, res) => {
  try {
    const [[row]] = await pool.query('SELECT AVG(price) as avg FROM products')
    res.json(parseFloat(row.avg || 0).toFixed(2))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/products/stats', async (req, res) => {
  try {
    const table = req.query.override === 'true' ? 'products_with_status' : 'products'
    const { where, params } = buildWhere(req.query)
    const [[counts]] = await pool.query(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN stock > 0 THEN 1 ELSE 0 END) as inStock,
        SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END) as outStock,
        AVG(price) as avgPrice
      FROM ${table} ${where}`, params)
    const [[{ varTotal }]] = await pool.query('SELECT COUNT(*) as varTotal FROM variants')
    res.json({
      total:      parseInt(counts.total)    || 0,
      inStock:    parseInt(counts.inStock)  || 0,
      outStock:   parseInt(counts.outStock) || 0,
      avgPrice:   parseFloat(counts.avgPrice || 0).toFixed(2),
      totalItems: (parseInt(counts.total) || 0) + (parseInt(varTotal) || 0),
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/products', async (req, res) => {
  try {
    const { page = 0, limit = 50, sort = 'created_at', dir = 'desc', override } = req.query
    const table    = override === 'true' ? 'products_with_status' : 'products'
    const offset   = parseInt(page) * parseInt(limit)
    const safeCols = ['created_at','title','price','stock','category','updated_at']
    const orderCol = safeCols.includes(sort) ? sort : 'created_at'
    const orderDir = dir === 'asc' ? 'ASC' : 'DESC'
    const cols = override === 'true'
  ? 'product_id,sku,title,price,stock,category,brand,images,supplier_id,product_type,created_at,updated_at,is_overridden,description'
  : 'product_id,sku,title,price,stock,category,brand,images,supplier_id,product_type,created_at,updated_at,description'
    const { where, params } = buildWhere(req.query)
    const [rows] = await pool.query(
      `SELECT ${cols} FROM ${table} ${where} ORDER BY ${orderCol} ${orderDir} LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset])
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM ${table} ${where}`, params)
    res.json({ data: rows, count: parseInt(total) })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/products/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE product_id = ?', [req.params.id])
    res.json(rows[0] || null)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/products/:id', async (req, res) => {
  try {
    const { title, price, stock, description, short_description, category, brand, images, product_url, metadata } = req.body
    await pool.query(`
      UPDATE products SET title=?, price=?, stock=?, description=?, short_description=?,
        category=?, brand=?, images=?, product_url=?, metadata=?, updated_at=NOW()
      WHERE product_id=?`,
      [title, price, stock, description, short_description, category, brand,
       JSON.stringify(images), JSON.stringify(metadata), req.params.id])
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// --- VARIANTS ----------------------------------------------------------------
app.get('/api/variants', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM variants WHERE product_id = ?', [req.query.product_id])
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// --- PRODUCT OVERRIDES -------------------------------------------------------
app.get('/api/product-overrides/bulk', async (req, res) => {
  res.status(405).json({ error: 'Use POST' })
})

app.post('/api/product-overrides/bulk', async (req, res) => {
  try {
    const { rows } = req.body
    if (!rows?.length) return res.json({ success: true })
    for (const row of rows) {
      await pool.query(`
        INSERT INTO product_overrides (sku, title, description, images, updated_at, updated_by)
        VALUES (?, ?, ?, ?, NOW(), 'csv_import')
        ON DUPLICATE KEY UPDATE title=VALUES(title), description=VALUES(description), images=VALUES(images), updated_at=NOW()`,
        [row.sku, row.title, row.description, JSON.stringify(row.images || [])])
    }
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/product-overrides', async (req, res) => {
  try {
    const { sku, title, description, images } = req.body
    await pool.query(`
      INSERT INTO product_overrides (sku, title, description, images, updated_at, updated_by)
      VALUES (?, ?, ?, ?, NOW(), 'user')
      ON DUPLICATE KEY UPDATE title=VALUES(title), description=VALUES(description), images=VALUES(images), updated_at=NOW()`,
      [sku, title, description, JSON.stringify(images || [])])
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/product-overrides/:sku', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM product_overrides WHERE sku = ?', [req.params.sku])
    res.json(rows[0] || null)
  } catch (e) { res.status(500).json({ error: e.message }) }
})
// -----------------------------------------------------------------------------
// STORE LIMITS ï¿½ paste these routes into server.js
// (add them anywhere before the SERVER section at the bottom)
// -----------------------------------------------------------------------------

// GET all store limits
app.get('/api/store-limits', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        store_name,
        items_listed_sold,
        items_limit,
        items_remaining,
        revenue_listed_sold,
        revenue_limit,
        revenue_remaining,
        items_raw,
        revenue_raw,
        updated_at
      FROM ebay_store_limits
      ORDER BY store_name ASC
    `)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET single store limit
app.get('/api/store-limits/:store', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM ebay_store_limits WHERE store_name = ?',
      [req.params.store.toUpperCase()]
    )
    res.json(rows[0] || null)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST bulk upsert (from CSV/paste import)
app.post('/api/store-limits/bulk', async (req, res) => {
  try {
    const { items } = req.body
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'No items provided' })

    let inserted = 0, updated = 0, skipped = 0

    for (const item of items) {
      const name = item.store_name?.trim().toUpperCase()
      if (!name) { skipped++; continue }

      await pool.query(`
        INSERT INTO ebay_store_limits
          (store_name,
           items_listed_sold, items_limit, items_remaining,
           revenue_listed_sold, revenue_limit, revenue_remaining,
           items_raw, revenue_raw, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'csv_import')
        ON DUPLICATE KEY UPDATE
          items_listed_sold   = VALUES(items_listed_sold),
          items_limit         = VALUES(items_limit),
          items_remaining     = VALUES(items_remaining),
          revenue_listed_sold = VALUES(revenue_listed_sold),
          revenue_limit       = VALUES(revenue_limit),
          revenue_remaining   = VALUES(revenue_remaining),
          items_raw           = VALUES(items_raw),
          revenue_raw         = VALUES(revenue_raw),
          updated_at          = NOW(),
          updated_by          = 'csv_import'
      `, [
        name,
        item.items_listed_sold   ?? null,
        item.items_limit         ?? null,
        item.items_remaining     ?? null,
        item.revenue_listed_sold ?? null,
        item.revenue_limit       ?? null,
        item.revenue_remaining   ?? null,
        item.items_raw           || null,
        item.revenue_raw         || null,
      ])

      inserted++
    }

    res.json({ success: true, inserted, updated, skipped, total: items.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PUT update a single store limit manually
app.put('/api/store-limits/:store', async (req, res) => {
  try {
    const { items_listed_sold, items_limit, revenue_listed_sold, revenue_limit } = req.body
    const items_remaining   = (items_limit   || 0) - (items_listed_sold   || 0)
    const revenue_remaining = (revenue_limit || 0) - (revenue_listed_sold || 0)
    await pool.query(`
      INSERT INTO ebay_store_limits
        (store_name, items_listed_sold, items_limit, items_remaining,
         revenue_listed_sold, revenue_limit, revenue_remaining, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 'manual')
      ON DUPLICATE KEY UPDATE
        items_listed_sold   = VALUES(items_listed_sold),
        items_limit         = VALUES(items_limit),
        items_remaining     = VALUES(items_remaining),
        revenue_listed_sold = VALUES(revenue_listed_sold),
        revenue_limit       = VALUES(revenue_limit),
        revenue_remaining   = VALUES(revenue_remaining),
        updated_at          = NOW(),
        updated_by          = 'manual'
    `, [
      req.params.store.toUpperCase(),
      items_listed_sold, items_limit, items_remaining,
      revenue_listed_sold, revenue_limit, revenue_remaining,
    ])
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// DELETE a single store limit
app.delete('/api/store-limits/:store', async (req, res) => {
  try {
    await pool.query('DELETE FROM ebay_store_limits WHERE store_name = ?', [req.params.store.toUpperCase()])
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
app.post('/api/sync/refresh-all', async (req, res) => {
  const results = {}
  const run = async (label, fn) => {
    try { await fn(); results[label] = 'ok' }
    catch (e) { results[label] = e.message }
  }

  // 1. Rebuild ebay_store_stats from ebay_current
  await run('ebay_store_stats', () => pool.query(`
    UPDATE ebay_store_stats ess
    JOIN (
      SELECT
        store_name,
        COUNT(*)                                                              AS total_items,
        SUM(CASE WHEN quantity > 0 THEN 1 ELSE 0 END)                        AS active_listings,
        SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END)                        AS out_of_stock,
        SUM(CASE WHEN sku LIKE 'A%' OR sku LIKE 'AZDP_%' THEN 1 ELSE 0 END) AS amazon_items,
        SUM(CASE WHEN sku NOT LIKE 'A%' AND sku NOT LIKE 'AZDP_%' THEN 1 ELSE 0 END) AS other_items,
        SUM(CASE WHEN sku LIKE 'OZH_%'  THEN 1 ELSE 0 END)                  AS ozh_items,
        SUM(CASE WHEN sku LIKE 'PL_%'   THEN 1 ELSE 0 END)                  AS priceline_items,
        SUM(CASE WHEN sku LIKE 'TOT_%'  THEN 1 ELSE 0 END)                  AS totaltools_items,
        SUM(CASE WHEN sku LIKE 'MCC_%'  THEN 1 ELSE 0 END)                  AS mecca_items,
        SUM(CASE WHEN sku LIKE 'SEP_%'  THEN 1 ELSE 0 END)                  AS sephora_items,
        SUM(CASE WHEN sku LIKE 'HOU_%'  THEN 1 ELSE 0 END)                  AS house_items,
        SUM(CASE WHEN sku LIKE 'VB_%'   THEN 1 ELSE 0 END)                  AS vb_items,
        AVG(price)                                                            AS avg_price
      FROM ebay_current
      GROUP BY store_name
    ) fresh ON ess.store_name = fresh.store_name
    SET
      ess.total_items      = fresh.total_items,
      ess.active_listings  = fresh.active_listings,
      ess.out_of_stock     = fresh.out_of_stock,
      ess.amazon_items     = fresh.amazon_items,
      ess.other_items      = fresh.other_items,
      ess.ozh_items        = fresh.ozh_items,
      ess.priceline_items  = fresh.priceline_items,
      ess.totaltools_items = fresh.totaltools_items,
      ess.mecca_items      = fresh.mecca_items,
      ess.sephora_items    = fresh.sephora_items,
      ess.house_items      = fresh.house_items,
      ess.vb_items         = fresh.vb_items,
      ess.avg_price        = fresh.avg_price,
      ess.last_updated     = NOW()
  `))

  // 2. summary_cache + stores_summary_cache (pair rates, AutoDS counts per store)
  await run('summary_cache', () => pool.query('CALL refresh_summary_cache()'))
  await run('content_violations', async () => {
  results.content_violations_flagged = await scanContentViolations()
})
  await run('sync_titles_descriptions', () => pool.query(`
  UPDATE ebay_current ec
  JOIN sku_map sm ON SUBSTRING(ec.sku, 2) = sm.ebay_sku
  JOIN autods_products ap ON sm.origin_sku = ap.sku
  SET ec.title = ap.title, ec.description = ap.description
  WHERE ec.sku LIKE 'A%' AND ec.sku NOT LIKE 'ALX_%' AND ec.sku NOT LIKE 'AZDP_%'
    AND (ec.title IS NULL OR ec.title != ap.title OR ap.updated_at > ec.scraped_at)
`))
  // 3. Rebuild sync_autods_not_ebay_cache
// 3. Rebuild sync_autods_not_ebay_cache1
await run('autods_not_ebay_cache', async () => {
  await pool.query('DELETE FROM sync_autods_not_ebay_cache')
  await pool.query(`
    INSERT INTO sync_autods_not_ebay_cache (sku, price, stock, updated_at)
    SELECT ap.sku, ap.price, ap.stock, ap.updated_at
    FROM autods_products ap
    WHERE NOT EXISTS (
        SELECT 1 FROM ebay_current ec
        JOIN sku_map sm ON SUBSTRING(ec.sku, 2) = sm.ebay_sku
        WHERE sm.origin_sku = ap.sku
          AND ec.sku LIKE 'A%' AND ec.sku NOT LIKE 'ALX_%' AND ec.sku NOT LIKE 'AZDP_%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM ebay_current ec
        WHERE SUBSTRING(ec.sku, 6) = ap.sku
          AND ec.sku LIKE 'AZDP_%'
      )
      AND ap.is_active = 1
  `)
})
  // 4. Rebuild banned_skus_store_cache
// 4. Rebuild banned caches (eBay + AutoDS)
await run('banned_skus_cache', async () => {
  await pool.query('TRUNCATE TABLE banned_skus_on_ebay')
  await pool.query(`
    INSERT INTO banned_skus_on_ebay
    SELECT * FROM (
      SELECT ec.store_name,ec.sku,ec.item_id,ec.price,ec.quantity,bs.sku AS banned_sku,
        COALESCE(sm.origin_sku,ec.group_sku,ec.sku) AS origin_sku,
        ap.autods_id,bs.reason,bs.added_at,ec.snapshot_date
      FROM banned_skus bs
      JOIN ebay_current ec ON ec.sku=bs.sku COLLATE utf8mb4_0900_ai_ci
      LEFT JOIN sku_map sm ON sm.ebay_sku=SUBSTR(ec.sku,2) COLLATE utf8mb4_0900_ai_ci
      LEFT JOIN autods_products ap ON ap.sku=COALESCE(sm.origin_sku,ec.group_sku) COLLATE utf8mb4_0900_ai_ci
      UNION
      SELECT ec.store_name,ec.sku,ec.item_id,ec.price,ec.quantity,bs.sku,
        COALESCE(sm.origin_sku,ec.group_sku,ec.sku),ap.autods_id,bs.reason,bs.added_at,ec.snapshot_date
      FROM banned_skus bs
      JOIN ebay_current ec ON ec.group_sku=bs.sku COLLATE utf8mb4_0900_ai_ci
      LEFT JOIN sku_map sm ON sm.ebay_sku=SUBSTR(ec.sku,2) COLLATE utf8mb4_0900_ai_ci
      LEFT JOIN autods_products ap ON ap.sku=COALESCE(sm.origin_sku,ec.group_sku) COLLATE utf8mb4_0900_ai_ci
      UNION
      SELECT ec.store_name,ec.sku,ec.item_id,ec.price,ec.quantity,bs.sku,sm.origin_sku,
        ap.autods_id,bs.reason,bs.added_at,ec.snapshot_date
      FROM banned_skus bs
      JOIN sku_map sm ON sm.origin_sku=bs.sku COLLATE utf8mb4_0900_ai_ci
      JOIN ebay_current ec ON ec.sku=CONCAT('A',sm.ebay_sku) COLLATE utf8mb4_0900_ai_ci
      LEFT JOIN autods_products ap ON ap.sku=sm.origin_sku COLLATE utf8mb4_0900_ai_ci
    ) t
  `)
  await pool.query('DELETE FROM banned_skus_store_cache')
  await pool.query(`
    INSERT INTO banned_skus_store_cache (store_name, banned_count)
    SELECT store_name, COUNT(*) FROM banned_skus_on_ebay
    GROUP BY store_name
    ON DUPLICATE KEY UPDATE banned_count=VALUES(banned_count), updated_at=NOW()
  `)
  await pool.query('TRUNCATE TABLE banned_autods_cache')
  await pool.query(`
    INSERT INTO banned_autods_cache
    SELECT ap.sku, ap.autods_id, ap.price, ap.stock,
      ap.inventory_status, ap.is_active,
      bs.reason, bs.added_at, ap.updated_at
    FROM autods_products ap
    JOIN banned_skus bs ON ap.sku = bs.sku COLLATE utf8mb4_0900_ai_ci
    WHERE ap.is_active = 1
  `)
})
  res.json({ success: true, results })
})
app.post('/api/content-violations/scan', async (req, res) => {
  try {
    const flagged = await scanContentViolations()
    res.json({ success: true, flagged })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/content-violations', async (req, res) => {
  try {
    const { store_name, search, page = 0, limit = 100 } = req.query
    const offset = parseInt(page) * parseInt(limit)
    const conditions = []
    const params = []
    if (store_name) { conditions.push('store_name = ?'); params.push(store_name) }
    if (search) { conditions.push('(sku LIKE ? OR title LIKE ?)'); params.push(`%${search}%`, `%${search}%`) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const [rows] = await pool.query(
      `SELECT * FROM content_violation_flags ${where} ORDER BY store_name, sku LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset])
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM content_violation_flags ${where}`, params)
    res.json({ data: rows, count: total })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/content-violations/count', async (req, res) => {
  try {
    const [[row]] = await pool.query(`
      SELECT COUNT(*) AS total, COUNT(DISTINCT store_name) AS stores
      FROM content_violation_flags
    `)
    res.json(row)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/content-violations/export', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM content_violation_flags ORDER BY store_name, sku')
    csvRes(res, rows, ['sku','ebay_sku','origin_sku','autods_id','item_id','store_name','title','description','reason','scanned_at'],
      `content_violations_${new Date().toISOString().slice(0,10)}.csv`)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/banned-keywords', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM banned_keywords ORDER BY keyword ASC')
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/banned-keywords', async (req, res) => {
  try {
    const { keyword, match_type = 'exact_word' } = req.body
    if (!keyword?.trim()) return res.status(400).json({ error: 'keyword required' })
    await pool.query(
      `INSERT INTO banned_keywords (keyword, match_type) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE match_type = VALUES(match_type), active = 1`,
      [keyword.trim().toLowerCase(), match_type]
    )
    await loadBannedKeywords()
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/banned-keywords/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM banned_keywords WHERE id = ?', [req.params.id])
    await loadBannedKeywords()
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
// SKU count across all stores (replicates sku_count.py logic)
app.get('/api/export/sku-count', async (req, res) => {
  try {
    // Pull all SKUs from ebay_current with sku_map conversion
    const [rows] = await pool.query(`
      SELECT
        ec.sku,
        COALESCE(sm.origin_sku, NULL) AS origin_sku
      FROM ebay_current ec
      LEFT JOIN sku_map sm
        ON SUBSTRING(ec.sku, 2) = sm.ebay_sku
        AND ec.sku LIKE 'A%'
        AND ec.sku NOT LIKE 'AZDP_%'
        AND ec.sku NOT LIKE 'AEDP_%'
        AND ec.sku NOT LIKE 'CTDP_%'
    `)

    const excludedPrefixes = [
      'CL-','IC_','P_','BCF_','OZH_','BGW_','CHW_','MEC_','EMG_','CPA_',
      "Nightfall: Devil'S Night #4","SO_","OW_","BN_","PL_","KG_"
    ]

    const skuCounts = {}

    for (const row of rows) {
      let sku = row.sku

      // Exclude prefixes
      if (excludedPrefixes.some(p => sku.startsWith(p))) continue

      // Strip AZDP_/CTDP_/AEDP_ prefix
      if (sku.startsWith('AZDP_') || sku.startsWith('CTDP_') || sku.startsWith('AEDP_')) {
        sku = sku.slice(5)
      }

      // Use origin_sku from sku_map if available (replaces the convert_sku CSV lookup)
      if (row.origin_sku) {
        sku = row.origin_sku
      } else if (sku.length === 11 && (sku.startsWith('A') || sku.startsWith('C'))) {
        // Strip leading A/C if no map found
        sku = sku.slice(1)
      }

      skuCounts[sku] = (skuCounts[sku] || 0) + 1
    }

    // Build CSV
    const lines = ['SKU,COUNT']
    for (const [sku, count] of Object.entries(skuCounts)) {
      const safe = sku.includes(',') || sku.includes('"')
        ? `"${sku.replace(/"/g, '""')}"` : sku
      lines.push(`${safe},${count}`)
    }

    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="sku_count_${date}.csv"`)
    res.send(lines.join('\n'))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
// Bulk override fetch ï¿½ replaces N individual /product-overrides/:sku calls
app.post('/api/product-overrides/bulk-get', async (req, res) => {
  try {
    const { skus } = req.body
    if (!Array.isArray(skus) || skus.length === 0) return res.json({})
    const placeholders = skus.map(() => '?').join(',')
    const [rows] = await pool.query(
      `SELECT sku, title, description, images FROM product_overrides WHERE sku IN (${placeholders})`,
      skus
    )
    const map = {}
    rows.forEach(r => { map[r.sku] = r })
    res.json(map)
  } catch (e) { res.status(500).json({ error: e.message }) }
})
app.post('/api/export/sku-lookup', async (req, res) => {
  try {
    const { skus } = req.body
    if (!Array.isArray(skus) || skus.length === 0)
      return res.status(400).json({ error: 'No SKUs provided' })
 
    // Hard cap per batch ï¿½ tell frontend to chunk if it didn't
    if (skus.length > 5000)
      return res.status(400).json({ error: 'Max 5000 SKUs per request. Use client-side batching.' })
 
    // Strip leading 'A' for sku_map lookup (stored without prefix),
    // but leave non-A SKUs (PL_, OZH_, etc.) as-is for a direct lookup.
    const stripped = skus.map(s => ({
      original: s,
      // Only strip single leading 'A' ï¿½ don't touch AZDP_, ALX_, etc.
      lookup: /^A(?!ZDP_|EDM_|LX_)/i.test(s) ? s.slice(1) : s,
    }))
 
    let rows
 
    if (skus.length <= SKU_LOOKUP_THRESHOLD) {
      // -- Fast path: direct IN() --------------------------------------------
      const lookupVals = stripped.map(x => x.lookup)
      const placeholders = lookupVals.map(() => '?').join(',')
      ;[rows] = await pool.query(`
        SELECT
          sm.ebay_sku,
          sm.origin_sku,
          ap.autods_id
        FROM sku_map sm
        LEFT JOIN autods_products ap
          ON sm.origin_sku COLLATE utf8mb4_0900_ai_ci = ap.sku COLLATE utf8mb4_0900_ai_ci
        WHERE sm.ebay_sku IN (${placeholders})
      `, lookupVals)
    } else {
      // -- Bulk path: temp table ? JOIN -------------------------------------
      // Using a connection from the pool so temp table is visible across queries
      const conn = await pool.getConnection()
      try {
        await conn.query(`
          CREATE TEMPORARY TABLE IF NOT EXISTS _sku_lookup_tmp (
            ebay_sku VARCHAR(64) NOT NULL,
            PRIMARY KEY (ebay_sku)
          ) ENGINE=MEMORY
        `)
        await conn.query('DELETE FROM _sku_lookup_tmp')
 
        // Insert in sub-chunks to avoid packet size limits
        const INSERT_CHUNK = 500
        const lookupVals   = stripped.map(x => x.lookup)
        for (let i = 0; i < lookupVals.length; i += INSERT_CHUNK) {
          const slice = lookupVals.slice(i, i + INSERT_CHUNK)
          const vals  = slice.map(v => [v])
          await conn.query(
            'INSERT IGNORE INTO _sku_lookup_tmp (ebay_sku) VALUES ?',
            [vals]
          )
        }
 
        ;[rows] = await conn.query(`
          SELECT
            sm.ebay_sku,
            sm.origin_sku,
            ap.autods_id
          FROM _sku_lookup_tmp t
          JOIN sku_map sm
            ON t.ebay_sku COLLATE utf8mb4_0900_ai_ci = sm.ebay_sku COLLATE utf8mb4_0900_ai_ci
          LEFT JOIN autods_products ap
            ON sm.origin_sku COLLATE utf8mb4_0900_ai_ci = ap.sku COLLATE utf8mb4_0900_ai_ci
        `)
 
        await conn.query('DROP TEMPORARY TABLE IF EXISTS _sku_lookup_tmp')
      } finally {
        conn.release()
      }
    }
 
    // -- Rebuild original SKU ? result map ------------------------------------
    // sku_map stores without 'A' prefix, so re-key on 'A' + ebay_sku
    const found = new Map()
    for (const r of rows) {
      // Match against both original and stripped forms
      found.set(r.ebay_sku.toUpperCase(), r)
    }
 
    const result = skus.map(sku => {
      const lookup = /^A(?!ZDP_|EDM_|LX_)/i.test(sku) ? sku.slice(1) : sku
      const match  = found.get(lookup.toUpperCase())
      if (!match) return { sku, origin_sku: null, autods_id: null, not_found: true }
      return {
        sku,
        origin_sku: match.origin_sku || null,
        autods_id:  match.autods_id  || null,
      }
    })
 
    res.json(result)
  } catch (e) {
    console.error('sku-lookup error:', e.message)
    res.status(500).json({ error: e.message })
  }
})
// --- BESTSELLER ROUTES v3 -----------------------------------------------------
// Replaces the existing bestseller routes block in server.js
// Changes vs v2:
//   ï¿½ Stats + dept queries now include on_ebay count (via sku_map ? ebay_current)
//   ï¿½ Export supports filter=on_ebay in addition to new/existing/uploaded/all
//   ï¿½ mark-uploaded and reset unchanged

// GET stats ï¿½ cross-referenced with autods_products AND ebay_current
app.get('/api/bestsellers/stats', async (req, res) => {
  try {
    const [[totals]] = await pool.query(`
      SELECT
        COUNT(*)                                                                      AS total,
        SUM(CASE WHEN b.scraped = 0 AND ap.sku IS NULL     THEN 1 ELSE 0 END)        AS new_to_autods,
        SUM(CASE WHEN b.scraped = 0 AND ap.sku IS NOT NULL THEN 1 ELSE 0 END)        AS already_in_autods,
        SUM(CASE WHEN b.scraped = 1                        THEN 1 ELSE 0 END)        AS marked_uploaded,
        SUM(CASE WHEN ap.sku IS NOT NULL                   THEN 1 ELSE 0 END)        AS autods_total,
        SUM(CASE
          WHEN EXISTS (
            SELECT 1 FROM sku_map sm
            JOIN ebay_current ec
              ON ec.sku = CONCAT('A', sm.ebay_sku) COLLATE utf8mb4_0900_ai_ci
            WHERE sm.origin_sku COLLATE utf8mb4_0900_ai_ci = b.sku COLLATE utf8mb4_0900_ai_ci
          ) THEN 1 ELSE 0 END)                                                       AS on_ebay,
        MAX(b.first_seen)                                                             AS last_scraped
      FROM bestseller_skus b
      LEFT JOIN autods_products ap
        ON b.sku COLLATE utf8mb4_0900_ai_ci = ap.sku COLLATE utf8mb4_0900_ai_ci
    `)

    const [depts] = await pool.query(`
      SELECT
        b.department,
        COUNT(*)                                                                     AS total,
        SUM(CASE WHEN b.scraped = 0 AND ap.sku IS NULL     THEN 1 ELSE 0 END)       AS new_to_autods,
        SUM(CASE WHEN b.scraped = 0 AND ap.sku IS NOT NULL THEN 1 ELSE 0 END)       AS already_in_autods,
        SUM(CASE WHEN b.scraped = 1                        THEN 1 ELSE 0 END)       AS marked_uploaded,
        SUM(CASE WHEN ap.sku IS NOT NULL                   THEN 1 ELSE 0 END)       AS autods_count,
        SUM(CASE
          WHEN EXISTS (
            SELECT 1 FROM sku_map sm
            JOIN ebay_current ec
              ON ec.sku = CONCAT('A', sm.ebay_sku) COLLATE utf8mb4_0900_ai_ci
            WHERE sm.origin_sku COLLATE utf8mb4_0900_ai_ci = b.sku COLLATE utf8mb4_0900_ai_ci
          ) THEN 1 ELSE 0 END)                                                      AS on_ebay,
        MIN(b.first_seen)                                                            AS first_seen,
        MAX(b.first_seen)                                                            AS last_seen
      FROM bestseller_skus b
      LEFT JOIN autods_products ap
        ON b.sku COLLATE utf8mb4_0900_ai_ci = ap.sku COLLATE utf8mb4_0900_ai_ci
      GROUP BY b.department
      ORDER BY new_to_autods DESC
    `)

    res.json({ totals, departments: depts })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET export CSV
// ?dept=automotive&filter=new        ? not in AutoDS, not marked uploaded
// ?dept=automotive&filter=existing   ? already in AutoDS
// ?dept=automotive&filter=on_ebay    ? ASIN is currently listed on eBay (via sku_map)
// ?dept=automotive&filter=uploaded   ? scraped=1
// ?dept=automotive&filter=all        ? everything
app.get('/api/bestsellers/export', async (req, res) => {
  try {
    const { dept, filter = 'new' } = req.query
    const conditions = []
    const params     = []

    if (dept && dept !== 'all') {
      conditions.push('b.department = ?')
      params.push(dept)
    }

    if (filter === 'new')      conditions.push('b.scraped = 0 AND ap.sku IS NULL')
    if (filter === 'existing') conditions.push('ap.sku IS NOT NULL')
    if (filter === 'uploaded') conditions.push('b.scraped = 1')
    if (filter === 'on_ebay') {
      conditions.push(`EXISTS (
        SELECT 1 FROM sku_map sm
        JOIN ebay_current ec
          ON ec.sku = CONCAT('A', sm.ebay_sku) COLLATE utf8mb4_0900_ai_ci
        WHERE sm.origin_sku COLLATE utf8mb4_0900_ai_ci = b.sku COLLATE utf8mb4_0900_ai_ci
      )`)
    }
    // 'all' = no extra filter

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const [rows] = await pool.query(`
      SELECT
        b.sku,
        b.department,
        b.scraped,
        b.first_seen,
        CASE WHEN ap.sku IS NOT NULL THEN 'yes' ELSE 'no' END AS in_autods,
        ap.autods_id,
        ap.price        AS autods_price,
        ap.stock        AS autods_stock,
        ap.updated_at   AS autods_updated,
        CASE WHEN EXISTS (
          SELECT 1 FROM sku_map sm
          JOIN ebay_current ec
            ON ec.sku = CONCAT('A', sm.ebay_sku) COLLATE utf8mb4_0900_ai_ci
          WHERE sm.origin_sku COLLATE utf8mb4_0900_ai_ci = b.sku COLLATE utf8mb4_0900_ai_ci
        ) THEN 'yes' ELSE 'no' END AS on_ebay
      FROM bestseller_skus b
      LEFT JOIN autods_products ap
        ON b.sku COLLATE utf8mb4_0900_ai_ci = ap.sku COLLATE utf8mb4_0900_ai_ci
      ${where}
      ORDER BY b.department, b.sku
    `, params)

    const deptSlug = dept && dept !== 'all' ? `_${dept}` : ''
    const date     = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const filename = `bestsellers${deptSlug}_${filter}_${date}.csv`

    const headers = ['sku','department','in_autods','on_ebay','autods_id','autods_price','autods_stock','scraped','first_seen','autods_updated']
    const csv = [
      headers.join(','),
      ...rows.map(r => headers.map(h => {
        const v = r[h] == null ? '' : String(r[h])
        return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g,'""')}"` : v
      }).join(','))
    ].join('\n')

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(csv)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST mark scraped=1
// body: { dept: 'automotive', mode: 'new_only' }  ? only ASINs not in AutoDS
// body: { dept: 'automotive', mode: 'all' }        ? mark everything pending
app.post('/api/bestsellers/mark-uploaded', async (req, res) => {
  try {
    const { dept, mode = 'new_only' } = req.body
    const conditions = ['b.scraped = 0']
    const params     = []

    if (dept && dept !== 'all') {
      conditions.push('b.department = ?')
      params.push(dept)
    }
    if (mode === 'new_only') {
      conditions.push('NOT EXISTS (SELECT 1 FROM autods_products ap WHERE ap.sku COLLATE utf8mb4_0900_ai_ci = b.sku COLLATE utf8mb4_0900_ai_ci)')
    }

    const [result] = await pool.query(
      `UPDATE bestseller_skus b SET b.scraped = 1 WHERE ${conditions.join(' AND ')}`,
      params
    )
    res.json({ success: true, updated: result.affectedRows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST reset scraped=0
app.post('/api/bestsellers/reset', async (req, res) => {
  try {
    const { dept } = req.body
    const conditions = ['scraped = 1']
    const params     = []
    if (dept && dept !== 'all') {
      conditions.push('department = ?')
      params.push(dept)
    }
    const [result] = await pool.query(
      `UPDATE bestseller_skus SET scraped = 0 WHERE ${conditions.join(' AND ')}`,
      params
    )
    res.json({ success: true, updated: result.affectedRows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
app.get('/api/export/missing-asins', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT DISTINCT sm.origin_sku AS asin
      FROM ebay_current ec
      JOIN sku_map sm ON SUBSTRING(ec.sku, 2) = sm.ebay_sku
      LEFT JOIN autods_products ap ON sm.origin_sku = ap.sku
      WHERE ec.sku LIKE 'A%'
        AND ec.sku NOT LIKE 'ALX_%'
        AND ec.sku NOT LIKE 'AZDP_%'
        AND ap.sku IS NULL
        AND sm.origin_sku REGEXP '^B0[A-Z0-9]{8}$'
    `)
    const date = new Date().toISOString().slice(0, 10)
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="missing_asins_${date}.csv"`)
    res.send('asin\n' + rows.map(r => r.asin).join('\n'))
  } catch (e) { res.status(500).json({ error: e.message }) }
})
// --- SERVER ------------------------------------------------------------------
// -----------------------------------------------------------------------------
// BULK ADD PRODUCTS (by ASIN list) - background job + polling
// Reuses fetch_bulk_products.py (batched GetItems + parallel GetVariations
// with adaptive rate limiting) and the same DB-save logic as the single
// /api/products/add route.
// -----------------------------------------------------------------------------

const { spawn } = require('child_process')

const BULK_ADD_SCRIPT = '/home/emega/client/ozhair/scraper/creatorsapi-python-sdk/examples/fetch_bulk_products.py'

const bulkJobs = new Map() // job_id -> job state

function makeJobId() {
  return `bulk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

async function saveFetchedProductToDb(fetched, supplier_id) {
  const [existing] = await pool.query(
    'SELECT product_id FROM products WHERE sku = ? LIMIT 1',
    [fetched.sku]
  )
  if (existing.length) {
    return { status: 'duplicate', product_id: existing[0].product_id }
  }

  const [result] = await pool.query(
    `INSERT INTO products
       (sku, title, brand, price, stock, images, description, product_url, category, metadata, supplier_id, product_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      fetched.sku,
      fetched.title,
      fetched.brand || null,
      fetched.price,
      fetched.stock,
      JSON.stringify(fetched.images),
      fetched.description || null,
      fetched.detail_page_url || null,
      fetched.category || null,
      JSON.stringify(fetched.metadata || {}),
      supplier_id,
      fetched.product_type || 'simple',
    ]
  )

  if (Array.isArray(fetched.variants) && fetched.variants.length) {
    for (const v of fetched.variants) {
      const opts = parseVariationAttrs(v.variation_attributes)
      const variantMetadata = {
        condition: v.condition || '',
        merchant_name: v.merchant_name || '',
        dimensions: {
          length: v.item_length || '',
          width: v.item_width || '',
          height: v.item_height || '',
          unit: v.item_length_unit || '',
        },
        category: v.category || '',
        description: v.description || '',
        detail_page_url: v.detail_page_url || '',
        brand: v.brand || '',
      }
      await pool.query(
        `INSERT INTO variants
           (product_id, variant_sku, variant_name, price, stock, images,
            option1_name, option1_value, option2_name, option2_value, option3_name, option3_value,
            metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          result.insertId,
          v.sku,
          v.title || null,
          v.price,
          v.stock,
          JSON.stringify(v.images || []),
          opts[0]?.name || null, opts[0]?.value || null,
          opts[1]?.name || null, opts[1]?.value || null,
          opts[2]?.name || null, opts[2]?.value || null,
          JSON.stringify(variantMetadata),
        ]
      )
    }
  }

  const [[newRow]] = await pool.query('SELECT * FROM products WHERE product_id = ?', [result.insertId])
  return { status: 'success', product: newRow }
}

function checkJobDone(jobId) {
  const job = bulkJobs.get(jobId)
  if (job && job.childClosed && job.pendingSaves === 0) {
    job.status = 'done'
  }
}

app.post('/api/products/bulk-add', async (req, res) => {
  const { asins, supplier_id } = req.body || {}

  if (!Array.isArray(asins) || asins.length === 0) {
    return res.status(400).json({ error: 'asins (array) is required' })
  }
  if (!supplier_id) {
    return res.status(400).json({ error: 'supplier_id is required' })
  }
  if (asins.length > 500) {
    return res.status(400).json({ error: 'Max 500 ASINs per batch' })
  }

  const cleanAsins = asins
    .map(a => String(a).trim().toUpperCase())
    .filter(a => /^[A-Z0-9]{10}$/.test(a))

  if (cleanAsins.length === 0) {
    return res.status(400).json({ error: 'No valid ASINs provided (expected 10 alphanumeric chars each)' })
  }

  const jobId = makeJobId()
  bulkJobs.set(jobId, {
    total: cleanAsins.length,
    done: 0,
    success: 0,
    failed: 0,
    results: [],
    status: 'running',
    pendingSaves: 0,
    childClosed: false,
    startedAt: new Date().toISOString(),
  })

  res.status(202).json({ job_id: jobId, total: cleanAsins.length })

  const child = spawn(PYTHON_BIN, [BULK_ADD_SCRIPT, '--asins', cleanAsins.join(','), '--workers', '10'])

  let buffer = ''
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString()
    let idx
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (!line) continue

      let parsed
      try {
        parsed = JSON.parse(line)
      } catch {
        continue
      }

      const job = bulkJobs.get(jobId)
      if (!job) continue

      if (parsed.status === 'success') {
        job.pendingSaves += 1
        saveFetchedProductToDb(parsed.data, supplier_id)
          .then((saveResult) => {
            job.done += 1
            job.pendingSaves -= 1
            if (saveResult.status === 'duplicate') {
              job.failed += 1
              job.results.push({ asin: parsed.asin, status: 'error', message: 'Already exists', product_id: saveResult.product_id })
            } else {
              job.success += 1
              job.results.push({ asin: parsed.asin, status: 'success', title: saveResult.product.title, product_id: saveResult.product.product_id })
            }
            checkJobDone(jobId)
          })
          .catch((err) => {
            job.done += 1
            job.pendingSaves -= 1
            job.failed += 1
            job.results.push({ asin: parsed.asin, status: 'error', message: err.message })
            checkJobDone(jobId)
          })
      } else {
        job.done += 1
        job.failed += 1
        job.results.push({ asin: parsed.asin, status: 'error', message: parsed.message || 'Failed to fetch' })
      }
    }
  })

  child.stderr.on('data', (chunk) => {
    console.log(`[bulk-add ${jobId}]`, chunk.toString().trim())
  })

  child.on('close', () => {
    const job = bulkJobs.get(jobId)
    if (job) {
      job.childClosed = true
      checkJobDone(jobId)
    }
    setTimeout(() => bulkJobs.delete(jobId), 60 * 60 * 1000)
  })

  child.on('error', (err) => {
    const job = bulkJobs.get(jobId)
    if (job) {
      job.status = 'error'
      job.error = err.message
    }
  })
})

app.get('/api/products/bulk-add/:jobId', (req, res) => {
  const job = bulkJobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ error: 'Job not found (may have expired)' })
  res.json(job)
})

const server = app.listen(process.env.PORT || 3001, () => {
  console.log(`Server running on port ${process.env.PORT || 3001}`)
})
// --- ACTIVE HEALTH EXPORTS ---------------------------------------------------
// Add these routes to server.js before the SERVER section

// Active eBay listings where AutoDS product is Inactive (product_status=3)
app.get('/api/export/active-autods-inactive', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT ec.store_name, ec.sku, sm.origin_sku, ap.autods_id,
             ec.item_id, ec.price, ec.quantity,
             ap.product_status, ap.inventory_status, ap.stock AS autods_stock,
             ap.updated_at AS autods_updated
      FROM ebay_current ec
      JOIN sku_map sm ON SUBSTRING(ec.sku, 2) = sm.ebay_sku
      JOIN autods_products ap ON sm.origin_sku = ap.sku
      WHERE ec.sku LIKE 'A%' AND ec.sku NOT LIKE 'AZDP_%' AND ec.sku NOT LIKE 'ALX_%'
        AND ec.quantity > 0
        AND ap.product_status = 3
      ORDER BY ec.store_name, ec.sku
    `)
    csvRes(res, rows,
      ['store_name','sku','origin_sku','autods_id','item_id','price','quantity','product_status','inventory_status','autods_stock','autods_updated'],
      `active_autods_inactive_${new Date().toISOString().slice(0,10)}.csv`)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Active eBay listings where AutoDS inventory_status=2 (OOS)
app.get('/api/export/active-autods-oos', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT ec.store_name, ec.sku, sm.origin_sku, ap.autods_id,
             ec.item_id, ec.price, ec.quantity,
             ap.product_status, ap.inventory_status, ap.stock AS autods_stock,
             ap.oos_since, ap.updated_at AS autods_updated
      FROM ebay_current ec
      JOIN sku_map sm ON SUBSTRING(ec.sku, 2) = sm.ebay_sku
      JOIN autods_products ap ON sm.origin_sku = ap.sku
      WHERE ec.sku LIKE 'A%' AND ec.sku NOT LIKE 'AZDP_%' AND ec.sku NOT LIKE 'ALX_%'
        AND ec.quantity > 0
        AND ap.product_status = 2 AND ap.inventory_status = 2
      ORDER BY ec.store_name, ec.sku
    `)
    csvRes(res, rows,
      ['store_name','sku','origin_sku','autods_id','item_id','price','quantity','product_status','inventory_status','autods_stock','oos_since','autods_updated'],
      `active_autods_oos_${new Date().toISOString().slice(0,10)}.csv`)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Active eBay listings where AutoDS inventory_status=3 (On Hold)
app.get('/api/export/active-autods-onhold', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT ec.store_name, ec.sku, sm.origin_sku, ap.autods_id,
             ec.item_id, ec.price, ec.quantity,
             ap.product_status, ap.inventory_status, ap.stock AS autods_stock,
             ap.updated_at AS autods_updated
      FROM ebay_current ec
      JOIN sku_map sm ON SUBSTRING(ec.sku, 2) = sm.ebay_sku
      JOIN autods_products ap ON sm.origin_sku = ap.sku
      WHERE ec.sku LIKE 'A%' AND ec.sku NOT LIKE 'AZDP_%' AND ec.sku NOT LIKE 'ALX_%'
        AND ec.quantity > 0
        AND ap.product_status = 2 AND ap.inventory_status = 3
      ORDER BY ec.store_name, ec.sku
    `)
    csvRes(res, rows,
      ['store_name','sku','origin_sku','autods_id','item_id','price','quantity','product_status','inventory_status','autods_stock','autods_updated'],
      `active_autods_onhold_${new Date().toISOString().slice(0,10)}.csv`)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Truly healthy: active eBay + AutoDS active + inventory in stock
app.get('/api/export/active-truly-healthy', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT ec.store_name, ec.sku, sm.origin_sku, ap.autods_id,
             ec.item_id, ec.price, ec.quantity,
             ap.product_status, ap.inventory_status, ap.stock AS autods_stock,
             ap.updated_at AS autods_updated
      FROM ebay_current ec
      JOIN sku_map sm ON SUBSTRING(ec.sku, 2) = sm.ebay_sku
      JOIN autods_products ap ON sm.origin_sku = ap.sku
      WHERE ec.sku LIKE 'A%' AND ec.sku NOT LIKE 'AZDP_%' AND ec.sku NOT LIKE 'ALX_%'
        AND ec.quantity > 0
        AND ap.product_status = 2 AND ap.inventory_status = 1
      ORDER BY ec.store_name, ec.sku
    `)
    csvRes(res, rows,
      ['store_name','sku','origin_sku','autods_id','item_id','price','quantity','product_status','inventory_status','autods_stock','autods_updated'],
      `active_truly_healthy_${new Date().toISOString().slice(0,10)}.csv`)
  } catch (e) { res.status(500).json({ error: e.message }) }
})
// --- ACTIVE HEALTH ï¿½ JSON list endpoint (for the table page) ---------------
app.get('/api/active-health/list', async (req, res) => {
  try {
    const { category, store_name, page = 0, limit = 50 } = req.query
    const offset = parseInt(page) * parseInt(limit)
    const lim    = parseInt(limit)

    // -- ALL PAIRED ï¿½ combines A% + AZDP_% eBay listings matched to AutoDS --
    if (category === 'all_paired') {
      const params1 = []
      const params2 = []
      let extra1 = ''
      let extra2 = ''
      if (store_name) {
        extra1 = ' AND ec.store_name COLLATE utf8mb4_0900_ai_ci = ?'
        extra2 = ' AND ec.store_name COLLATE utf8mb4_0900_ai_ci = ?'
        params1.push(store_name)
        params2.push(store_name)
      }

       const [rows] = await pool.query(`
        (SELECT ec.store_name, ec.sku, sm.origin_sku, ap.autods_id,
                ec.item_id, ec.price, ec.quantity, ap.title,
                ap.product_status, ap.inventory_status, ap.stock AS autods_stock,
                ap.oos_since, ap.updated_at AS autods_updated
         FROM ebay_current ec
         JOIN sku_map sm ON SUBSTRING(ec.sku, 2) = sm.ebay_sku
         JOIN autods_products ap ON sm.origin_sku = ap.sku
         WHERE ec.sku LIKE 'A%' AND ec.sku NOT LIKE 'ALX_%' AND ec.sku NOT LIKE 'AZDP_%'${extra1})
        UNION ALL
        (SELECT ec.store_name, ec.sku, SUBSTRING(ec.sku, 6) AS origin_sku, ap.autods_id,
                ec.item_id, ec.price, ec.quantity, ap.title,
                ap.product_status, ap.inventory_status, ap.stock AS autods_stock,
                ap.oos_since, ap.updated_at AS autods_updated
         FROM ebay_current ec
         JOIN autods_products ap ON SUBSTRING(ec.sku, 6) = ap.sku
         WHERE ec.sku LIKE 'AZDP_%'${extra2})
        ORDER BY store_name, sku
        LIMIT ? OFFSET ?
      `, [...params1, ...params2, lim, offset])

      return res.json({ data: rows, count: null })
    }

    // -- NOT PAIRED ï¿½ AutoDS active but never listed on eBay --
    if (category === 'not_paired') {
      const [rows] = await pool.query(`
        SELECT c.sku, a.autods_id, a.price, a.stock, a.title,
               a.inventory_status, a.oos_since, a.updated_at
        FROM sync_autods_not_ebay_cache c
        LEFT JOIN autods_products a
          ON c.sku COLLATE utf8mb4_0900_ai_ci = a.sku COLLATE utf8mb4_0900_ai_ci
        WHERE a.product_status = 2
        ORDER BY a.stock DESC
        LIMIT ? OFFSET ?
      `, [lim, offset])

      return res.json({ data: rows, count: null })
    }

    // -- TRULY HEALTHY / AUTODS INACTIVE / AUTODS OOS / ON HOLD --
    const categoryMap = {
      truly_healthy:   'ap.product_status = 2 AND ap.inventory_status = 1',
      autods_inactive: 'ap.product_status = 3',
      autods_oos:      'ap.product_status = 2 AND ap.inventory_status = 2',
      on_hold:         'ap.product_status = 2 AND ap.inventory_status = 3',
    }
    const condition = categoryMap[category]
    if (!condition) return res.status(400).json({ error: 'Invalid category' })

    const conditions = [condition]
    const params = []
    if (store_name) { conditions.push('ec.store_name COLLATE utf8mb4_0900_ai_ci = ?'); params.push(store_name) }
    const where = conditions.join(' AND ')

    const [rows] = await pool.query(`
      SELECT ec.store_name, ec.sku, sm.origin_sku, ap.autods_id,
             ec.item_id, ec.price, ec.quantity, ap.title,
             ap.product_status, ap.inventory_status, ap.stock AS autods_stock,
             ap.oos_since, ap.updated_at AS autods_updated
      FROM ebay_current ec
      JOIN sku_map sm ON SUBSTRING(ec.sku, 2) = sm.ebay_sku
      JOIN autods_products ap ON sm.origin_sku = ap.sku
      WHERE ec.sku LIKE 'A%' AND ec.sku NOT LIKE 'AZDP_%' AND ec.sku NOT LIKE 'ALX_%'
        AND ec.quantity > 0
        AND ${where}
      ORDER BY ec.store_name, ec.sku
      LIMIT ? OFFSET ?
    `, [...params, lim, offset])

    res.json({ data: rows, count: null })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// List all run folders for a store, newest first
app.get('/api/price-runs/:store', (req, res) => {
  try {
    const store = req.params.store
    const storeDir = path.join(PRICE_RUNS_DIR, store)
    if (!fs.existsSync(storeDir)) return res.json({ runs: [] })

    const runs = fs.readdirSync(storeDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name.startsWith(`${store}_`))
      .map(e => e.name)
      .sort()
      .reverse()

    res.json({ runs })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Get full run.json for one run
app.get('/api/price-runs/:store/:runFolder', (req, res) => {
  try {
    const { store, runFolder } = req.params
    if (!runFolder.startsWith(`${store}_`)) {
      return res.status(400).json({ error: 'Invalid run folder' })
    }
    const runJsonPath = path.join(PRICE_RUNS_DIR, store, runFolder, 'run.json')
    if (!fs.existsSync(runJsonPath)) {
      return res.status(404).json({ error: 'run.json not found for this run' })
    }
    const data = JSON.parse(fs.readFileSync(runJsonPath, 'utf8'))
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// List all stores that have any run history at all (for a store picker)
app.get('/api/price-runs', (req, res) => {
  try {
    const entries = fs.readdirSync(PRICE_RUNS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .filter(name => {
        // only include dirs that actually contain at least one run folder
        const sub = path.join(PRICE_RUNS_DIR, name)
        try {
          return fs.readdirSync(sub).some(f => f.startsWith(`${name}_`))
        } catch { return false }
      })
      .sort()
    res.json({ stores: entries })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
// GET /api/price-runs/summary
// Card-view data: last run time/status per store, with freshness computed
// server-side so the frontend doesn't need to know your cron schedule.
app.get('/api/price-runs/summary', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT store_name, last_run_at, last_run_status,
             last_run_skus_total, last_run_skus_ok,
             last_run_duration_s, last_run_error
      FROM store_sync_source
      ORDER BY store_name ASC
    `)

    const now = Date.now()
    // Runs twice a day (~every 12h). 15h threshold gives a buffer for a run
    // that's running a bit late before flagging it stale.
    const STALE_THRESHOLD_HOURS = 15

    const stores = rows.map(r => {
      const lastRunMs   = r.last_run_at ? new Date(r.last_run_at).getTime() : null
      const hoursSince  = lastRunMs !== null ? (now - lastRunMs) / 3600000 : null
      const isStale     = hoursSince === null || hoursSince > STALE_THRESHOLD_HOURS
      const isFailed     = r.last_run_status === 'failed'
      const isPartial    = r.last_run_status === 'partial'

      let health = 'ok'
      if (r.last_run_at === null) health = 'never_run'
      else if (isFailed)          health = 'failed'
      else if (isStale)           health = 'stale'
      else if (isPartial)         health = 'partial'

      return {
        store_name:          r.store_name,
        last_run_at:         r.last_run_at,
        last_run_status:     r.last_run_status,
        skus_total:          r.last_run_skus_total,
        skus_ok:             r.last_run_skus_ok,
        duration_s:          r.last_run_duration_s,
        error:               r.last_run_error,
        hours_since_run:     hoursSince,
        health, // 'ok' | 'partial' | 'stale' | 'failed' | 'never_run'
      }
    })

    res.json({
      stores,
      threshold_hours: STALE_THRESHOLD_HOURS,
      counts: {
        ok:       stores.filter(s => s.health === 'ok').length,
        partial:  stores.filter(s => s.health === 'partial').length,
        stale:    stores.filter(s => s.health === 'stale').length,
        failed:   stores.filter(s => s.health === 'failed').length,
        never_run: stores.filter(s => s.health === 'never_run').length,
      },
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/price-runs-summary', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        store_name,
        sync_source,
        last_run_at,
        last_run_status,
        last_run_skus_total,
        last_run_skus_ok,
        last_run_duration_s,
        last_run_error
      FROM store_sync_source
      ORDER BY last_run_at DESC
    `)
    res.json({ stores: rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
server.timeout = 300000