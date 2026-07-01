// src/pages/amazon/AmazonProductsTab.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../../lib/api'
import {
  ChevronLeft, ChevronRight, Download, Search, X, ExternalLink,
} from 'lucide-react'
import ProductEditPage from '../products/ProductEditPage'

const BASE_URL  = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const PAGE_SIZE = 50
const STALE_MS  = 30_000

// ─── Cache ────────────────────────────────────────────────────────────────────
const PAGE_CACHE  = new Map()
const STATS_CACHE = { data: null, ts: 0 }

function getPageKey(page, filters, sortBy, sortDir) {
  return JSON.stringify({ page, sortBy, sortDir, ...filters })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt    = n => Number(n || 0).toLocaleString()
const fmtAUD = n => `$${parseFloat(n || 0).toFixed(2)}`

function timeAgo(d) {
  if (!d) return '—'
  const diff  = Date.now() - new Date(d).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  < 1)  return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

// ─── Summary card ─────────────────────────────────────────────────────────────
function SummaryCard({ label, value, loading }) {
  return (
    <div className="flex-1 min-w-0 bg-gray-50 rounded-lg px-4 py-3">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      {loading
        ? <div className="h-7 w-20 bg-gray-200 rounded animate-pulse" />
        : <p className="text-xl font-medium text-gray-900">{value}</p>}
    </div>
  )
}

// ─── Badges ───────────────────────────────────────────────────────────────────
function StockBadge({ stock }) {
  return Number(stock) > 0
    ? <span className="px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 border border-green-100 whitespace-nowrap">In Stock</span>
    : <span className="px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-600 border border-red-100 whitespace-nowrap">Out of Stock</span>
}

function ActiveBadge({ active }) {
  return active
    ? <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-100 whitespace-nowrap">Active</span>
    : <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-400 border border-gray-200 whitespace-nowrap">Inactive</span>
}

function InvBadge({ status }) {
  const s = status != null ? String(status) : ''
  if (!s) return <span className="text-gray-300">—</span>
  const map = {
    active:       'bg-green-50 text-green-700 border-green-100',
    out_of_stock: 'bg-red-50 text-red-600 border-red-100',
    inactive:     'bg-gray-100 text-gray-400 border-gray-200',
  }
  const cls = map[s] || 'bg-gray-100 text-gray-500 border-gray-200'
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${cls}`}>
      {s.replace(/_/g, ' ')}
    </span>
  )
}

// ─── SortTh ───────────────────────────────────────────────────────────────────
function SortTh({ col, sortBy, sortDir, onSort, children }) {
  const active = sortBy === col
  return (
    <th
      onClick={() => onSort(col)}
      className="text-left px-4 py-3 text-xs text-gray-400 font-medium cursor-pointer select-none hover:text-gray-600 transition-colors"
    >
      <span className="flex items-center gap-1">
        {children}
        <span className="text-gray-300 text-[10px]">{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </span>
    </th>
  )
}

// ─── Filter bar ───────────────────────────────────────────────────────────────
function FilterBar({ filters, onChange, onClear, resultCount, totalCount, onExport, exporting }) {
  const hasFilters = filters.search || filters.stock || filters.isActive !== '' || filters.invStatus || filters.notOnEbay

  return (
    <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-gray-100">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={filters.search}
          onChange={e => onChange('search', e.target.value)}
          placeholder="Search SKU / title…"
          className="w-full pl-8 pr-8 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-200 placeholder:text-gray-300 transition-all"
        />
        {filters.search && (
          <button onClick={() => onChange('search', '')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={11} />
          </button>
        )}
      </div>

      <select value={filters.stock} onChange={e => onChange('stock', e.target.value)}
        className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none appearance-none cursor-pointer text-gray-600">
        <option value="">All Stock</option>
        <option value="in">In Stock</option>
        <option value="out">Out of Stock</option>
      </select>

      <select value={filters.isActive} onChange={e => onChange('isActive', e.target.value)}
        className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none appearance-none cursor-pointer text-gray-600">
        <option value="">All Status</option>
        <option value="1">Active Only</option>
        <option value="0">Inactive Only</option>
      </select>

      <select value={filters.invStatus} onChange={e => onChange('invStatus', e.target.value)}
        className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none appearance-none cursor-pointer text-gray-600">
        <option value="">All Inv. Status</option>
        <option value="active">active</option>
        <option value="out_of_stock">out_of_stock</option>
        <option value="inactive">inactive</option>
      </select>

      <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-gray-600">
        <input
          type="checkbox"
          checked={filters.notOnEbay}
          onChange={e => onChange('notOnEbay', e.target.checked)}
          className="rounded border-gray-300 text-red-500 focus:ring-red-200"
        />
        Not on eBay
      </label>

      {hasFilters && (
        <>
          <button onClick={onClear} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
            <X size={11} /> Clear
          </button>
          <span className="text-xs text-gray-400">{fmt(resultCount)} of {fmt(totalCount)}</span>
        </>
      )}

      <div className="ml-auto">
        <button onClick={onExport} disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors">
          <Download size={13} />{exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>
    </div>
  )
}

// ─── Product row ──────────────────────────────────────────────────────────────
const ProductRow = React.memo(function ProductRow({ p, onEdit }) {
  return (
    <tr
      onClick={() => onEdit(p)}
      className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors last:border-none cursor-pointer"
    >
      <td className="px-3 py-2.5">
        {p.image_url
          ? <img src={p.image_url} alt="" className="w-9 h-9 rounded-lg object-cover bg-gray-100" loading="lazy" />
          : <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-[9px] text-gray-300 font-bold">IMG</div>}
      </td>
      <td className="px-4 py-2.5">
        <p className="font-medium text-gray-900 truncate leading-snug">{p.title || '—'}</p>
        {p.manufacturer && <p className="text-gray-400 text-[10px] mt-0.5 truncate">{p.manufacturer}</p>}
      </td>
      <td className="px-4 py-2.5">
        <a
          href={`https://www.amazon.com.au/dp/${p.sku}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="font-mono text-[10px] text-blue-500 hover:underline flex items-center gap-1 truncate"
        >
          {p.sku}
          <ExternalLink size={9} className="flex-shrink-0" />
        </a>
      </td>
      <td className="px-4 py-2.5 font-semibold text-gray-900">{fmtAUD(p.price)}</td>
      <td className="px-4 py-2.5 text-gray-600">{p.stock ?? '—'}</td>
      <td className="px-4 py-2.5"><InvBadge status={p.inventory_status} /></td>
      <td className="px-4 py-2.5 text-gray-400">
        {p.oos_since
          ? <span className="text-orange-400 font-medium">{timeAgo(p.oos_since)}</span>
          : <span className="text-gray-200">—</span>}
      </td>
      <td className="px-4 py-2.5 text-gray-400">{timeAgo(p.updated_at)}</td>
      <td className="px-4 py-2.5">
        <div className="flex flex-col gap-1">
          <StockBadge stock={p.stock} />
          <ActiveBadge active={!!p.is_active} />
        </div>
      </td>
    </tr>
  )
})

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AmazonProductsTab() {
  const [products,     setProducts]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [page,         setPage]         = useState(0)
  const [totalCount,   setTotalCount]   = useState(0)
  const [exporting,    setExporting]    = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)  // full product object
  const [suppliers,    setSuppliers]    = useState({})
  const [categories,   setCategories]   = useState([])

  const [stats, setStats] = useState({
    total: 0, inStock: 0, outOfStock: 0, active: 0, notOnEbay: 0,
  })

  const [filters, setFilters] = useState({
    search: '', stock: '', isActive: '', invStatus: '', notOnEbay: false,
  })
  const [appliedFilters, setAppliedFilters] = useState({
    search: '', stock: '', isActive: '', invStatus: '', notOnEbay: false,
  })

  const [sortBy,  setSortBy]  = useState('updated_at')
  const [sortDir, setSortDir] = useState('desc')

  const searchTimer = useRef(null)

  // Load meta for ProductEditPage
  useEffect(() => {
    async function loadMeta() {
      const [supps, cats] = await Promise.all([
        api.get('/api/suppliers'),
        api.get('/api/products/categories'),
      ])
      const suppMap = {}
      supps?.forEach(s => { suppMap[s.supplier_id] = s })
      setSuppliers(suppMap)
      setCategories(Array.isArray(cats) ? cats : [])
    }
    loadMeta()
  }, [])

  function handleFilterChange(key, val) {
    const next = { ...filters, [key]: val }
    setFilters(next)
    if (key === 'search') {
      clearTimeout(searchTimer.current)
      searchTimer.current = setTimeout(() => {
        setPage(0)
        setAppliedFilters(next)
      }, 350)
    } else {
      setPage(0)
      setAppliedFilters(next)
    }
  }

  function clearFilters() {
    const empty = { search: '', stock: '', isActive: '', invStatus: '', notOnEbay: false }
    setFilters(empty)
    setAppliedFilters(empty)
    setPage(0)
  }

  // Build query string — keys must exactly match server buildAmazonWhere
  function buildQS(extra = {}) {
    const p = new URLSearchParams({
      page:  extra.page  ?? page,
      limit: extra.limit ?? PAGE_SIZE,
      sort:  sortBy,
      dir:   sortDir,
    })
    if (appliedFilters.search)              p.set('search',    appliedFilters.search)
    if (appliedFilters.stock)               p.set('stock',     appliedFilters.stock)
    if (appliedFilters.isActive !== '')     p.set('isActive',  appliedFilters.isActive)
    if (appliedFilters.invStatus)           p.set('invStatus', appliedFilters.invStatus)
    if (appliedFilters.notOnEbay)           p.set('notOnEbay', '1')
    return p.toString()
  }

  // ── Fetch page ──────────────────────────────────────────────────────────
  const fetchPage = useCallback(async () => {
    const cacheKey = getPageKey(page, appliedFilters, sortBy, sortDir)
    const cached   = PAGE_CACHE.get(cacheKey)

    if (cached) {
      setProducts(cached.data)
      setTotalCount(cached.count)
      setLoading(false)
      if (Date.now() - cached.ts < STALE_MS) return
    } else {
      setLoading(true)
    }

    try {
      const res = await api.get(`/api/amazon-products?${buildQS()}`)
      if (res?.data) {
        setProducts(res.data)
        setTotalCount(res.count || 0)
        PAGE_CACHE.set(cacheKey, { data: res.data, count: res.count || 0, ts: Date.now() })
      }
    } catch (e) {
      console.error('AmazonProductsTab fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [page, appliedFilters, sortBy, sortDir])

  // ── Fetch stats ─────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    if (STATS_CACHE.data && Date.now() - STATS_CACHE.ts < STALE_MS) {
      setStats(STATS_CACHE.data)
      setStatsLoading(false)
      return
    }
    try {
      const res = await api.get('/api/amazon-products/stats')
      if (res) {
        setStats(res)
        STATS_CACHE.data = res
        STATS_CACHE.ts   = Date.now()
      }
    } catch (e) {
      console.error('AmazonProductsTab stats error:', e)
    } finally {
      setStatsLoading(false)
    }
  }, [])

  useEffect(() => { fetchPage()  }, [fetchPage])
  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => { setPage(0)   }, [sortBy, sortDir])

  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const qs   = buildQS({ page: 0, limit: 999999 })
      const resp = await fetch(`${BASE_URL}/api/amazon-products/export?${qs}`)
      if (!resp.ok) throw new Error(resp.status)
      const blob = await resp.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `amazon_products_${new Date().toISOString().slice(0,10)}.csv`
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Export failed:', e)
    } finally {
      setExporting(false)
    }
  }

  const pageCount = Math.ceil(totalCount / PAGE_SIZE)

  // ── Edit page — map autods_products row to product shape ProductEditPage expects ──
  if (editingProduct) {
    // autods_products uses `sku` as the product_id equivalent
    // ProductEditPage fetches by product_id from /api/products/:id
    // so we look up the matching product by SKU from the products table
    return (
      <AmazonEditPage
        product={editingProduct}
        suppliers={suppliers}
        categories={categories}
        onBack={() => setEditingProduct(null)}
        onSaved={() => {
          PAGE_CACHE.clear()
          setEditingProduct(null)
          fetchPage()
        }}
      />
    )
  }

  return (
    <div>
      <FilterBar
        filters={filters}
        onChange={handleFilterChange}
        onClear={clearFilters}
        resultCount={totalCount}
        totalCount={stats.total}
        onExport={handleExport}
        exporting={exporting}
      />

      <div className="p-5">
        {/* Summary cards */}
        <div className="flex gap-3 mb-5">
          <SummaryCard label="Total products"  value={fmt(stats.total)}      loading={statsLoading} />
          <SummaryCard label="In stock"         value={fmt(stats.inStock)}    loading={statsLoading} />
          <SummaryCard label="Out of stock"     value={fmt(stats.outOfStock)} loading={statsLoading} />
          <SummaryCard label="Active in AutoDS" value={fmt(stats.active)}     loading={statsLoading} />
          <SummaryCard label="Not on eBay"      value={fmt(stats.notOnEbay)}  loading={statsLoading} />
        </div>

        {/* Table */}
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-xs table-fixed">
            <colgroup>
              <col style={{ width: '52px' }} />
              <col style={{ width: '28%'  }} />
              <col style={{ width: '13%'  }} />
              <col style={{ width: '8%'   }} />
              <col style={{ width: '6%'   }} />
              <col style={{ width: '11%'  }} />
              <col style={{ width: '10%'  }} />
              <col style={{ width: '10%'  }} />
              <col style={{ width: '10%'  }} />
            </colgroup>
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-3 py-3" />
                <SortTh col="title"      sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Title</SortTh>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">SKU / ASIN</th>
                <SortTh col="price"      sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Price</SortTh>
                <SortTh col="stock"      sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Stock</SortTh>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Inv. Status</th>
                <SortTh col="oos_since"  sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>OOS Since</SortTh>
                <SortTh col="updated_at" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>Updated</SortTh>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 12 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="px-3 py-2.5"><div className="w-9 h-9 rounded-lg bg-gray-100 animate-pulse" /></td>
                      <td className="px-4 py-2.5"><div className="h-3 bg-gray-100 rounded animate-pulse w-4/5 mb-1.5" /><div className="h-2.5 bg-gray-50 rounded animate-pulse w-2/5" /></td>
                      <td className="px-4 py-2.5"><div className="h-3 bg-gray-100 rounded animate-pulse w-4/5" /></td>
                      <td className="px-4 py-2.5"><div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                      <td className="px-4 py-2.5"><div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" /></td>
                      <td className="px-4 py-2.5"><div className="h-5 bg-gray-100 rounded-full animate-pulse" /></td>
                      <td className="px-4 py-2.5"><div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                      <td className="px-4 py-2.5"><div className="h-3 bg-gray-100 rounded animate-pulse w-4/5" /></td>
                      <td className="px-4 py-2.5"><div className="h-5 bg-gray-100 rounded-full animate-pulse" /></td>
                    </tr>
                  ))
                : products.length === 0
                ? <tr><td colSpan={9} className="px-4 py-16 text-center text-gray-300">No products found.</td></tr>
                : products.map(p => (
                    <ProductRow key={p.id} p={p} onEdit={setEditingProduct} />
                  ))
              }
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Showing {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, totalCount).toLocaleString()} of {totalCount.toLocaleString()} products
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(0)} disabled={page === 0}
                className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 disabled:opacity-30">«</button>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 disabled:opacity-30">
                <ChevronLeft size={12} /> Prev
              </button>
              {Array.from({ length: Math.min(5, pageCount) }, (_, i) => {
                let pg
                if (pageCount <= 5)            pg = i
                else if (page < 3)             pg = i
                else if (page > pageCount - 4) pg = pageCount - 5 + i
                else                           pg = page - 2 + i
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
              <button onClick={() => setPage(pageCount - 1)} disabled={page >= pageCount - 1}
                className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 disabled:opacity-30">»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── AmazonEditPage ───────────────────────────────────────────────────────────
// Looks up the product_id from the products table by SKU, then renders ProductEditPage.
// Falls back to a read-only view if no matching product row exists.
function AmazonEditPage({ product, suppliers, categories, onBack, onSaved }) {
  const [productId, setProductId] = useState(null)
  const [notFound,  setNotFound]  = useState(false)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    async function lookup() {
      try {
        // Try to find the product in the products table by SKU
        const res = await api.get(`/api/products?search=${encodeURIComponent(product.sku)}&limit=5`)
        const match = res?.data?.find(p =>
          p.sku === product.sku ||
          p.sku === `A${product.sku}` ||
          p.sku?.replace(/^A/, '') === product.sku
        )
        if (match) {
          setProductId(match.product_id)
        } else {
          setNotFound(true)
        }
      } catch (e) {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    lookup()
  }, [product.sku])

  if (loading) {
    return (
      <div className="p-8 space-y-4 animate-pulse">
        <div className="h-4 w-32 bg-gray-100 rounded" />
        <div className="h-64 bg-gray-50 rounded-xl" />
      </div>
    )
  }

  if (productId) {
    return (
      <ProductEditPage
        productId={productId}
        suppliers={suppliers}
        categories={categories}
        onBack={onBack}
        onSaved={onSaved}
      />
    )
  }

  // ── Read-only fallback when no products table row exists ──
  return (
    <div className="p-6 max-w-3xl">
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 mb-6 transition-colors">
        <ChevronLeft size={14} /> Back to Amazon Products
      </button>

      <div className="border border-gray-100 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex gap-5 p-6 border-b border-gray-100">
          {product.image_url
            ? <img src={product.image_url} alt="" className="w-24 h-24 rounded-xl object-cover bg-gray-100 flex-shrink-0" />
            : <div className="w-24 h-24 rounded-xl bg-gray-100 flex-shrink-0" />}
          <div className="min-w-0">
            <p className="text-xs text-gray-400 mb-1 font-mono">{product.sku}</p>
            <h2 className="text-lg font-semibold text-gray-900 leading-snug mb-1">{product.title || '—'}</h2>
            {product.manufacturer && <p className="text-sm text-gray-400">{product.manufacturer}</p>}
            <div className="flex gap-2 mt-3">
              <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500 border border-gray-200">
                AutoDS ID: {product.autods_id || '—'}
              </span>
              <a
                href={`https://www.amazon.com.au/dp/${product.sku}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 transition-colors flex items-center gap-1"
              >
                View on Amazon <ExternalLink size={9} />
              </a>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y divide-gray-100">
          {[
            { label: 'Price',            val: `$${parseFloat(product.price || 0).toFixed(2)}` },
            { label: 'Stock',            val: product.stock ?? '—' },
            { label: 'Inv. Status',      val: product.inventory_status || '—' },
            { label: 'Is Active',        val: product.is_active ? 'Yes' : 'No' },
            { label: 'OOS Since',        val: product.oos_since ? new Date(product.oos_since).toLocaleDateString() : '—' },
            { label: 'Last Updated',     val: product.updated_at ? new Date(product.updated_at).toLocaleString() : '—' },
            { label: 'Last Seen',        val: product.last_seen_at ? new Date(product.last_seen_at).toLocaleString() : '—' },
            { label: 'Variations',       val: product.amount_of_variations ?? '—' },
          ].map(({ label, val }) => (
            <div key={label} className="px-5 py-4">
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1">{label}</p>
              <p className="text-sm font-medium text-gray-900">{String(val)}</p>
            </div>
          ))}
        </div>

        {/* Description */}
        {product.description && (
          <div className="p-6 border-t border-gray-100">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-3">Description</p>
            <div
              className="text-xs text-gray-600 leading-relaxed prose prose-xs max-w-none"
              dangerouslySetInnerHTML={{ __html: product.description }}
            />
          </div>
        )}

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-400">
            This product exists in AutoDS but has no matching row in the Products catalog table.
            It cannot be edited here — add it to the Products table first.
          </p>
        </div>
      </div>
    </div>
  )
}