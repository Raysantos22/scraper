// C:\Users\ADMIN\scraper\src\pages\ebay\SkuLookupPage.jsx
import React, { useState, useRef, useCallback } from 'react'
import {
  Search, X, Download, AlertCircle, CheckCircle2,
  ZapOff, Clipboard, ChevronLeft, FileSearch,
  Hash, RefreshCw, Upload, FileText, ChevronDown,
  ChevronUp, Loader2,
} from 'lucide-react'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const CHUNK_SIZE = 1000

const fmt  = n => Number(n || 0).toLocaleString()
const pct  = (n, t) => t ? Math.round((n / t) * 100) : 0

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS = {
  matched:   { label: 'Matched',    bg: 'bg-green-100',  text: 'text-green-700',  icon: CheckCircle2, dot: 'bg-green-500'  },
  no_autods: { label: 'No AutoDS',  bg: 'bg-orange-100', text: 'text-orange-700', icon: ZapOff,       dot: 'bg-orange-400' },
  no_map:    { label: 'No SKU Map', bg: 'bg-amber-100',  text: 'text-amber-700',  icon: AlertCircle,  dot: 'bg-amber-400'  },
  not_found: { label: 'Not Found',  bg: 'bg-red-100',    text: 'text-red-700',    icon: X,            dot: 'bg-red-500'    },
}

function getStatus(row) {
  if (row.not_found)                    return 'not_found'
  if (!row.origin_sku)                  return 'no_map'
  if (row.origin_sku && !row.autods_id) return 'no_autods'
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

const ROW_BG = {
  matched:   'hover:bg-green-50/40',
  no_autods: 'bg-orange-50/30 hover:bg-orange-50/50',
  no_map:    'bg-amber-50/30 hover:bg-amber-50/50',
  not_found: 'bg-red-50/30 hover:bg-red-50/50',
}

function StatPill({ statusKey, count }) {
  if (!count) return null
  const s    = STATUS[statusKey]
  const Icon = s.icon
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      <Icon size={11} />
      {fmt(count)} {s.label}
    </div>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ done, total, label }) {
  const p = pct(done, total)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" />{label}</span>
        <span className="tabular-nums font-medium">{fmt(done)} / {fmt(total)} ({p}%)</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-300"
          style={{ width: `${p}%` }}
        />
      </div>
    </div>
  )
}

// ─── Virtual table — only renders visible rows ────────────────────────────────
const ROW_H = 36
const OVERSCAN = 20

function VirtualTable({ rows }) {
  const containerRef = useRef(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight]       = useState(600)

  // measure container
  const resizeObsRef = useRef(null)
  const setRef = useCallback(el => {
    if (!el) return
    containerRef.current = el
    if (resizeObsRef.current) resizeObsRef.current.disconnect()
    const ro = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height))
    ro.observe(el)
    resizeObsRef.current = ro
  }, [])

  const totalH   = rows.length * ROW_H
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const endIdx   = Math.min(rows.length - 1, Math.ceil((scrollTop + height) / ROW_H) + OVERSCAN)
  const visible  = rows.slice(startIdx, endIdx + 1)

  return (
    <div
      ref={setRef}
      className="overflow-auto"
      style={{ maxHeight: 600 }}
      onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
    >
      <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 40 }} />
          <col style={{ width: 160 }} />
          <col style={{ width: 160 }} />
          <col style={{ width: 220 }} />
          <col style={{ width: 110 }} />
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-border bg-muted/90 backdrop-blur-sm">
            <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">#</th>
            <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">eBay SKU</th>
            <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Origin SKU</th>
            <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">AutoDS ID</th>
            <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Status</th>
          </tr>
        </thead>
        <tbody>
          {/* top spacer */}
          {startIdx > 0 && (
            <tr style={{ height: startIdx * ROW_H }}><td colSpan={5} /></tr>
          )}
          {visible.map((row, i) => {
            const idx       = startIdx + i
            const statusKey = getStatus(row)
            return (
              <tr
                key={row.sku}
                style={{ height: ROW_H }}
                className={`border-b border-border/50 transition-colors ${ROW_BG[statusKey]}`}
              >
                <td className="px-3 py-2 text-muted-foreground/40 tabular-nums">{fmt(idx + 1)}</td>
                <td className="px-3 py-2 font-mono font-bold text-foreground truncate">{row.sku}</td>
                <td className="px-3 py-2 font-mono text-muted-foreground truncate">
                  {row.origin_sku
                    ? <span className="text-foreground">{row.origin_sku}</span>
                    : <span className="text-muted-foreground/30">—</span>}
                </td>
                <td className="px-3 py-2 font-mono text-muted-foreground truncate">
                  {row.autods_id
                    ? <span className="text-foreground">{row.autods_id}</span>
                    : <span className="text-muted-foreground/30">—</span>}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge statusKey={statusKey} size="xs" />
                </td>
              </tr>
            )
          })}
          {/* bottom spacer */}
          {endIdx < rows.length - 1 && (
            <tr style={{ height: (rows.length - 1 - endIdx) * ROW_H }}><td colSpan={5} /></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted/60 flex items-center justify-center">
        <FileSearch size={28} className="text-muted-foreground/40" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground mb-1">Paste or upload SKUs to get started</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Supports up to 300k+ SKUs via CSV upload or paste.
          Batches automatically — results stream in as they complete.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-muted-foreground mt-1">
        {Object.entries(STATUS).map(([k, s]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${s.dot}`} /> {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SkuLookupPage({ onBack }) {
  const [input,     setInput]     = useState('')
  const [results,   setResults]   = useState(null)   // all rows accumulated
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [filter,    setFilter]    = useState('all')
  const [progress,  setProgress]  = useState({ done: 0, total: 0 })
  const [fileName,  setFileName]  = useState(null)
  const [showInput, setShowInput] = useState(true)

  const textareaRef = useRef(null)
  const fileRef     = useRef(null)
  const abortRef    = useRef(null)

  // ── Parse raw text → deduped uppercase SKU array ──
  function parseSkus(raw) {
    return [...new Set(
      raw.split(/[\n,\t]+/)
        .map(s => s.trim().toUpperCase())
        .filter(Boolean)
    )]
  }

  const skuCount = parseSkus(input).length

  // ── CSV file handler ──
  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = evt => {
      const text = evt.target.result
      // Auto-detect column containing SKUs: try first column header or just dump all cells
      const lines = text.split(/\r?\n/).filter(Boolean)
      // If first line looks like a header (non-numeric, non-SKU), skip it
      const firstCell = lines[0]?.split(/[,\t]/)[0]?.trim() || ''
      const isHeader  = !/^[AB0-9]/i.test(firstCell)
      const dataLines = isHeader ? lines.slice(1) : lines
      // Extract first column (or whole line if single-column)
      const skus = [...new Set(
        dataLines
          .map(l => l.split(/[,\t]/)[0]?.trim().toUpperCase())
          .filter(Boolean)
      )]
      setInput(skus.join('\n'))
      setShowInput(true)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // ── Chunk array ──
  function chunks(arr, size) {
    const out = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
  }

  // ── Main lookup — batched ──
  async function handleLookup() {
    const skus = parseSkus(input)
    if (!skus.length) return

    setLoading(true)
    setError(null)
    setResults([])
    setFilter('all')
    setProgress({ done: 0, total: skus.length })
    setShowInput(false)

    const controller = new AbortController()
    abortRef.current = controller

    const batches     = chunks(skus, CHUNK_SIZE)
    const accumulated = []

    try {
      for (let b = 0; b < batches.length; b++) {
        if (controller.signal.aborted) break
        const batch = batches[b]
        const resp  = await fetch(`${BASE_URL}/api/export/sku-lookup`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ skus: batch }),
          signal:  controller.signal,
        })
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}))
          throw new Error(data.error || resp.statusText)
        }
        const rows = await resp.json()
        accumulated.push(...rows)
        setResults([...accumulated])
        setProgress({ done: accumulated.length, total: skus.length })
      }
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  function handleCancel() {
    abortRef.current?.abort()
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
    setFileName(null)
    setShowInput(true)
    setProgress({ done: 0, total: 0 })
  }

  // ── CSV download — streams from accumulated results ──
  function handleDownloadCsv() {
    if (!results?.length) return
    const headers = ['sku', 'origin_sku', 'autods_id', 'status']
    const rows = results.map(r => [
      r.sku,
      r.origin_sku  || '',
      r.autods_id   || '',
      getStatus(r),
    ])
    const csv  = [headers, ...rows]
      .map(r => r.map(v => {
        const s = String(v)
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
      }).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `sku_lookup_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  // ── Autods-only CSV — just sku + autods_id for matched rows ──
  function handleDownloadAutodsOnly() {
    const matched = (results || []).filter(r => getStatus(r) === 'matched')
    if (!matched.length) return
    const csv = ['sku,autods_id', ...matched.map(r => `${r.sku},${r.autods_id}`)].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `autods_ids_${new Date().toISOString().slice(0, 10)}.csv`
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

  const filteredResults = results
    ? (filter === 'all' ? results : results.filter(r => getStatus(r) === filter))
    : []

  const FILTERS = [
    { key: 'all',       label: 'All',        count: stats?.total     },
    { key: 'matched',   label: 'Matched',    count: stats?.matched   },
    { key: 'no_autods', label: 'No AutoDS',  count: stats?.no_autods },
    { key: 'no_map',    label: 'No SKU Map', count: stats?.no_map    },
    { key: 'not_found', label: 'Not Found',  count: stats?.not_found },
  ]

  const isLarge = skuCount > 10000

  return (
    <div className="p-6 space-y-5 max-w-6xl">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={14} /> Back
        </button>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <FileSearch size={16} className="text-blue-500" />
          <h1 className="text-lg font-bold text-foreground">SKU Lookup</h1>
        </div>
        <p className="text-xs text-muted-foreground hidden sm:block">
          — resolve eBay SKUs → Origin SKU &amp; AutoDS ID · bulk-ready up to 300k+
        </p>
      </div>

      {/* ── Layout ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5 items-start">

        {/* LEFT — Input panel */}
        <div className="space-y-4 xl:sticky xl:top-6">

          {/* Collapsible input when results are showing */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">Input SKUs</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Paste, type, or upload a CSV
                  </CardDescription>
                </div>
                {results !== null && (
                  <button
                    onClick={() => setShowInput(v => !v)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {showInput ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {showInput ? 'Hide' : 'Edit'}
                  </button>
                )}
              </div>
            </CardHeader>

            {showInput && (
              <CardContent className="space-y-3 pt-0">

                {/* File upload strip */}
                <div
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 border border-dashed border-border rounded-lg px-3 py-2.5 hover:bg-muted/40 cursor-pointer transition-colors group"
                >
                  <Upload size={13} className="text-muted-foreground group-hover:text-foreground" />
                  <span className="text-xs text-muted-foreground group-hover:text-foreground flex-1">
                    {fileName
                      ? <span className="flex items-center gap-1.5 text-blue-500 font-medium"><FileText size={11} />{fileName}</span>
                      : 'Upload CSV — first column used as SKUs'}
                  </span>
                  {fileName && (
                    <button
                      onClick={e => { e.stopPropagation(); setFileName(null); setInput('') }}
                      className="text-muted-foreground hover:text-red-500"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
                <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />

                {/* Textarea */}
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleLookup() }}
                    placeholder={'A2214835214\nA6130067168\nPL_12345\n…'}
                    rows={isLarge ? 4 : 10}
                    className="w-full px-3 py-2.5 text-xs font-mono bg-muted/40 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring resize-y leading-relaxed placeholder:text-muted-foreground/30"
                  />
                  {skuCount > 0 && (
                    <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 bg-background/80 backdrop-blur-sm border border-border rounded px-1.5 py-0.5">
                      <Hash size={9} className="text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground tabular-nums font-medium">{fmt(skuCount)}</span>
                    </div>
                  )}
                </div>

                {isLarge && (
                  <p className="text-[10px] text-blue-500 bg-blue-50 rounded-lg px-3 py-1.5">
                    Large set detected — will process in {Math.ceil(skuCount / CHUNK_SIZE)} batches of {fmt(CHUNK_SIZE)} · results stream in live
                  </p>
                )}

                {/* Actions */}
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
                  <p className="text-[10px] text-muted-foreground/40 ml-auto hidden sm:block">⌘↵ to run</p>
                </div>

                {/* Lookup button */}
                {loading ? (
                  <button
                    onClick={handleCancel}
                    className="w-full flex items-center justify-center gap-2 text-sm font-semibold bg-red-500 hover:bg-red-600 text-white rounded-lg px-4 py-2.5 transition-colors"
                  >
                    <X size={13} /> Cancel
                  </button>
                ) : (
                  <button
                    onClick={handleLookup}
                    disabled={skuCount === 0}
                    className="w-full flex items-center justify-center gap-2 text-sm font-semibold bg-blue-500 hover:bg-blue-600 text-white rounded-lg px-4 py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Search size={13} />
                    Look Up {skuCount > 0 ? `${fmt(skuCount)} SKU${skuCount !== 1 ? 's' : ''}` : 'SKUs'}
                  </button>
                )}

                {error && (
                  <p className="flex items-center gap-1.5 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
                    <AlertCircle size={11} className="flex-shrink-0" /> {error}
                  </p>
                )}
              </CardContent>
            )}
          </Card>

          {/* Progress card — visible while loading */}
          {loading && (
            <Card>
              <CardContent className="py-4 px-4">
                <ProgressBar
                  done={progress.done}
                  total={progress.total}
                  label={`Batch ${Math.ceil(progress.done / CHUNK_SIZE)} of ${Math.ceil(progress.total / CHUNK_SIZE)}`}
                />
              </CardContent>
            </Card>
          )}

          {/* Legend */}
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

          {results !== null && (
            <>
              {/* Stats pills */}
              <div className="flex flex-wrap gap-2 items-center">
                <StatPill statusKey="matched"   count={stats.matched}   />
                <StatPill statusKey="no_autods" count={stats.no_autods} />
                <StatPill statusKey="no_map"    count={stats.no_map}    />
                <StatPill statusKey="not_found" count={stats.not_found} />

                <div className="ml-auto flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    {loading
                      ? <span className="flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> {fmt(stats.total)} so far…</span>
                      : `${fmt(stats.total)} total`}
                  </span>

                  {stats?.matched > 0 && (
                    <button
                      onClick={handleDownloadAutodsOnly}
                      className="flex items-center gap-1.5 text-xs border border-blue-300 bg-blue-50 text-blue-600 rounded-lg px-3 py-1.5 hover:bg-blue-100 transition-colors font-medium"
                    >
                      <Download size={11} /> AutoDS IDs
                    </button>
                  )}
                  <button
                    onClick={handleDownloadCsv}
                    disabled={!results?.length}
                    className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-1.5 hover:bg-muted/50 transition-colors font-medium disabled:opacity-40"
                  >
                    <Download size={11} /> Full CSV
                  </button>
                </div>
              </div>

              {/* Filter tabs */}
              <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1 w-fit flex-wrap">
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
              {results === null ? (
                <EmptyState />
              ) : filteredResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <Search size={22} className="text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No results for this filter</p>
                </div>
              ) : (
                <VirtualTable rows={filteredResults} />
              )}
            </CardContent>
          </Card>

          {/* Row count footer */}
          {filteredResults.length > 0 && (
            <p className="text-[11px] text-muted-foreground/50 text-right">
              Showing {fmt(filteredResults.length)} row{filteredResults.length !== 1 ? 's' : ''}
              {filter !== 'all' && ` (${filter} filter)`}
              {' · '}virtual scroll enabled
            </p>
          )}
        </div>
      </div>
    </div>
  )
}