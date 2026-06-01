// C:\Users\ADMIN\scraper\src\pages\ebay\BannedSkusPage.jsx
import React, { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import {
  AlertTriangle, Plus, Trash2, Download, RefreshCw,
  ArrowLeft, ShieldAlert, ShieldCheck, Search, X,
} from 'lucide-react'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const fmt = n => Number(n || 0).toLocaleString()

// ── Cache must be OUTSIDE the component so it persists across renders ──
const BANNED_CACHE = { data: null, ts: 0 }
const STALE_MS = 30_000

function timeAgo(dateStr) {
  if (!dateStr) return null
  const diff  = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  < 1)  return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

export default function BannedSkusPage({ onBack, initialStore }) {
  const [banned,      setBanned]      = useState([])
  const [live,        setLive]        = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState(initialStore || '')
  const [newSku,      setNewSku]      = useState('')
  const [newReason,   setNewReason]   = useState('')
  const [adding,      setAdding]      = useState(false)
  const [deleting,    setDeleting]    = useState({})
  const [error,       setError]       = useState(null)
  const [tab,         setTab]         = useState('live')
  const [downloading, setDownloading] = useState(false)

  async function loadAll(force = false) {
    if (!force && BANNED_CACHE.data && Date.now() - BANNED_CACHE.ts < STALE_MS) {
      setBanned(BANNED_CACHE.data.banned)
      setLive(BANNED_CACHE.data.live)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await api.get('/api/banned-skus/combined')
      if (data) {
        BANNED_CACHE.data = data
        BANNED_CACHE.ts   = Date.now()
        setBanned(data.banned)
        setLive(data.live)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  async function handleAdd() {
    if (!newSku.trim()) return
    setAdding(true)
    setError(null)
    try {
      await fetch(`${BASE_URL}/api/banned-skus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: newSku.trim().toUpperCase(), reason: newReason.trim() || 'Banned item' }),
      })
      setNewSku('')
      setNewReason('')
      BANNED_CACHE.ts = 0
      await loadAll(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(sku) {
    setDeleting(d => ({ ...d, [sku]: true }))
    try {
      await fetch(`${BASE_URL}/api/banned-skus/${sku}`, { method: 'DELETE' })
      BANNED_CACHE.ts = 0
      await loadAll(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setDeleting(d => ({ ...d, [sku]: false }))
    }
  }

  async function handleExport() {
    setDownloading(true)
    try {
      const resp = await fetch(`${BASE_URL}/api/banned-skus/export`)
      const blob = await resp.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `banned_skus_live_${new Date().toISOString().slice(0,10)}.csv`
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch (e) {
      setError(e.message)
    } finally {
      setDownloading(false)
    }
  }

  const filteredBanned = banned.filter(b =>
    !search || b.sku.toLowerCase().includes(search.toLowerCase()) ||
    (b.reason || '').toLowerCase().includes(search.toLowerCase())
  )

  const filteredLive = live.filter(b =>
    !search || b.sku.toLowerCase().includes(search.toLowerCase()) ||
    (b.store_name || '').toLowerCase().includes(search.toLowerCase())
  )

  const affectedStores = [...new Set(live.map(l => l.store_name))]

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="flex items-center gap-2">
          <ShieldAlert size={18} className="text-red-500" />
          <h2 className="text-lg font-bold text-foreground">Banned SKUs</h2>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => loadAll(true)} disabled={loading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={handleExport} disabled={downloading || live.length === 0}
            className="flex items-center gap-1.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
            <Download size={11} />
            {downloading ? 'Downloading…' : 'Export Live'}
          </button>
        </div>
      </div>

      {/* Alert banner if any are live */}
      {!loading && live.length > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-300 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700">
              {live.length} banned SKU{live.length > 1 ? 's' : ''} currently live on eBay
            </p>
            <p className="text-xs text-red-500 mt-0.5">
              Affected stores: {affectedStores.join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium">Total Banned SKUs</CardDescription>
            <div className="text-3xl font-bold">{loading ? '…' : fmt(banned.length)}</div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">SKUs in banned list</p>
          </CardContent>
        </Card>
        <Card className={!loading && live.length > 0 ? 'border-red-300 bg-red-50/30' : 'border-green-300 bg-green-50/30'}>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium">Currently Live on eBay</CardDescription>
            <div className={`text-3xl font-bold ${!loading && live.length > 0 ? 'text-red-500' : 'text-green-600'}`}>
              {loading ? '…' : fmt(live.length)}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className={`flex items-center gap-1 text-xs ${!loading && live.length > 0 ? 'text-red-500' : 'text-green-600'}`}>
              {loading
                ? <span className="text-muted-foreground">Checking…</span>
                : live.length > 0
                  ? <><AlertTriangle size={10} /> Needs immediate removal</>
                  : <><ShieldCheck size={10} /> All clear</>
              }
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium">Stores Affected</CardDescription>
            <div className="text-3xl font-bold">
              {loading ? '…' : affectedStores.length}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              {loading ? 'Checking…' : affectedStores.length > 0 ? affectedStores.slice(0,2).join(', ') + (affectedStores.length > 2 ? ` +${affectedStores.length - 2}` : '') : 'No stores affected'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Add new banned SKU */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Add Banned SKU</CardTitle>
          <CardDescription className="text-xs">Add a SKU that should never appear on eBay stores</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <input
              type="text"
              value={newSku}
              onChange={e => setNewSku(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="e.g. A5780739677"
              className="flex-1 px-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring font-mono"
            />
            <input
              type="text"
              value={newReason}
              onChange={e => setNewReason(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Reason (optional)"
              className="flex-1 px-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button onClick={handleAdd} disabled={adding || !newSku.trim()}
              className="flex items-center gap-1.5 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg px-4 py-1.5 transition-colors disabled:opacity-50 font-medium">
              <Plus size={13} />
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        </CardContent>
      </Card>

      {/* Search + Tabs */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search SKU or store…"
            className="w-full pl-8 pr-8 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={12} /></button>}
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button onClick={() => setTab('live')}
            className={`px-4 py-1.5 text-xs font-medium transition-colors ${tab === 'live' ? 'bg-red-500 text-white' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
            Live on eBay {!loading && live.length > 0 && <span className="ml-1 bg-white/20 px-1 rounded">{live.length}</span>}
          </button>
          <button onClick={() => setTab('all')}
            className={`px-4 py-1.5 text-xs font-medium transition-colors ${tab === 'all' ? 'bg-foreground text-background' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
            All Banned ({loading ? '…' : banned.length})
          </button>
        </div>
      </div>

      {/* Live on eBay table */}
      {tab === 'live' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              {loading
                ? 'Checking eBay…'
                : live.length > 0
                  ? <><AlertTriangle size={14} className="text-red-500" /> Banned SKUs Currently Live</>
                  : <><ShieldCheck size={14} className="text-green-600" /> No Banned SKUs Live</>
              }
            </CardTitle>
            <CardDescription className="text-xs">
              {loading
                ? 'Fetching live listings…'
                : live.length > 0
                  ? `${live.length} banned SKU${live.length > 1 ? 's' : ''} found on eBay — remove immediately`
                  : 'All banned SKUs are off eBay'
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-10 text-center">
                <div className="inline-block w-6 h-6 border-2 border-red-300 border-t-red-500 rounded-full animate-spin mb-3" />
                <p className="text-sm text-muted-foreground">Checking eBay listings…</p>
              </div>
            ) : filteredLive.length === 0 ? (
              <div className="p-10 text-center">
                <ShieldCheck size={28} className="text-green-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground font-medium">
                  {search ? 'No results match your search' : 'No banned SKUs are live on eBay'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Store</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">SKU</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Item ID</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Price</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Qty</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Reason</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Snapshot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLive.map((row, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-red-50/30 transition-colors">
                        <td className="px-4 py-2.5 font-medium capitalize">{row.store_name}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-red-600 font-bold">{row.sku}</td>
                        <td className="px-4 py-2.5">
                          <a href={`https://www.ebay.com.au/itm/${row.item_id}`} target="_blank" rel="noreferrer"
                            className="text-blue-500 hover:underline font-mono text-xs">{row.item_id}</a>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">${Number(row.price || 0).toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${row.quantity > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                            {row.quantity}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.reason}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.snapshot_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* All banned SKUs table */}
      {tab === 'all' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">All Banned SKUs</CardTitle>
            <CardDescription className="text-xs">Full list of SKUs that should never appear on eBay</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-10 text-center">
                <div className="inline-block w-6 h-6 border-2 border-muted border-t-foreground rounded-full animate-spin mb-3" />
                <p className="text-sm text-muted-foreground">Loading banned SKUs…</p>
              </div>
            ) : filteredBanned.length === 0 ? (
              <div className="p-10 text-center">
                <ShieldCheck size={28} className="text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground font-medium">No banned SKUs found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">SKU</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Reason</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Added</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Added By</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBanned.map((row, i) => {
                      const isLive = live.some(l => l.sku === row.sku)
                      return (
                        <tr key={i} className={`border-b border-border/50 transition-colors ${isLive ? 'bg-red-50/40 hover:bg-red-50/60' : 'hover:bg-muted/30'}`}>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold">{row.sku}</span>
                              {isLive && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 uppercase tracking-wide animate-pulse">
                                  Live!
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.reason}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{timeAgo(row.added_at)}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.added_by}</td>
                          <td className="px-4 py-2.5 text-right">
                            <button onClick={() => handleDelete(row.sku)} disabled={deleting[row.sku]}
                              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors ml-auto disabled:opacity-50">
                              <Trash2 size={11} />
                              {deleting[row.sku] ? 'Removing…' : 'Remove'}
                            </button>
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
      )}
    </div>
  )
}