// C:\Users\ADMIN\scraper\src\pages\ebay\ActiveHealthPage.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  ChevronLeft, Download, CheckCircle2, ZapOff, PackageX, Clock,
  Search, RefreshCw, AlertCircle,
} from 'lucide-react'
import {
  Card, CardContent,
} from '@/components/ui/card'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const fmt = n => Number(n || 0).toLocaleString()
const PAGE_SIZE = 25

// ─── Categories ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'all_paired',      label: 'All Paired',      icon: CheckCircle2, color: 'text-blue-600',   bg: 'bg-blue-100',   ring: 'ring-blue-500',   summaryKey: 'paired',                  csv: '/api/export/active-all-paired'   },
  { key: 'truly_healthy',   label: 'Truly Healthy',   icon: CheckCircle2, color: 'text-green-600',  bg: 'bg-green-100',  ring: 'ring-green-500',  summaryKey: 'active_truly_healthy',    csv: '/api/export/active-truly-healthy' },
  { key: 'autods_inactive', label: 'AutoDS Inactive', icon: ZapOff,       color: 'text-red-600',    bg: 'bg-red-100',    ring: 'ring-red-500',    summaryKey: 'active_autods_inactive',  csv: '/api/export/active-autods-inactive' },
  { key: 'autods_oos',      label: 'AutoDS OOS',      icon: PackageX,     color: 'text-orange-600', bg: 'bg-orange-100', ring: 'ring-orange-500', summaryKey: 'active_autods_oos',       csv: '/api/export/active-autods-oos' },
  { key: 'on_hold',         label: 'On Hold',         icon: Clock,        color: 'text-amber-600',  bg: 'bg-amber-100',  ring: 'ring-amber-500',  summaryKey: 'active_autods_onhold',    csv: '/api/export/active-autods-onhold' },
  { key: 'not_paired',      label: 'Not Paired',      icon: AlertCircle,  color: 'text-purple-600', bg: 'bg-purple-100', ring: 'ring-purple-500', summaryKey: 'not_on_ebay',             csv: '/api/export/autods-not-ebay' },
]

// ─── Skeleton row ─────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-b border-border/50">
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-4 py-2.5">
          <div className="h-3 bg-muted rounded animate-pulse w-4/5" />
        </td>
      ))}
    </tr>
  )
}

// ─── Category tile ────────────────────────────────────────────────────────────
function CategoryTile({ cat, value, active, onClick }) {
  const Icon = cat.icon
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl p-4 border transition-all ${
        active
          ? `${cat.bg} border-transparent ring-2 ${cat.ring}`
          : 'bg-card border-border hover:bg-muted/40'
      }`}
    >
      <div className={`flex items-center gap-1.5 text-xs font-semibold mb-1.5 ${active ? cat.color : 'text-muted-foreground'}`}>
        <Icon size={13} /> {cat.label}
      </div>
      <p className={`text-xl font-bold ${active ? cat.color : 'text-foreground'}`}>{fmt(value)}</p>
    </button>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ActiveHealthPage({ onBack, summary }) {
  const [activeCat, setActiveCat] = useState('all_paired')
  const [rows,      setRows]      = useState([])
  const [page,      setPage]      = useState(0)
  const [loading,   setLoading]   = useState(false)
  const [search,    setSearch]    = useState('')
  const requestIdRef = useRef(0)

  const cat        = CATEGORIES.find(c => c.key === activeCat)
  const count      = Number(summary?.[cat.summaryKey] || 0)
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))

  const load = useCallback(async () => {
    const myId = ++requestIdRef.current
    setLoading(true)
    try {
      const params = new URLSearchParams({ category: activeCat, page, limit: PAGE_SIZE })
      if (search) params.set('store_name', search)
      const resp = await fetch(`${BASE_URL}/api/active-health/list?${params}`)
      const data = await resp.json()
      if (myId !== requestIdRef.current) return // stale response, ignore
      setRows(data.data || [])
    } catch (e) {
      console.error('Active health load failed:', e)
    } finally {
      if (myId === requestIdRef.current) setLoading(false)
    }
  }, [activeCat, page, search])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(0) }, [activeCat, search])

  function handleDownload() {
    const a = document.createElement('a')
    a.href = `${BASE_URL}${cat.csv}`
    a.download = `${cat.key}_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click()
    document.body.removeChild(a)
  }

  const isNotPaired = activeCat === 'not_paired'

  return (
    <div className="p-6 space-y-5 w-full">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft size={14} /> Back
        </button>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-rose-500" />
          <h1 className="text-lg font-bold text-foreground">Active Listing Health</h1>
        </div>
        <p className="text-xs text-muted-foreground hidden sm:block">
          — active eBay Amazon listings broken down by AutoDS status
        </p>
      </div>

      {/* ── Category tiles ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {CATEGORIES.map(c => (
          <CategoryTile
            key={c.key}
            cat={c}
            value={Number(summary?.[c.summaryKey] || 0)}
            active={activeCat === c.key}
            onClick={() => setActiveCat(c.key)}
          />
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2">
        {!isNotPaired && (
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter by store name…"
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg bg-muted/30 hover:bg-muted/60 transition-all"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
        <button
          onClick={handleDownload}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg bg-muted/30 hover:bg-muted/60 transition-all"
        >
          <Download size={11} /> Export CSV
        </button>
      </div>

      {/* ── Table ── */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                    {!isNotPaired && <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Store</th>}
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">{isNotPaired ? 'SKU' : 'eBay SKU'}</th>
                    {!isNotPaired && <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Origin SKU</th>}
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">AutoDS ID</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Title</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Price</th>
                    {!isNotPaired && <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Qty</th>}
                    <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">AutoDS Stock</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Updated</th>
                </tr>
                </thead>
            <tbody>
  {loading ? (
    Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)
  ) : rows.length === 0 ? (
    <tr>
      <td colSpan={9} className="px-4 py-16 text-center text-sm text-muted-foreground">
        No results
      </td>
    </tr>
  ) : (
    rows.map((r, i) => (
      <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
        {!isNotPaired && <td className="px-4 py-2">{r.store_name || '—'}</td>}
        <td className="px-4 py-2 font-mono font-bold text-foreground">{r.sku}</td>
        {!isNotPaired && <td className="px-4 py-2 font-mono text-muted-foreground">{r.origin_sku || '—'}</td>}
        <td className="px-4 py-2 font-mono text-muted-foreground">{r.autods_id || '—'}</td>
        <td className="px-4 py-2 text-foreground max-w-xs truncate" title={r.title || ''}>
          {r.title || '—'}
        </td>
        <td className="px-4 py-2 text-right">
          {r.price != null ? `$${Number(r.price).toFixed(2)}` : '—'}
        </td>
        {!isNotPaired && <td className="px-4 py-2 text-right">{r.quantity ?? '—'}</td>}
        <td className="px-4 py-2 text-right">{r.autods_stock ?? r.stock ?? '—'}</td>
        <td className="px-4 py-2 text-muted-foreground">
          {(r.autods_updated || r.updated_at)
            ? new Date(r.autods_updated || r.updated_at).toLocaleDateString()
            : '—'}
        </td>
      </tr>
    ))
  )}
</tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Pagination ── */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-muted-foreground">
          Page {page + 1} of {fmt(totalPages)} · {fmt(count)} total
        </p>
        <div className="flex items-center gap-1">
          <button
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 border border-border rounded text-xs disabled:opacity-30 hover:bg-muted/50 transition-colors"
          >
            Prev
          </button>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 border border-border rounded text-xs disabled:opacity-30 hover:bg-muted/50 transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}