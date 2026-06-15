// src/pages/ebay/StoreLimitsPage.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  ArrowLeft, Upload, ClipboardPaste, Download, RefreshCw,
  AlertTriangle, CheckCircle2, TrendingUp, Package, DollarSign,
  X, Search, ChevronUp, ChevronDown,
} from 'lucide-react'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// ─── Number formatters ────────────────────────────────────────────────────────
function fmtAUD(n) {
  if (n == null || isNaN(n)) return '—'
  if (n >= 1_000_000) return `AU $${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `AU $${(n / 1_000).toFixed(0)}K`
  return `AU $${Number(n).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}
function fmtItems(n) {
  if (n == null || isNaN(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return Number(n).toLocaleString()
}
function pct(used, limit) {
  if (!limit || limit === 0) return 0
  return Math.min(100, Math.round((used / limit) * 100))
}
function limitColor(p) {
  if (p >= 90) return { bar: '#ef4444', text: 'text-red-600',   bg: 'bg-red-50 border-red-300' }
  if (p >= 80) return { bar: '#f59e0b', text: 'text-amber-600', bg: 'bg-amber-50 border-amber-300' }
  return              { bar: '#22c55e', text: 'text-green-600', bg: 'bg-card border-border' }
}

// ─── Parse the raw spreadsheet strings ───────────────────────────────────────
// Column B: "10Mmore items(30,022listed and sold / 10M limit on quantity of items)"
// Column C: "AU $46.1M more(AU $3.8Mlisted and sold / AU $50M limit)"
function parseM(str) {
  // Convert "10M" → 10000000, "9.9M" → 9900000, "1.5M" → 1500000, "160,000" → 160000
  if (!str) return 0
  const s = str.replace(/,/g, '').trim()
  const m = s.match(/([\d.]+)\s*M/i)
  if (m) return Math.round(parseFloat(m[1]) * 1_000_000)
  const k = s.match(/([\d.]+)\s*K/i)
  if (k) return Math.round(parseFloat(k[1]) * 1_000)
  return parseFloat(s) || 0
}
function parseAUD(str) {
  // "AU $3.8M" → 3800000, "AU $682,103.38" → 682103.38, "$50M" → 50000000
  if (!str) return 0
  const s = str.replace(/AU\s*\$|,/gi, '').trim()
  const m = s.match(/([\d.]+)\s*M/i)
  if (m) return parseFloat(m[1]) * 1_000_000
  const k = s.match(/([\d.]+)\s*K/i)
  if (k) return parseFloat(k[1]) * 1_000
  return parseFloat(s) || 0
}

export function parseItemsCol(raw) {
  if (!raw || raw.trim().toUpperCase() === 'N/A') return null
  const lower = raw.toLowerCase()
  if (lower.includes('no more') || lower.includes('nothing listed')) {
    // Items fully used: try to find limit from "/ Xm limit"
    const limitM = raw.match(/\/\s*([\d.,]+\s*M?)\s*limit/i)
    const limit  = limitM ? parseM(limitM[1]) : 0
    const soldM  = raw.match(/\(([\d.,]+)\s*listed/i)
    const sold   = soldM ? parseInt(soldM[1].replace(/,/g,'')) : limit
    return { items_listed_sold: sold, items_limit: limit, items_remaining: 0 }
  }
  // Leading number = remaining  e.g. "10Mmore items(...)"  "971,546more items(...)"
  const remMatch  = raw.match(/^([\d.,]+\s*M?)\s*more items/i)
  const remaining = remMatch ? parseM(remMatch[1]) : 0
  // Inside parens: "30,022listed and sold / 10M limit"
  const soldMatch = raw.match(/\(([\d.,]+)\s*listed/i)
  const sold      = soldMatch ? parseInt(soldMatch[1].replace(/,/g,'')) : 0
  const limitMatch= raw.match(/\/\s*([\d.,]+\s*M?)\s*limit/i)
  const limit     = limitMatch ? parseM(limitMatch[1]) : 0
  return { items_listed_sold: sold, items_limit: limit, items_remaining: remaining }
}

export function parseRevenueCol(raw) {
  if (!raw || raw.trim().toUpperCase() === 'N/A') return null
  const lower = raw.toLowerCase()
  if (lower.startsWith('no more')) {
    // Revenue fully used
    const soldM  = raw.match(/\(AU\s*\$([\d.,]+\s*M?)\s*listed/i)
    const sold   = soldM ? parseAUD(soldM[1]) : 0
    const limitM = raw.match(/\/\s*AU\s*\$([\d.,]+\s*M?)\s*limit/i)
    const limit  = limitM ? parseAUD(limitM[1]) : sold
    return { revenue_listed_sold: sold, revenue_limit: limit, revenue_remaining: 0 }
  }
  // Leading: "AU $46.1M more(...)"
  const remMatch  = raw.match(/^AU\s*\$([\d.,]+\s*M?)\s*more/i)
  const remaining = remMatch ? parseAUD(remMatch[1]) : 0
  // Inside parens sold
  const soldMatch = raw.match(/\(AU\s*\$([\d.,]+(?:\s*M)?)\s*listed/i)
  const sold      = soldMatch ? parseAUD(soldMatch[1]) : 0
  // Limit
  const limitMatch= raw.match(/\/\s*AU\s*\$([\d.,]+\s*M?)\s*limit/i)
  const limit     = limitMatch ? parseAUD(limitMatch[1]) : 0
  return { revenue_listed_sold: sold, revenue_limit: limit, revenue_remaining: remaining }
}

// ─── Parse a full CSV text (exported from Google Sheets) ─────────────────────
// Expected columns: STORE, (ignored), MONTHLY LIMIT (items), (col C = revenue)
// or simpler: store_name, items_raw, revenue_raw
function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim())
  // Try to detect header row
  const firstLower = lines[0].toLowerCase()
  const startIdx   = (firstLower.includes('store') || firstLower.includes('monthly')) ? 1 : 0

  const results = []
  for (let i = startIdx; i < lines.length; i++) {
    // Handle quoted CSV fields (Google Sheets wraps commas in quotes)
    const cols = splitCSVLine(lines[i])
    if (cols.length < 2) continue
    const store_name  = cols[0]?.trim().toUpperCase()
    const items_raw   = cols[1]?.trim() || ''
    const revenue_raw = cols[2]?.trim() || ''
    if (!store_name) continue
    results.push({ store_name, items_raw, revenue_raw })
  }
  return results
}

function splitCSVLine(line) {
  const result = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { inQ = !inQ; continue }
    if (c === ',' && !inQ) { result.push(cur); cur = ''; continue }
    cur += c
  }
  result.push(cur)
  return result
}

// Parse pasted tab-separated text (direct paste from Google Sheets)
function parsePasted(text) {
  const lines = text.trim().split('\n').filter(l => l.trim())
  const firstLower = lines[0].toLowerCase()
  const startIdx   = (firstLower.includes('store') || firstLower.includes('monthly')) ? 1 : 0
  const results    = []
  for (let i = startIdx; i < lines.length; i++) {
    const cols        = lines[i].split('\t')
    const store_name  = cols[0]?.trim().toUpperCase()
    const items_raw   = cols[1]?.trim() || ''
    const revenue_raw = cols[2]?.trim() || ''
    if (!store_name) continue
    results.push({ store_name, items_raw, revenue_raw })
  }
  return results
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function UsageBar({ used, limit, formatter, color }) {
  const p = pct(used, limit)
  const c = color || limitColor(p)
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-muted-foreground">{formatter(used)} used</span>
        <span className={`font-semibold ${c.text}`}>{p}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${p}%`, background: c.bar }} />
      </div>
      <div className="text-[10px] text-muted-foreground">{formatter(limit - used)} remaining of {formatter(limit)}</div>
    </div>
  )
}

// ─── Store limit row in the table ────────────────────────────────────────────
function LimitRow({ limit, rank }) {
  const ip = pct(limit.items_listed_sold, limit.items_limit)
  const rp = pct(limit.revenue_listed_sold, limit.revenue_limit)
  const ic = limitColor(ip)
  const rc = limitColor(rp)
  const warn = ip >= 80 || rp >= 80

  return (
    <tr className={`border-b border-border hover:bg-muted/30 transition-colors ${warn ? 'bg-amber-50/30' : ''}`}>
      <td className="py-2.5 px-3 text-xs text-muted-foreground w-8">{rank}</td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          {warn && <AlertTriangle size={11} className="text-amber-500 flex-shrink-0" />}
          <span className="text-sm font-semibold capitalize">{limit.store_name.toLowerCase()}</span>
        </div>
      </td>
      {/* Items */}
      <td className="py-2.5 px-3 text-xs tabular-nums">{fmtItems(limit.items_listed_sold)}</td>
      <td className="py-2.5 px-3 text-xs tabular-nums">{fmtItems(limit.items_limit)}</td>
      <td className="py-2.5 px-3 min-w-[120px]">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${ip}%`, background: ic.bar }} />
          </div>
          <span className={`text-[11px] font-bold w-8 text-right ${ic.text}`}>{ip}%</span>
        </div>
      </td>
      {/* Revenue */}
      <td className="py-2.5 px-3 text-xs tabular-nums">{fmtAUD(limit.revenue_listed_sold)}</td>
      <td className="py-2.5 px-3 text-xs tabular-nums">{fmtAUD(limit.revenue_limit)}</td>
      <td className="py-2.5 px-3 min-w-[120px]">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${rp}%`, background: rc.bar }} />
          </div>
          <span className={`text-[11px] font-bold w-8 text-right ${rc.text}`}>{rp}%</span>
        </div>
      </td>
      <td className="py-2.5 px-3">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border
          ${ip >= 90 || rp >= 90 ? 'bg-red-100 text-red-700 border-red-300'
          : ip >= 80 || rp >= 80 ? 'bg-amber-100 text-amber-700 border-amber-300'
          : 'bg-green-100 text-green-700 border-green-300'}`}>
          {ip >= 90 || rp >= 90 ? '🔴 Critical' : ip >= 80 || rp >= 80 ? '🟡 Warning' : '🟢 OK'}
        </span>
      </td>
    </tr>
  )
}

// ─── Import modal ─────────────────────────────────────────────────────────────
function ImportModal({ onClose, onImport }) {
  const [tab,      setTab]      = useState('paste')   // 'paste' | 'csv'
  const [text,     setText]     = useState('')
  const [preview,  setPreview]  = useState([])
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const fileRef = useRef()

  function handlePreview() {
    setError('')
    try {
      const rows = tab === 'paste' ? parsePasted(text) : parseCSV(text)
      if (rows.length === 0) { setError('No rows found. Check your format.'); return }
      setPreview(rows.slice(0, 5))
    } catch (e) {
      setError('Parse error: ' + e.message)
    }
  }

  function handleFileLoad(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setText(ev.target.result)
    reader.readAsText(file)
  }

  async function handleSubmit() {
    setError(''); setLoading(true)
    try {
      const rows = tab === 'paste' ? parsePasted(text) : parseCSV(text)
      if (rows.length === 0) { setError('No rows found'); setLoading(false); return }

      // Build payload with parsed numbers
      const payload = rows.map(r => {
        const ip = parseItemsCol(r.items_raw)
        const rp = parseRevenueCol(r.revenue_raw)
        return {
          store_name:          r.store_name,
          items_raw:           r.items_raw,
          revenue_raw:         r.revenue_raw,
          items_listed_sold:   ip?.items_listed_sold   ?? null,
          items_limit:         ip?.items_limit         ?? null,
          items_remaining:     ip?.items_remaining     ?? null,
          revenue_listed_sold: rp?.revenue_listed_sold ?? null,
          revenue_limit:       rp?.revenue_limit       ?? null,
          revenue_remaining:   rp?.revenue_remaining   ?? null,
        }
      })

      const resp = await fetch(`${BASE_URL}/api/store-limits/bulk`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ items: payload }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Upload failed')
      onImport(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl border border-border">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold">Import Store Limits</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {['paste', 'csv'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px
                ${tab === t ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {t === 'paste' ? '📋 Paste from Sheets' : '📂 Upload CSV'}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-4">
          {tab === 'paste' ? (
            <>
              <p className="text-xs text-muted-foreground">
                Select all cells in Google Sheets (including STORE, column B and C headers), then paste below.
                Tab-separated format is automatically detected.
              </p>
              <textarea
                className="w-full h-48 text-xs font-mono bg-muted/50 border border-border rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={"STORE\tMONTHLY LIMIT\t\nBUYSMARKET\t10Mmore items(30,022listed and sold / 10M limit on quantity of items)\tAU $46.1M more(AU $3.8Mlisted and sold / AU $50M limit)\n..."}
                value={text}
                onChange={e => setText(e.target.value)}
              />
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Export your Google Sheet as CSV (File → Download → CSV). Columns must be: STORE, items column, revenue column.
              </p>
              <div className="flex items-center gap-3">
                <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileLoad} />
                <button onClick={() => fileRef.current.click()}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <Upload size={14} /> Choose CSV file
                </button>
                {text && <span className="text-xs text-green-600 font-medium">✓ File loaded ({text.split('\n').length} lines)</span>}
              </div>
              {text && (
                <textarea
                  className="w-full h-32 text-xs font-mono bg-muted/50 border border-border rounded-lg p-3 resize-none"
                  readOnly value={text.slice(0, 500) + (text.length > 500 ? '...' : '')}
                />
              )}
            </>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Preview */}
          {preview.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2 text-muted-foreground">Preview (first 5 rows):</p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-[11px]">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">Store</th>
                      <th className="px-3 py-1.5 text-left font-medium">Items Parsed</th>
                      <th className="px-3 py-1.5 text-left font-medium">Revenue Parsed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => {
                      const ip = parseItemsCol(r.items_raw)
                      const rp = parseRevenueCol(r.revenue_raw)
                      return (
                        <tr key={i} className="border-t border-border">
                          <td className="px-3 py-1.5 font-medium">{r.store_name}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {ip ? `${fmtItems(ip.items_listed_sold)} / ${fmtItems(ip.items_limit)}` : 'N/A'}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {rp ? `${fmtAUD(rp.revenue_listed_sold)} / ${fmtAUD(rp.revenue_limit)}` : 'N/A'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button onClick={handlePreview} disabled={!text.trim()}
              className="px-4 py-2 text-sm font-medium border border-border rounded-lg bg-muted/50 hover:bg-muted transition-colors disabled:opacity-40">
              Preview
            </button>
            <button onClick={handleSubmit} disabled={!text.trim() || loading}
              className="px-5 py-2 text-sm font-medium rounded-lg bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-2">
              {loading && <RefreshCw size={12} className="animate-spin" />}
              {loading ? 'Importing…' : `Import ${tab === 'paste' ? '(Paste)' : '(CSV)'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Summary cards at top ────────────────────────────────────────────────────
function LimitSummaryCards({ limits }) {
  const total      = limits.length
  const critical   = limits.filter(l => pct(l.items_listed_sold, l.items_limit) >= 90 || pct(l.revenue_listed_sold, l.revenue_limit) >= 90).length
  const warning    = limits.filter(l => {
    const ip = pct(l.items_listed_sold, l.items_limit)
    const rp = pct(l.revenue_listed_sold, l.revenue_limit)
    return (ip >= 80 || rp >= 80) && ip < 90 && rp < 90
  }).length
  const ok         = total - critical - warning
  const avgItemPct = total ? Math.round(limits.reduce((a, l) => a + pct(l.items_listed_sold, l.items_limit), 0) / total) : 0
  const avgRevPct  = total ? Math.round(limits.reduce((a, l) => a + pct(l.revenue_listed_sold, l.revenue_limit), 0) / total) : 0

  const cards = [
    { label: 'Total Stores',      value: total,        sub: 'with limit data',          color: 'text-foreground' },
    { label: 'Critical (>90%)',   value: critical,     sub: 'need urgent attention',     color: 'text-red-600'   },
    { label: 'Warning (80–90%)',  value: warning,      sub: 'approaching limits',        color: 'text-amber-600' },
    { label: 'OK (<80%)',         value: ok,           sub: 'within safe range',         color: 'text-green-600' },
    { label: 'Avg Item Usage',    value: `${avgItemPct}%`, sub: 'across all stores',     color: avgItemPct >= 80 ? 'text-red-600' : 'text-foreground' },
    { label: 'Avg Revenue Usage', value: `${avgRevPct}%`, sub: 'across all stores',     color: avgRevPct >= 80 ? 'text-red-600' : 'text-foreground' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map(c => (
        <Card key={c.label} className="flex-1">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardDescription className="text-[10px] font-medium uppercase tracking-wide">{c.label}</CardDescription>
            <div className={`text-2xl font-black leading-tight ${c.color}`}>{c.value}</div>
          </CardHeader>
          <CardContent className="pt-0 pb-3 px-4">
            <p className="text-[10px] text-muted-foreground">{c.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function StoreLimitsPage({ onBack }) {
  const [limits,      setLimits]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showImport,  setShowImport]  = useState(false)
  const [search,      setSearch]      = useState('')
  const [sortKey,     setSortKey]     = useState('items_pct')
  const [sortDir,     setSortDir]     = useState('desc')
  const [filterWarn,  setFilterWarn]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await fetch(`${BASE_URL}/api/store-limits`)
      const data = await resp.json()
      if (Array.isArray(data)) setLimits(data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function handleImportDone(result) {
    setShowImport(false)
    load()
  }

  const filtered = limits
    .filter(l => {
      if (search && !l.store_name.toLowerCase().includes(search.toLowerCase())) return false
      if (filterWarn) {
        const ip = pct(l.items_listed_sold, l.items_limit)
        const rp = pct(l.revenue_listed_sold, l.revenue_limit)
        if (ip < 80 && rp < 80) return false
      }
      return true
    })
    .sort((a, b) => {
      let av, bv
      if (sortKey === 'store_name')   { av = a.store_name; bv = b.store_name; return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av) }
      if (sortKey === 'items_pct')    { av = pct(a.items_listed_sold, a.items_limit);     bv = pct(b.items_listed_sold, b.items_limit) }
      if (sortKey === 'revenue_pct')  { av = pct(a.revenue_listed_sold, a.revenue_limit); bv = pct(b.revenue_listed_sold, b.revenue_limit) }
      if (sortKey === 'items_limit')  { av = a.items_limit;   bv = b.items_limit }
      if (sortKey === 'revenue_limit'){ av = a.revenue_limit; bv = b.revenue_limit }
      return sortDir === 'asc' ? av - bv : bv - av
    })

  function SortIcon({ k }) {
    if (sortKey !== k) return <ChevronUp size={10} className="opacity-20" />
    return sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />
  }

  const thClass = "px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none"

  return (
    <div className="p-6 space-y-6">
      {showImport && <ImportModal onClose={() => setShowImport(false)} onImport={handleImportDone} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={16} /> Back
          </button>
          <div>
            <h1 className="text-xl font-black">Store Limits</h1>
            <p className="text-xs text-muted-foreground">eBay monthly item & revenue limits across all stores</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg bg-muted/30 hover:bg-muted/60 transition-all text-muted-foreground hover:text-foreground">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg bg-foreground text-background hover:opacity-90 transition-opacity">
            <Upload size={12} /> Import Data
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {!loading && limits.length > 0 && <LimitSummaryCards limits={limits} />}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search stores…"
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/60" />
        </div>
        <button onClick={() => setFilterWarn(w => !w)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-all
            ${filterWarn ? 'bg-amber-100 border-amber-300 text-amber-700' : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted/60'}`}>
          <AlertTriangle size={11} /> Warning only
        </button>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} of {limits.length} stores</span>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className={thClass} style={{ width: 32 }}>#</th>
                <th className={thClass} onClick={() => handleSort('store_name')}>
                  <span className="flex items-center gap-1">Store <SortIcon k="store_name" /></span>
                </th>
                <th className={thClass} onClick={() => handleSort('items_listed_sold')}>
                  <span className="flex items-center gap-1"><Package size={10} /> Items Used <SortIcon k="items_listed_sold" /></span>
                </th>
                <th className={thClass} onClick={() => handleSort('items_limit')}>
                  <span className="flex items-center gap-1">Item Limit <SortIcon k="items_limit" /></span>
                </th>
                <th className={thClass} onClick={() => handleSort('items_pct')}>
                  <span className="flex items-center gap-1">Item % <SortIcon k="items_pct" /></span>
                </th>
                <th className={thClass} onClick={() => handleSort('revenue_listed_sold')}>
                  <span className="flex items-center gap-1"><DollarSign size={10} /> Rev. Used <SortIcon k="revenue_listed_sold" /></span>
                </th>
                <th className={thClass} onClick={() => handleSort('revenue_limit')}>
                  <span className="flex items-center gap-1">Rev. Limit <SortIcon k="revenue_limit" /></span>
                </th>
                <th className={thClass} onClick={() => handleSort('revenue_pct')}>
                  <span className="flex items-center gap-1">Rev. % <SortIcon k="revenue_pct" /></span>
                </th>
                <th className={thClass}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border animate-pulse">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="py-3 px-3"><div className="h-3 bg-muted rounded w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="py-16 text-center text-sm text-muted-foreground">
                  {limits.length === 0 ? 'No limit data yet. Click "Import Data" to get started.' : 'No stores match your search.'}
                </td></tr>
              ) : (
                filtered.map((limit, i) => <LimitRow key={limit.store_name} limit={limit} rank={i + 1} />)
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {limits.length > 0 && (
        <p className="text-[10px] text-muted-foreground text-center">
          Last updated from import · {limits.length} stores tracked ·
          Data sourced from Google Sheets (2026 EMEGA SALES)
        </p>
      )}
    </div>
  )
}