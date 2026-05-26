// StoreListingsPage.jsx — src/pages/ebay/StoreListingsPage.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react'
import { api } from '../../lib/api'
import {
  ArrowLeft, Search, X, SlidersHorizontal,
  ChevronLeft, ChevronRight, ExternalLink,
  Package, TrendingUp, AlertCircle, Hash,
} from 'lucide-react'

const PAGE_SIZE = 50
const fmt = n => Number(n || 0).toLocaleString()

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
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

function ListingsFilterBar({ search, onSearch, stockFilter, onStockFilter, resultCount, totalCount }) {
  const hasFilters = search || stockFilter
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input type="text" value={search} onChange={e => onSearch(e.target.value)}
          placeholder="Search SKU or item ID…"
          className="w-full pl-8 pr-8 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent placeholder:text-muted-foreground/60 transition-all"
        />
        {search && (
          <button onClick={() => onSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
            <X size={12} />
          </button>
        )}
      </div>
      <div className="relative">
        <SlidersHorizontal size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <select value={stockFilter} onChange={e => onStockFilter(e.target.value)}
          className="pl-8 pr-7 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer text-foreground transition-all">
          <option value="">All Stock</option>
          <option value="in">In Stock</option>
          <option value="out">Out of Stock</option>
          <option value="low">Low Stock (≤ 3)</option>
        </select>
      </div>
      <div className="flex items-center gap-2 ml-auto">
        {hasFilters && (
          <button onClick={() => { onSearch(''); onStockFilter('') }}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            <X size={11} /> Clear
          </button>
        )}
        {hasFilters && <span className="text-xs text-muted-foreground">{resultCount} of {totalCount}</span>}
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
      <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(listing.snapshot_date)}</td>
    </tr>
  )
})

export default function StoreListingsPage({ storeName, onBack }) {
  const [listings,    setListings]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [totalCount,  setTotalCount]  = useState(0)
  const [inStock,     setInStock]     = useState(0)
  const [outOfStock,  setOutOfStock]  = useState(0)
  const [page,        setPage]        = useState(0)
  const [search,      setSearch]      = useState('')
  const [stockFilter, setStockFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const allRows = []
      let pg = 0
      const LIMIT = 1000

      while (true) {
        const params = new URLSearchParams({
          store_name: storeName,
          page: pg,
          limit: LIMIT,
        })
        const res = await api.get(`/api/ebay/listings?${params}`)
        if (cancelled) return
        if (!res?.data?.length) break
        allRows.push(...res.data)
        if (allRows.length >= res.count) break
        pg++
      }

      if (cancelled) return
      setListings(allRows)
      setTotalCount(allRows.length)
      setInStock(allRows.filter(r => Number(r.quantity) > 0).length)
      setOutOfStock(allRows.filter(r => Number(r.quantity) === 0).length)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [storeName])

  const filtered = useMemo(() => {
    return listings.filter(r => {
      if (search) {
        const q = search.toLowerCase()
        if (!r.sku?.toLowerCase().includes(q) && !r.item_id?.toLowerCase().includes(q)) return false
      }
      if (stockFilter === 'in'  && Number(r.quantity) === 0) return false
      if (stockFilter === 'out' && Number(r.quantity) > 0)   return false
      if (stockFilter === 'low' && (Number(r.quantity) === 0 || Number(r.quantity) > 3)) return false
      return true
    })
  }, [listings, search, stockFilter])

  useEffect(() => { setPage(0) }, [search, stockFilter])

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const hasFilters = search || stockFilter

  return (
    <div>
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 flex-wrap">
        <button onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shrink-0">
          <ArrowLeft size={13} /> Back
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-bold text-gray-900 capitalize truncate">{storeName}</h2>
          <span className="text-xs text-gray-400 shrink-0">— eBay Listings</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!loading && listings.length > 0 && (
            <span className="text-[10px] text-gray-400 font-medium">
              Latest snapshot: {fmtDate(listings[0]?.snapshot_date)}
            </span>
          )}
        </div>
      </div>

      <div className="p-5 space-y-5">
        <div className="flex gap-3 flex-wrap">
          <StatCard label="Total Listings"  value={fmt(totalCount)} icon={Hash}       loading={loading} />
          <StatCard label="In Stock"        value={fmt(inStock)}    icon={TrendingUp}  loading={loading} />
          <StatCard label="Out of Stock"    value={fmt(outOfStock)} icon={AlertCircle} loading={loading} />
          <StatCard label="Showing"
            value={hasFilters ? `${fmt(filtered.length)} filtered` : fmt(totalCount)}
            icon={Package} loading={loading} />
        </div>

        {!loading && listings.length > 0 && (
          <ListingsFilterBar
            search={search} onSearch={setSearch}
            stockFilter={stockFilter} onStockFilter={setStockFilter}
            resultCount={filtered.length} totalCount={totalCount} loading={loading}
          />
        )}

        {loading ? (
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['SKU', 'Item ID', 'Price', 'Status', 'Snapshot'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-gray-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {[4, 3, 2, 5, 3].map((w, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className={`h-3 bg-gray-100 rounded animate-pulse w-${w}/5`} />
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
            <p className="text-sm text-muted-foreground font-medium">No listings found for {storeName}</p>
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Search size={32} className="text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground font-medium">No listings match your filters</p>
            <button onClick={() => { setSearch(''); setStockFilter('') }}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors">
              Clear filters
            </button>
          </div>
        ) : (
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-xs table-fixed">
              <colgroup>
                <col style={{ width: '30%' }} /><col style={{ width: '20%' }} />
                <col style={{ width: '12%' }} /><col style={{ width: '20%' }} />
                <col style={{ width: '18%' }} />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['SKU', 'Item ID', 'Price', 'Status', 'Snapshot'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-gray-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map(listing => <ListingRow key={listing.id} listing={listing} />)}
              </tbody>
            </table>
          </div>
        )}

        {pageCount > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Showing {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()} listings
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
                    className={`w-8 h-7 text-xs rounded-lg border transition-colors ${page === pg ? 'bg-red-600 text-white border-red-600 font-medium' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
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