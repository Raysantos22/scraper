// src/pages/priceRuns/PriceRunStoreList.jsx
import React, { useState, useEffect, useMemo } from 'react'
import { api } from '../../lib/api'
import PriceRunViewerPage from './PriceRunViewerPage'
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, Search, RefreshCw, Clock } from 'lucide-react'

// Runs twice a day (~every 12h). Give it some slack before flagging.
// Runs 4x a day (~every 6h). Give it some slack before flagging.
const FRESH_HOURS = 7    // updated within this window -> green
const STALE_HOURS = 13   // beyond this with no run -> red (missed 2 cycles)

function getHealth(store) {
  if (!store.last_run_at) return 'never'
  const hoursSince = (Date.now() - new Date(store.last_run_at).getTime()) / 36e5
  if (store.last_run_status === 'failed') return 'red'
  if (hoursSince <= FRESH_HOURS) return store.last_run_status === 'partial' ? 'amber' : 'green'
  if (hoursSince <= STALE_HOURS) return 'amber'
  return 'red'
}

function fmtTimeAgo(dateStr) {
  if (!dateStr) return 'never run'
  const ms = Date.now() - new Date(dateStr).getTime()
  const hrs = ms / 36e5
  if (hrs < 1) return `${Math.max(1, Math.round(ms / 60000))}m ago`
  if (hrs < 24) return `${Math.round(hrs)}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

function fmtExactTime(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

const HEALTH_STYLES = {
  green: {
    border: 'border-green-200', bg: 'bg-green-50/60', dot: 'bg-green-500',
    text: 'text-green-700', badge: 'bg-green-100 text-green-700',
    icon: CheckCircle2, label: 'Updated today',
  },
  amber: {
    border: 'border-amber-200', bg: 'bg-amber-50/60', dot: 'bg-amber-500',
    text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700',
    icon: AlertTriangle, label: 'Running late',
  },
  red: {
    border: 'border-red-200', bg: 'bg-red-50/60', dot: 'bg-red-500',
    text: 'text-red-700', badge: 'bg-red-100 text-red-700',
    icon: XCircle, label: 'Not updating',
  },
  never: {
    border: 'border-gray-200', bg: 'bg-gray-50/60', dot: 'bg-gray-400',
    text: 'text-gray-500', badge: 'bg-gray-100 text-gray-600',
    icon: HelpCircle, label: 'No run history',
  },
}
const SOURCE_STYLES = {
  autods: { label: 'AutoDS', bg: 'bg-blue-100', text: 'text-blue-700' },
  remco:  { label: 'Remco',  bg: 'bg-purple-100', text: 'text-purple-700' },
}

function SourceBadge({ source }) {
  const s = SOURCE_STYLES[source] || { label: source || 'unknown', bg: 'bg-gray-100', text: 'text-gray-600' }
  return (
    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  )
}

function StoreCard({ store, onClick }) {
  const health = getHealth(store)
  const s = HEALTH_STYLES[health]
  const Icon = s.icon
  const total = store.last_run_skus_total || 0
  const ok = store.last_run_skus_ok || 0
  const pct = total ? Math.round((ok / total) * 100) : null

  return (
    <button
      onClick={onClick}
      className={`text-left p-4 rounded-xl border ${s.border} ${s.bg} hover:-translate-y-0.5 hover:shadow-md transition-all relative overflow-hidden`}
    >
      <span className={`absolute top-3 right-3 w-2 h-2 rounded-full ${s.dot}`} />

      <div className="flex items-center gap-1.5 pr-4">
        <p className="font-semibold text-sm capitalize truncate">{store.store_name}</p>
        <SourceBadge source={store.sync_source} />
      </div>



      <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${s.text}`}>
        <Icon size={12} />
        <span>{s.label}</span>
      </div>

      <div className="flex items-center gap-1 mt-2 text-[11px] text-muted-foreground">
        <Clock size={10} />
        <span>{fmtTimeAgo(store.last_run_at)}</span>
        {store.last_run_at && <span className="opacity-60">· {fmtExactTime(store.last_run_at)}</span>}
      </div>

      {total > 0 && (
        <div className="mt-2.5">
          <div className="h-1.5 rounded-full bg-black/5 overflow-hidden">
            <div
              className={`h-full rounded-full ${health === 'red' ? 'bg-red-400' : health === 'amber' ? 'bg-amber-400' : 'bg-green-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[11px] text-muted-foreground">
            <span>{ok.toLocaleString()}/{total.toLocaleString()} SKUs OK</span>
            <span>{pct}%</span>
          </div>
        </div>
      )}

      {store.last_run_duration_s != null && (
        <p className="mt-1.5 text-[10px] text-muted-foreground/70">
          took {Math.round(store.last_run_duration_s / 60)}m {store.last_run_duration_s % 60}s
        </p>
      )}

      {store.last_run_error && (
        <p className="mt-1.5 text-[10px] text-red-600 truncate" title={store.last_run_error}>
          {store.last_run_error}
        </p>
      )}
    </button>
  )
}

export default function PriceRunStoreList() {
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedStore, setSelectedStore] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // all | green | amber | red | never
  
  function load() {
    setLoading(true)
    api.get('/api/price-runs-summary').then(d => {
      setStores(d?.stores || [])
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  const withHealth = useMemo(
    () => stores.map(s => ({ ...s, _health: getHealth(s) })),
    [stores]
  )

  const counts = useMemo(() => ({
    all:   withHealth.length,
    green: withHealth.filter(s => s._health === 'green').length,
    amber: withHealth.filter(s => s._health === 'amber').length,
    red:   withHealth.filter(s => s._health === 'red').length,
    never: withHealth.filter(s => s._health === 'never').length,
  }), [withHealth])

  const filtered = withHealth
    .filter(s => filter === 'all' || s._health === filter)
    .filter(s => !search || s.store_name.toLowerCase().includes(search.toLowerCase()))
    // problem stores first — easiest to spot what needs attention
    .sort((a, b) => {
      const order = { red: 0, never: 1, amber: 2, green: 3 }
      if (order[a._health] !== order[b._health]) return order[a._health] - order[b._health]
      return new Date(b.last_run_at || 0) - new Date(a.last_run_at || 0)
    })

  if (selectedStore) {
    return <PriceRunViewerPage storeName={selectedStore} onBack={() => setSelectedStore(null)} />
  }

  const filterChip = (key, label, dotClass) => (
    <button
      onClick={() => setFilter(key)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
        filter === key ? 'bg-gray-900 text-white border-gray-900' : 'border-border text-muted-foreground hover:bg-muted/50'
      }`}
    >
      {dotClass && <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />}
      {label} <span className="opacity-60">{counts[key]}</span>
    </button>
  )

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold">Price/Stock Run Health</h2>
          <p className="text-xs text-muted-foreground">
            Runs 4x daily (every 6h) — green means updated within the last {FRESH_HOURS}h
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted/50 transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {filterChip('all', 'All')}
        {filterChip('green', 'Updated', 'bg-green-500')}
        {filterChip('amber', 'Running late', 'bg-amber-500')}
        {filterChip('red', 'Not updating', 'bg-red-500')}
        {filterChip('never', 'Never run', 'bg-gray-400')}

        <div className="relative ml-auto max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search store…"
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading store health…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No stores match this filter.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(s => (
            <StoreCard key={s.store_name} store={s} onClick={() => setSelectedStore(s.store_name)} />
          ))}
        </div>
      )}
    </div>
  )
}