// src/pages/priceRuns/PriceRunStoreList.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react'
import { api } from '../../lib/api'
import PriceRunViewerPage from './PriceRunViewerPage'
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, Search, RefreshCw, Clock, Store, PackageCheck, PackageX, Ban, Download } from 'lucide-react'

const FRESH_HOURS = 7
const STALE_HOURS = 13

// The CSV download is a plain <a href> (browser handles the
// Content-Disposition attachment itself), so it can't go through the
// api.get()/api.post() JSON wrapper — it needs the raw backend origin.
// If your lib/api.js already exports a base URL constant, swap this for
// that instead of hardcoding it here.
const OOS_EXPORT_BASE_URL = 'https://track.emega.com.au/scraper-api'

function getHealth(store) {
  if (!store.last_run_at) return 'never'
  const hoursSince = (Date.now() - new Date(store.last_run_at).getTime()) / 36e5
  if (store.last_run_status === 'failed') return 'red'
  if (hoursSince <= FRESH_HOURS) return 'green'
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
  remco:  { label: 'PA API',  bg: 'bg-red-200' },
  manual_scaper:  { label: 'Manual scraper',  bg: 'bg-red-300', text: 'text-white-100' },
}

function SourceBadge({ source }) {
  const s = SOURCE_STYLES[source] || { label: source || 'unknown', bg: 'bg-blue-200' }
  return (
    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  )
}

// Plain stat tile matching the "eBay Overview" style: label on top, big
// number, small subtitle underneath. `onClick` makes it act as a button
// (used for the Real Out-of-Stock tile) while staying inert for the rest.
function SummaryCard({ label, value, sub, valueClass = 'text-gray-900', onClick, disabled }) {
  const clickable = typeof onClick === 'function'
  return (
    <div
      onClick={clickable && !disabled ? onClick : undefined}
      className={`p-4 rounded-xl border border-border bg-card ${
        clickable && !disabled ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all' : ''
      } ${disabled ? 'opacity-70' : ''}`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-1.5 ${valueClass}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{sub}</p>}
    </div>
  )
}

function StoreCard({ store, onClick }) {
  const health = getHealth(store)
  const s = HEALTH_STYLES[health] || HEALTH_STYLES.never
  const Icon = s.icon
  const total = store.last_run_skus_total || 0
  const ok = store.last_run_skus_ok || 0
  const pct = total ? Math.round((ok / total) * 100) : null
  const barColor = health === 'red' ? 'bg-red-400' : (pct != null && pct <= 70) ? 'bg-amber-400' : 'bg-green-400'

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
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
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
  const [detailed, setDetailed] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingDetailed, setLoadingDetailed] = useState(true)
  const [selectedStore, setSelectedStore] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const [oosJob, setOosJob] = useState(null)
  const [showOosDetail, setShowOosDetail] = useState(false)
  const oosPollRef = useRef(null)

  function load() {
    setLoading(true)
    api.get('/api/price-runs-summary')
      .then(d => { setStores(d?.stores || []); setLoading(false) })
      .catch(() => { setStores([]); setLoading(false) })

    setLoadingDetailed(true)
    api.get('/api/price-runs-summary-detailed')
      .then(d => { setDetailed(d || null); setLoadingDetailed(false) })
      .catch(() => { setDetailed(null); setLoadingDetailed(false) })
  }

  useEffect(() => { load() }, [])
  useEffect(() => () => clearInterval(oosPollRef.current), [])

  function startOosScan() {
    clearInterval(oosPollRef.current)
    setShowOosDetail(false)
    setOosJob({ status: 'starting', total: 0, done: 0, results: [], fleet_persistent_oos_count: 0 })

    api.post('/api/price-runs-oos-scan?days=5', {}).then(d => {
      const jobId = d.job_id
      setOosJob(prev => ({ ...prev, job_id: jobId, status: 'running', total: d.total }))

      oosPollRef.current = setInterval(() => {
        api.get(`/api/price-runs-oos-scan/${jobId}`).then(job => {
          setOosJob(job)
          if (job.status === 'done') clearInterval(oosPollRef.current)
        }).catch(() => clearInterval(oosPollRef.current))
      }, 2000)
    })
  }

  // First click with no scan yet → kick one off. While it's running, the
  // tile just shows progress and clicks do nothing. Once done, clicking
  // again toggles the store-by-store breakdown open/closed.
  function handleOosCardClick() {
    if (!oosJob) { startOosScan(); return }
    if (oosJob.status === 'running' || oosJob.status === 'starting') return
    if (oosJob.status === 'done') setShowOosDetail(prev => !prev)
  }

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
    .sort((a, b) => {
      const order = { red: 0, never: 1, amber: 2, green: 3 }
      if (order[a._health] !== order[b._health]) return order[a._health] - order[b._health]
      return new Date(b.last_run_at || 0) - new Date(a.last_run_at || 0)
    })

  // IMPORTANT: every hook must run on every render, regardless of which
  // branch we're about to return from below. Keep all hooks (including this
  // useMemo) ABOVE the `if (selectedStore) return ...` early return, or
  // React throws "Rendered fewer hooks than expected" when selectedStore
  // toggles between renders.
  const oosSortedResults = useMemo(
    () => (oosJob?.results || []).slice().sort((a, b) => (b.persistent_oos_count || 0) - (a.persistent_oos_count || 0)),
    [oosJob]
  )

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

      {/* ── Overview row — plain stat tiles, matching the eBay Overview style ── */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Overview — all stores</p>

        {loadingDetailed ? (
          <p className="text-xs text-muted-foreground">Reading latest run data for all stores…</p>
        ) : !detailed ? (
          <p className="text-xs text-muted-foreground">Could not load summary.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <SummaryCard label="Stores" value={counts.all} sub="eBay stores tracked" />
            <SummaryCard
              label="Total Listings" value={detailed.total_skus.toLocaleString()}
              sub="All eBay store listings"
            />
            <SummaryCard
              label="In Stock" value={detailed.in_stock.toLocaleString()}
              sub={detailed.total_skus ? `${Math.round((detailed.in_stock / detailed.total_skus) * 100)}% currently in stock` : ''}
              valueClass="text-green-700"
            />
            <SummaryCard
              label="Out of Stock" value={detailed.out_of_stock.toLocaleString()}
              sub={detailed.total_skus ? `${Math.round((detailed.out_of_stock / detailed.total_skus) * 100)}% out of stock` : ''}
              valueClass="text-red-700"
            />
            <SummaryCard
              label="Failed" value={detailed.failed.toLocaleString()}
              sub={detailed.total_skus ? `${Math.round((detailed.failed / detailed.total_skus) * 100)}% failed to fetch` : ''}
              valueClass="text-red-700"
            />
            <SummaryCard
              label="Real Out-of-Stock (5d)"
              value={
                !oosJob ? '—'
                : (oosJob.status === 'running' || oosJob.status === 'starting') ? 'Scanning…'
                : oosJob.fleet_persistent_oos_count.toLocaleString()
              }
              sub={
                !oosJob
                  ? 'SKUs OOS in every price run over 5 days — click to scan'
                  : (oosJob.status === 'running' || oosJob.status === 'starting')
                    ? `Scanned ${oosJob.done}/${oosJob.total || '…'} stores`
                    : `Not a one-off blip — click to ${showOosDetail ? 'hide' : 'view'} store breakdown`
              }
              valueClass="text-red-700"
              onClick={handleOosCardClick}
              disabled={oosJob?.status === 'running' || oosJob?.status === 'starting'}
            />
          </div>
        )}
      </div>

      {/* ── Collapsible breakdown, shown only after a completed scan ── */}
      {showOosDetail && oosJob?.status === 'done' && (
        <div className="border border-red-200 bg-red-50/30 rounded-xl p-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                <Ban size={14} /> Real Out-of-Stock — store breakdown
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Click a store to open its run viewer and see the exact SKUs.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`${OOS_EXPORT_BASE_URL}/api/price-runs-oos-scan/${oosJob.job_id}/export`}
                className="px-3 py-1.5 text-xs rounded-lg border border-green-300 bg-white text-green-700 hover:bg-green-50 flex items-center gap-1"
              >
                <Download size={12} /> Download CSV
              </a>
              <button
                onClick={startOosScan}
                className="px-3 py-1.5 text-xs rounded-lg border border-red-300 bg-white hover:bg-red-50"
              >
                Re-scan
              </button>
            </div>
          </div>
          <div className="max-h-72 overflow-auto border border-border rounded-lg bg-white">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left px-3 py-1.5">Store</th>
                  <th className="text-right px-3 py-1.5">Runs Checked</th>
                  <th className="text-right px-3 py-1.5">SKUs Tracked</th>
                  <th className="text-right px-3 py-1.5">Persistent OOS</th>
                </tr>
              </thead>
              <tbody>
                {oosSortedResults.map(r => (
                  <tr
                    key={r.store_name}
                    className="border-t border-border hover:bg-muted/40 cursor-pointer"
                    onClick={() => setSelectedStore(r.store_name)}
                  >
                    <td className="px-3 py-1.5 capitalize">{r.store_name}</td>
                    <td className="px-3 py-1.5 text-right">{r.runs_checked}</td>
                    <td className="px-3 py-1.5 text-right">{r.skus_tracked?.toLocaleString() || 0}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-red-700">
                      {(r.persistent_oos_count || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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