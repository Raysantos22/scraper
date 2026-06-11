// StoreListingsPage.jsx — src/pages/ebay/StoreListingsPage.jsx
import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import {
  ArrowLeft, Search, X, SlidersHorizontal,
  ChevronLeft, ChevronRight, ExternalLink,
  Package, TrendingUp, AlertCircle, Hash,
} from 'lucide-react'

const PAGE_SIZE = 50
const STALE_MS  = 60_000 // 1 min cache
const fmt = n => Number(n || 0).toLocaleString()

// ─── Page cache (persists while app is open) ──────────────────────────────────
const PAGE_CACHE  = new Map()
const STATS_CACHE = new Map()

function getPageKey(store, page, search, stock) {
  return `${store}|${page}|${search}|${stock}`
}
function getStatsKey(store, search, stock) {
  return `${store}|${search}|${stock}`
}

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  const isDateOnly = d.length <= 10
  if (isDateOnly) return dt.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
  return dt.toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function QtyBadge({ qty }) {
  const q = Number(qty || 0)
  if (q === 0) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600 border border-red-100">Out of stock</span>
  )
  if (q <= 3) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-100">Low · {q}</span>
  )
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">In stock · {q}</span>
  )
}

function StatCard({ label, value, icon: Icon, loading }) {
  return (
    <div className="flex-1 min-w-0 bg-gray-50 rounded-xl px-4 py-3 flex items-center gap-3">
      {Icon && <Icon size={16} className="text-gray-300 shrink-0" />}
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-0.5">{label}</p>
        {loading
          ? <div className="h-6 w-20 bg-gray-200 rounded animate-pulse" />
          : <p className="text-xl font-semibold text-gray-900 leading-none">{value}</p>
        }
      </div>
    </div>
  )
}

const ListingRow = React.memo(function ListingRow({ listing }) {
  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors group">
      <td className="px-4 py-3">
        <p className="font-mono text-xs text-gray-700 truncate font-medium">{listing.sku}</p>
        {listing.group_sku && (
          <p className="font-mono text-[10px] text-gray-400 mt-0.5 truncate">Group: {listing.group_sku}</p>
        )}
      </td>
      <td className="px-4 py-3">
        <p className="font-mono text-xs text-gray-500 truncate">{listing.origin_sku || '—'}</p>
      </td>
      <td className="px-4 py-3">
        <p className="font-mono text-xs text-gray-500 truncate">{listing.autods_id || '—'}</p>
      </td>
      <td className="px-4 py-3">
        {listing.item_id ? (
          <a href={`https://www.ebay.com.au/itm/${listing.item_id}`} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-1 font-mono text-xs text-blue-600 hover:text-blue-700 hover:underline transition-colors">
            {listing.item_id}
            <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        ) : <span className="text-gray-300 text-xs">—</span>}
      </td>
      <td className="px-4 py-3">
        <span className="text-sm font-semibold text-gray-900">${parseFloat(listing.price || 0).toFixed(2)}</span>
      </td>
      <td className="px-4 py-3"><QtyBadge qty={listing.quantity} /></td>
      <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(listing.oos_since)}</td>
      <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(listing.scraped_at || listing.updated_at || listing.snapshot_date)}</td>
    </tr>
  )
})

export default function StoreListingsPage({ storeName, onBack }) {
  const [listings,     setListings]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [totalCount,   setTotalCount]   = useState(0)
  const [inStock,      setInStock]      = useState(0)
  const [outOfStock,   setOutOfStock]   = useState(0)
  const [snapshotDate, setSnapshotDate] = useState(null)
  const [page,         setPage]         = useState(0)
  const [stockFilter,  setStockFilter]  = useState('')
  const [searchInput,  setSearchInput]  = useState('')
  const [search,       setSearch]       = useState('')

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  // Reset page on filter change
  useEffect(() => { setPage(0) }, [search, stockFilter])

  // ── Fetch stats (total, inStock, outOfStock) with cache ───────────────────
  const fetchStats = useCallback(async () => {
    const key    = getStatsKey(storeName, search, stockFilter)
    const cached = STATS_CACHE.get(key)

    if (cached) {
      setTotalCount(cached.total)
      setInStock(cached.inStock)
      setOutOfStock(cached.outOfStock)
      setSnapshotDate(cached.snapshotDate)
      setStatsLoading(false)
      if (Date.now() - cached.ts < STALE_MS) return
    } else {
      setStatsLoading(true)
    }

    const params = new URLSearchParams({
      store_name: storeName,
      page: 0, limit: 1,
      ...(search      && { search }),
      ...(stockFilter && { stock: stockFilter }),
    })
    const [res, inRes, outRes] = await Promise.all([
      api.get(`/api/ebay/listings?${params}`),
      api.get(`/api/ebay/listings?store_name=${encodeURIComponent(storeName)}&stock=in&page=0&limit=1${search ? `&search=${encodeURIComponent(search)}` : ''}`),
      api.get(`/api/ebay/listings?store_name=${encodeURIComponent(storeName)}&stock=out&page=0&limit=1${search ? `&search=${encodeURIComponent(search)}` : ''}`),
    ])

    const total    = res?.count    || 0
    const inCount  = inRes?.count  || 0
    const outCount = outRes?.count || 0
    const snap = res?.data?.[0]?.scraped_at || res?.data?.[0]?.updated_at || res?.data?.[0]?.snapshot_date || null


    setTotalCount(total)
    setInStock(inCount)
    setOutOfStock(outCount)
    setSnapshotDate(snap)
    setStatsLoading(false)

    STATS_CACHE.set(key, { total, inStock: inCount, outOfStock: outCount, snapshotDate: snap, ts: Date.now() })
  }, [storeName, search, stockFilter])

  // ── Fetch current page with cache ─────────────────────────────────────────
  const fetchPage = useCallback(async () => {
    const key    = getPageKey(storeName, page, search, stockFilter)
    const cached = PAGE_CACHE.get(key)

    if (cached) {
      setListings(cached.data)
      setTotalCount(cached.count)
      setLoading(false)
      if (Date.now() - cached.ts < STALE_MS) return
    } else {
      setLoading(true)
    }

    const params = new URLSearchParams({
      store_name: storeName,
      page, limit: PAGE_SIZE,
      ...(search      && { search }),
      ...(stockFilter && { stock: stockFilter }),
    })
    const res = await api.get(`/api/ebay/listings?${params}`)
    if (res?.data) {
      setListings(res.data)
      setTotalCount(res.count || 0)
      PAGE_CACHE.set(key, { data: res.data, count: res.count || 0, ts: Date.now() })
    }
    setLoading(false)
  }, [storeName, page, search, stockFilter])

  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => { fetchPage()  }, [fetchPage])

  const pageCount  = Math.ceil(totalCount / PAGE_SIZE)
  const hasFilters = search || stockFilter

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 flex-wrap">
        <button onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shrink-0">
          <ArrowLeft size={13} /> Back
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-bold text-gray-900 capitalize truncate">{storeName}</h2>
          <span className="text-xs text-gray-400 shrink-0">— eBay Listings</span>
        </div>
        {snapshotDate && (
          <span className="ml-auto text-[10px] text-gray-400 font-medium">
            Latest snapshot: {fmtDate(snapshotDate)}
          </span>
        )}
      </div>

      <div className="p-5 space-y-5">
        {/* Stats */}
        <div className="flex gap-3 flex-wrap">
          <StatCard label="Total Listings"  value={fmt(totalCount)} icon={Hash}       loading={statsLoading} />
          <StatCard label="In Stock"        value={fmt(inStock)}    icon={TrendingUp}  loading={statsLoading} />
          <StatCard label="Out of Stock"    value={fmt(outOfStock)} icon={AlertCircle} loading={statsLoading} />
          <StatCard label="Page"            value={`${page + 1} / ${pageCount || 1}`} icon={Package} loading={false} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)}
              placeholder="Search SKU or item ID…"
              className="w-full pl-8 pr-8 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent placeholder:text-muted-foreground/60 transition-all"
            />
            {searchInput && (
              <button onClick={() => setSearchInput('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                <X size={12} />
              </button>
            )}
          </div>
          <div className="relative">
            <SlidersHorizontal size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <select value={stockFilter} onChange={e => setStockFilter(e.target.value)}
              className="pl-8 pr-7 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer text-foreground transition-all">
              <option value="">All Stock</option>
              <option value="in">In Stock</option>
              <option value="out">Out of Stock</option>
              <option value="low">Low Stock (≤ 3)</option>
            </select>
          </div>
          {hasFilters && (
            <button onClick={() => { setSearchInput(''); setStockFilter('') }}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors ml-auto">
              <X size={11} /> Clear
            </button>
          )}
          <span className="text-xs text-muted-foreground">{fmt(totalCount)} listings</span>
        </div>

        {/* Table */}
        {loading ? (
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['SKU', 'Origin SKU', 'AutoDS ID', 'Item ID', 'Price', 'Status', 'OOS Since', 'Snapshot'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-gray-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {[4, 3, 2, 5, 3].map((w, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: `${w * 15}%` }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Package size={32} className="text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground font-medium">
              {hasFilters ? 'No listings match your filters' : `No listings found for ${storeName}`}
            </p>
            {hasFilters && (
              <button onClick={() => { setSearchInput(''); setStockFilter('') }}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-xs table-fixed">
              <colgroup>
                <col style={{ width: '18%' }} /><col style={{ width: '12%' }} />
                <col style={{ width: '14%' }} /><col style={{ width: '14%' }} />
                <col style={{ width: '10%' }} /><col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} /><col style={{ width: '10%' }} />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['SKU', 'Origin SKU', 'AutoDS ID', 'Item ID', 'Price', 'Status', 'OOS Since', 'Snapshot'].map(h => (

                    <th key={h} className="text-left px-4 py-3 text-xs text-gray-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listings.map(listing => <ListingRow key={listing.id} listing={listing} />)}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Showing {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, totalCount).toLocaleString()} of {totalCount.toLocaleString()} listings
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(0)} disabled={page === 0} className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 disabled:opacity-30">«</button>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 disabled:opacity-30">
                <ChevronLeft size={12} /> Prev
              </button>
              {Array.from({ length: Math.min(5, pageCount) }, (_, i) => {
                let pg
                if (pageCount <= 5) pg = i
                else if (page < 3) pg = i
                else if (page > pageCount - 4) pg = pageCount - 5 + i
                else pg = page - 2 + i
                return (
                  <button key={pg} onClick={() => setPage(pg)}
                    className={`w-8 h-7 text-xs rounded-lg border transition-colors ${
                      page === pg ? 'bg-red-600 text-white border-red-600 font-medium' : 'border-gray-200 text-gray-400 hover:bg-gray-50'
                    }`}>
                    {pg + 1}
                  </button>
                )
              })}
              <button onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}
                className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 disabled:opacity-30">
                Next <ChevronRight size={12} />
              </button>
              <button onClick={() => setPage(pageCount - 1)} disabled={page >= pageCount - 1} className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 disabled:opacity-30">»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}