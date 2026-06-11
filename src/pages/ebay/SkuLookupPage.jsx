// C:\Users\ADMIN\scraper\src\pages\ebay\SkuLookupPage.jsx
import React, { useState, useRef, useCallback } from 'react'
import {
  Search, X, Download, AlertCircle, CheckCircle2,
  ZapOff, Clipboard, ChevronLeft, FileSearch,
  Hash, ArrowRight, RefreshCw,
} from 'lucide-react'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const fmt = n => Number(n || 0).toLocaleString()

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS = {
  matched:   { label: 'Matched',       bg: 'bg-green-100',  text: 'text-green-700',  icon: CheckCircle2, dot: 'bg-green-500'  },
  no_autods: { label: 'No AutoDS',     bg: 'bg-orange-100', text: 'text-orange-700', icon: ZapOff,       dot: 'bg-orange-400' },
  no_map:    { label: 'No SKU Map',    bg: 'bg-amber-100',  text: 'text-amber-700',  icon: AlertCircle,  dot: 'bg-amber-400'  },
  not_found: { label: 'Not Found',     bg: 'bg-red-100',    text: 'text-red-700',    icon: X,            dot: 'bg-red-500'    },
}

function getStatus(row) {
  if (row.not_found)                         return 'not_found'
  if (!row.origin_sku)                       return 'no_map'
  if (row.origin_sku && !row.autods_id)      return 'no_autods'
  return 'matched'
}

function StatusBadge({ statusKey, size = 'sm' }) {
  const s    = STATUS[statusKey]
  const Icon = s.icon
  const px   = size === 'xs' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-xs'
  return (
    <span className={`inline-flex items-center gap-1 font-semibold rounded-full ${px} ${s.bg} ${s.text}`}>
      <Icon size={size === 'xs' ? 8 : 10} />
      {s.label}
    </span>
  )
}

// ─── Row highlight colours ────────────────────────────────────────────────────
const ROW_BG = {
  matched:   'hover:bg-green-50/40',
  no_autods: 'bg-orange-50/30 hover:bg-orange-50/50',
  no_map:    'bg-amber-50/30 hover:bg-amber-50/50',
  not_found: 'bg-red-50/30 hover:bg-red-50/50',
}

// ─── Summary pill ─────────────────────────────────────────────────────────────
function StatPill({ statusKey, count }) {
  if (!count) return null
  const s    = STATUS[statusKey]
  const Icon = s.icon
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      <Icon size={11} />
      {count} {s.label}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted/60 flex items-center justify-center">
        <FileSearch size={28} className="text-muted-foreground/40" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground mb-1">Paste SKUs to get started</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Enter one or more eBay SKUs (e.g. <span className="font-mono">A2214835214</span>) to
          resolve their Origin SKU and AutoDS ID.
        </p>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-2">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> Matched</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-400" /> No AutoDS</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" /> No SKU Map</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> Not Found</span>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SkuLookupPage({ onBack }) {
  const [input,   setInput]   = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [filter,  setFilter]  = useState('all') // all | matched | no_autods | no_map | not_found
  const textareaRef = useRef(null)

  function parseSkus(raw) {
    return [...new Set(
      raw.split(/[\n,\s]+/)
        .map(s => s.trim().toUpperCase())
        .filter(Boolean)
    )]
  }

  const skuCount = parseSkus(input).length

  async function handleLookup() {
    const skus = parseSkus(input)
    if (!skus.length) return
    setLoading(true)
    setError(null)
    setResults(null)
    setFilter('all')
    try {
      const resp = await fetch(`${BASE_URL}/api/export/sku-lookup`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ skus }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || resp.statusText)
      setResults(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText()
      setInput(prev => prev ? prev + '\n' + text : text)
      textareaRef.current?.focus()
    } catch { /* denied */ }
  }

  function handleClear() {
    setInput('')
    setResults(null)
    setError(null)
    setFilter('all')
  }

  function handleDownloadCsv() {
    if (!results?.length) return
    const headers = ['sku', 'origin_sku', 'autods_id', 'status']
    const rows = results.map(r => [
      r.sku,
      r.origin_sku  || '',
      r.autods_id   || '',
      getStatus(r),
    ])
    const csv = [headers, ...rows]
      .map(r => r.map(v => String(v).includes(',') ? `"${v}"` : v).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `sku_lookup_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  // ── Derived stats ──
  const stats = results ? {
    total:     results.length,
    matched:   results.filter(r => getStatus(r) === 'matched').length,
    no_autods: results.filter(r => getStatus(r) === 'no_autods').length,
    no_map:    results.filter(r => getStatus(r) === 'no_map').length,
    not_found: results.filter(r => getStatus(r) === 'not_found').length,
  } : null

  const displayedResults = results
    ? (filter === 'all' ? results : results.filter(r => getStatus(r) === filter))
    : []

  const FILTERS = [
    { key: 'all',       label: 'All',        count: stats?.total     },
    { key: 'matched',   label: 'Matched',    count: stats?.matched   },
    { key: 'no_autods', label: 'No AutoDS',  count: stats?.no_autods },
    { key: 'no_map',    label: 'No SKU Map', count: stats?.no_map    },
    { key: 'not_found', label: 'Not Found',  count: stats?.not_found },
  ]

  return (
    <div className="p-6 space-y-5 max-w-6xl">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={14} />
          Back
        </button>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <FileSearch size={16} className="text-blue-500" />
          <h1 className="text-lg font-bold text-foreground">SKU Lookup</h1>
        </div>
        <p className="text-xs text-muted-foreground hidden sm:block">
          — resolve eBay SKUs to Origin SKU &amp; AutoDS ID
        </p>
      </div>

      {/* ── Main layout: input left, results right ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-5 items-start">

        {/* LEFT — Input panel */}
        <div className="space-y-4 xl:sticky xl:top-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Paste SKUs</CardTitle>
              <CardDescription className="text-xs">
                One per line, or comma / space separated
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">

              {/* Textarea */}
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleLookup() }}
                  placeholder={'A2214835214\nA6130067168\nA3636667425\n…'}
                  rows={10}
                  className="w-full px-3 py-2.5 text-xs font-mono bg-muted/40 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring resize-y leading-relaxed placeholder:text-muted-foreground/30"
                />
                {skuCount > 0 && (
                  <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 bg-background/80 backdrop-blur-sm border border-border rounded px-1.5 py-0.5">
                    <Hash size={9} className="text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground tabular-nums font-medium">{skuCount}</span>
                  </div>
                )}
              </div>

              {/* Action row */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePaste}
                  className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-1.5 hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                >
                  <Clipboard size={11} /> Paste
                </button>
                {input && (
                  <button
                    onClick={handleClear}
                    className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-1.5 hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <X size={11} /> Clear
                  </button>
                )}
                <p className="text-[10px] text-muted-foreground/50 ml-auto hidden sm:block">⌘↵ to run</p>
              </div>

              {/* Lookup button */}
              <button
                onClick={handleLookup}
                disabled={loading || skuCount === 0}
                className="w-full flex items-center justify-center gap-2 text-sm font-semibold bg-blue-500 hover:bg-blue-600 text-white rounded-lg px-4 py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    Looking up…
                  </>
                ) : (
                  <>
                    <Search size={13} />
                    Look Up {skuCount > 0 ? `${skuCount} SKU${skuCount !== 1 ? 's' : ''}` : 'SKUs'}
                    <ArrowRight size={13} className="ml-auto opacity-60" />
                  </>
                )}
              </button>

              {error && (
                <p className="flex items-center gap-1.5 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
                  <AlertCircle size={11} className="flex-shrink-0" /> {error}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Legend card */}
          <Card>
            <CardContent className="py-3 px-4 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Status Guide</p>
              {Object.entries(STATUS).map(([key, s]) => {
                const Icon = s.icon
                return (
                  <div key={key} className="flex items-start gap-2">
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0 ${s.bg}`}>
                      <Icon size={10} className={s.text} />
                    </span>
                    <div>
                      <p className={`text-xs font-semibold ${s.text}`}>{s.label}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        {key === 'matched'   && 'Found in sku_map and linked to AutoDS'}
                        {key === 'no_autods' && 'In sku_map but no matching AutoDS product'}
                        {key === 'no_map'    && 'SKU exists on eBay but not in sku_map'}
                        {key === 'not_found' && 'SKU not found in eBay or sku_map at all'}
                      </p>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT — Results panel */}
        <div className="space-y-4">

          {/* Stats + filter bar — only when results exist */}
          {results && (
            <>
              {/* Stats pills */}
              <div className="flex flex-wrap gap-2">
                <StatPill statusKey="matched"   count={stats.matched}   />
                <StatPill statusKey="no_autods" count={stats.no_autods} />
                <StatPill statusKey="no_map"    count={stats.no_map}    />
                <StatPill statusKey="not_found" count={stats.not_found} />
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{fmt(stats.total)} total</span>
                  <button
                    onClick={handleDownloadCsv}
                    className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-1.5 hover:bg-muted/50 transition-colors font-medium"
                  >
                    <Download size={11} /> CSV
                  </button>
                </div>
              </div>

              {/* Filter tabs */}
              <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1 w-fit">
                {FILTERS.map(f => f.count !== 0 && (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all
                      ${filter === f.key
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {f.label}
                    {f.count != null && (
                      <span className={`tabular-nums text-[10px] ${filter === f.key ? 'text-foreground' : 'text-muted-foreground/60'}`}>
                        {fmt(f.count)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {!results ? (
                <EmptyState />
              ) : displayedResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <Search size={22} className="text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No results for this filter</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground w-8">#</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">eBay SKU</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Origin SKU</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">AutoDS ID</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedResults.map((row, i) => {
                        const statusKey = getStatus(row)
                        return (
                          <tr
                            key={row.sku}
                            className={`border-b border-border/50 transition-colors ${ROW_BG[statusKey]}`}
                          >
                            <td className="px-4 py-2 text-muted-foreground/40 tabular-nums">{i + 1}</td>
                            <td className="px-4 py-2 font-mono font-bold text-foreground whitespace-nowrap">
                              {row.sku}
                            </td>
                            <td className="px-4 py-2 font-mono text-muted-foreground whitespace-nowrap">
                              {row.origin_sku
                                ? <span className="text-foreground">{row.origin_sku}</span>
                                : <span className="text-muted-foreground/30">—</span>}
                            </td>
                            <td className="px-4 py-2 font-mono text-muted-foreground whitespace-nowrap">
                              {row.autods_id
                                ? <span className="text-foreground">{row.autods_id}</span>
                                : <span className="text-muted-foreground/30">—</span>}
                            </td>
                            <td className="px-4 py-2">
                              <StatusBadge statusKey={statusKey} size="xs" />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}