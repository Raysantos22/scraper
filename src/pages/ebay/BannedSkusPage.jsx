// C:\Users\ADMIN\scraper\src\pages\ebay\BannedSkusPage.jsx
import React, { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import {
  AlertTriangle, Plus, Trash2, Download, RefreshCw,
  ArrowLeft, ShieldAlert, ShieldCheck, Search, X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const fmt = n => Number(n || 0).toLocaleString()

// Global cache — persists across navigation, never resets unless forced
const CACHE = { banned: null, live: null, ts: 0 }
const STALE_MS = 120_000 // 2 minutes

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
  const [banned,      setBanned]      = useState(CACHE.banned || [])
  const [live,        setLive]        = useState(CACHE.live   || [])
  const [loading,     setLoading]     = useState(!CACHE.banned)
  const [search,      setSearch]      = useState(initialStore || '')
  const [newSku,      setNewSku]      = useState('')
  const [newReason,   setNewReason]   = useState('')
  const [adding,      setAdding]      = useState(false)
  const [deleting,    setDeleting]    = useState({})
  const [error,       setError]       = useState(null)
  const [tab,         setTab]         = useState('live')
  const [downloading, setDownloading] = useState(false)

  async function loadAll(force = false) {
    if (!force && CACHE.banned && Date.now() - CACHE.ts < STALE_MS) return
    if (!CACHE.banned) setLoading(true)
    setError(null)
    try {
      const data = await api.get('/api/banned-skus/combined')
      if (data) {
        CACHE.banned = data.banned
        CACHE.live   = data.live
        CACHE.ts     = Date.now()
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
      CACHE.ts = 0
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
      CACHE.ts = 0
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
    !search ||
    b.sku.toLowerCase().includes(search.toLowerCase()) ||
    (b.reason || '').toLowerCase().includes(search.toLowerCase())
  )

  const filteredLive = live.filter(b =>
    !search ||
    (b.sku        || '').toLowerCase().includes(search.toLowerCase()) ||
    (b.store_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (b.origin_sku || '').toLowerCase().includes(search.toLowerCase()) ||
    (b.autods_id  || '').toLowerCase().includes(search.toLowerCase()) ||
    (b.item_id    || '').toLowerCase().includes(search.toLowerCase())
  )

  const affectedStores = [...new Set(live.map(l => l.store_name))]

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="flex items-center gap-2">
          <ShieldAlert size={16} className="text-red-500" />
          <h2 className="text-base font-bold">Banned SKUs</h2>
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

      {/* Alert banner */}
      {!loading && live.length > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-300 rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="text-red-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700">
              {live.length} banned SKU{live.length > 1 ? 's' : ''} currently live on eBay
            </p>
            <p className="text-xs text-red-500 mt-0.5">Affected: {affectedStores.join(', ')}</p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs">Total Banned SKUs</CardDescription>
            <div className="text-2xl font-bold">{loading ? '…' : fmt(banned.length)}</div>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-3">
            <p className="text-xs text-muted-foreground">SKUs in banned list</p>
          </CardContent>
        </Card>
        <Card className={!loading && live.length > 0 ? 'border-red-300 bg-red-50/30' : 'border-green-300 bg-green-50/30'}>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs">Currently Live on eBay</CardDescription>
            <div className={`text-2xl font-bold ${!loading && live.length > 0 ? 'text-red-500' : 'text-green-600'}`}>
              {loading ? '…' : fmt(live.length)}
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-3">
            <div className={`flex items-center gap-1 text-xs ${!loading && live.length > 0 ? 'text-red-500' : 'text-green-600'}`}>
              {loading ? <span className="text-muted-foreground">Checking…</span>
                : live.length > 0
                  ? <><AlertTriangle size={10} /> Needs immediate removal</>
                  : <><ShieldCheck size={10} /> All clear</>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs">Stores Affected</CardDescription>
            <div className="text-2xl font-bold">{loading ? '…' : affectedStores.length}</div>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-3">
            <p className="text-xs text-muted-foreground truncate">
              {loading ? 'Checking…'
                : affectedStores.length > 0
                  ? affectedStores.slice(0,2).join(', ') + (affectedStores.length > 2 ? ` +${affectedStores.length - 2}` : '')
                  : 'No stores affected'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Add SKU */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <p className="text-xs font-semibold mb-2">Add Banned SKU</p>
          <div className="flex gap-2">
            <input type="text" value={newSku} onChange={e => setNewSku(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Any SKU format — eBay SKU, Origin SKU, AutoDS ID…"
              className="flex-1 px-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring font-mono" />
            <input type="text" value={newReason} onChange={e => setNewReason(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Reason (optional)"
              className="w-48 px-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring" />
            <button onClick={handleAdd} disabled={adding || !newSku.trim()}
              className="flex items-center gap-1.5 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg px-4 py-1.5 transition-colors disabled:opacity-50 font-medium whitespace-nowrap">
              <Plus size={13} />{adding ? 'Adding…' : 'Add'}
            </button>
          </div>
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        </CardContent>
      </Card>

      {/* Search + Tabs */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search SKU, store, origin SKU, AutoDS ID…"
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

      {/* Live table */}
      {tab === 'live' && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              {live.length > 0
                ? <><AlertTriangle size={13} className="text-red-500" /> Banned SKUs Currently Live</>
                : <><ShieldCheck size={13} className="text-green-600" /> No Banned SKUs Live</>}
            </CardTitle>
            <CardDescription className="text-xs">
              {live.length > 0
                ? `${live.length} found on eBay — remove immediately`
                : 'All banned SKUs are off eBay'}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-10 text-center">
                <div className="inline-block w-5 h-5 border-2 border-red-300 border-t-red-500 rounded-full animate-spin mb-2" />
                <p className="text-xs text-muted-foreground">Loading…</p>
              </div>
            ) : filteredLive.length === 0 ? (
              <div className="p-10 text-center">
                <ShieldCheck size={24} className="text-green-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{search ? 'No results match' : 'No banned SKUs live'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {['Store','eBay SKU','Origin SKU','AutoDS ID','Item ID','Price','Qty','Reason','Added'].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLive.map((row, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-red-50/30 transition-colors">
                        <td className="px-3 py-2 font-medium capitalize whitespace-nowrap">{row.store_name}</td>
                        <td className="px-3 py-2 font-mono text-red-600 font-bold whitespace-nowrap">{row.sku}</td>
                        <td className="px-3 py-2 font-mono text-gray-500 whitespace-nowrap">{row.origin_sku || '—'}</td>
                        <td className="px-3 py-2 font-mono text-gray-500 whitespace-nowrap">{row.autods_id || '—'}</td>
                        <td className="px-3 py-2">
                          <a href={`https://www.ebay.com.au/itm/${row.item_id}`} target="_blank" rel="noreferrer"
                            className="text-blue-500 hover:underline font-mono">{row.item_id}</a>
                        </td>
                        <td className="px-3 py-2 tabular-nums">${Number(row.price || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded font-medium ${row.quantity > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                            {row.quantity}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{row.reason}</td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{timeAgo(row.added_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* All banned table */}
      {tab === 'all' && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">All Banned SKUs</CardTitle>
            <CardDescription className="text-xs">Full list of SKUs blocked from eBay</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-10 text-center">
                <div className="inline-block w-5 h-5 border-2 border-muted border-t-foreground rounded-full animate-spin mb-2" />
                <p className="text-xs text-muted-foreground">Loading…</p>
              </div>
            ) : filteredBanned.length === 0 ? (
              <div className="p-10 text-center">
                <ShieldCheck size={24} className="text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No banned SKUs found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {['SKU','Reason','Added','Added By',''].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBanned.map((row, i) => {
                      const isLive = live.some(l => l.sku === row.sku)
                      return (
                        <tr key={i} className={`border-b border-border/50 transition-colors ${isLive ? 'bg-red-50/40 hover:bg-red-50/60' : 'hover:bg-muted/30'}`}>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold">{row.sku}</span>
                              {isLive && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 uppercase animate-pulse">Live!</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{row.reason}</td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{timeAgo(row.added_at)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{row.added_by}</td>
                          <td className="px-3 py-2 text-right">
                            <button onClick={() => handleDelete(row.sku)} disabled={deleting[row.sku]}
                              className="flex items-center gap-1 text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors ml-auto disabled:opacity-50">
                              <Trash2 size={11} />{deleting[row.sku] ? 'Removing…' : 'Remove'}
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