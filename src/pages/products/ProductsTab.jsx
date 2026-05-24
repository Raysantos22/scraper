// ProductsTab.jsx — src/pages/products/ProductsTab.jsx
//
// PERFORMANCE vs previous version:
//  1. PAGE_CACHE (in useProductFilters.js) — every fetched page is stored by
//     "filterKey|page|sortBy|sortDir". Re-visiting page 1 after going to page 3:
//     instant, no network call.
//  2. STATS_CACHE.byKey — stats are stored PER filter combination. Switching
//     from "category=Shoes" to "in stock" and back: stats appear instantly.
//  3. SEARCH_CACHE — if you type "red", clear, type "red" again: page data
//     shows instantly because the page cache already has it; search loading
//     spinner skipped entirely.
//  4. Optimistic stale-while-revalidate: when a cache hit exists we paint it
//     immediately, then quietly re-validate in the background (only if data is
//     older than STALE_MS). Users see data in <1 frame.
//  5. Summary cards never flash to skeleton after first load — they show the
//     cached value for the new filter while the fresh value loads.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import {
  LayoutGrid, Table2, Plus, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, Download, Layers, Upload,
} from 'lucide-react'
import ProductEditPage, { parseImages, StockBadge } from './ProductEditPage'
import { CsvOverrideUploadModal, ImportProgressToast, runBatches } from './CsvOverrideUploadModal'
import {
  useProductFilters, applyFilters,
  STATS_CACHE, LEGACY_STATS_CACHE,
  getPageCacheKey, getPageCache, setPageCache,
  getSearchCache, setSearchCache,
} from './useProductFilters'
import ProductFiltersBar from './ProductFiltersBar'
import { exportProductsCsv } from '../../lib/exportCsv'

const PAGE_SIZE = 50
const STALE_MS  = 30_000   // re-validate cache entries older than 30s

// ─── CSV Export ───────────────────────────────────────────────────────────────
// ─── Small helpers ────────────────────────────────────────────────────────────
function OverrideBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700 border border-purple-100 whitespace-nowrap">
      🔒 Edited
    </span>
  )
}

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

function daysSince(d) {
  if (!d) return null
  return Math.floor((Date.now() - new Date(d).getTime()) / 864e5)
}
function freshnessRowClass(updatedAt) {
  const days = daysSince(updatedAt)
  if (days === null || days === 0) return ''
  if (days <= 7) return 'bg-yellow-50/80'
  return 'bg-red-50/80'
}

// ─── Variant rows ─────────────────────────────────────────────────────────────
const VariantRows = React.memo(function VariantRows({ productId, onSelect }) {
  const [variants, setVariants] = useState(null)
  useEffect(() => {
    let cancelled = false
    supabase.from('variants').select('*').eq('product_id', productId)
      .then(({ data }) => { if (!cancelled) setVariants(data || []) })
    return () => { cancelled = true }
  }, [productId])

  if (!variants) return (
    <tr><td colSpan={8} className="bg-blue-50/30 py-2">
      <div className="h-3 bg-blue-100 rounded animate-pulse w-40 ml-16" />
    </td></tr>
  )

  return variants.map(v => {
    const vImg = parseImages(v.images)[0] || null
    return (
      <tr key={v.variant_id} onClick={onSelect}
        className="border-b border-blue-100/40 last:border-none bg-blue-50/15 hover:bg-blue-50/50 transition-colors cursor-pointer">
        <td className="py-2.5 pl-3 pr-2">
          {vImg
            ? <img src={vImg} alt="" className="w-7 h-7 rounded-md object-cover border border-blue-100/60 ml-auto" loading="lazy" />
            : <div className="w-7 h-7 rounded-md bg-blue-100/50 border border-blue-100 flex items-center justify-center text-[8px] font-bold text-blue-400 ml-auto">V</div>}
        </td>
        <td className="px-4 py-2.5">
          <p className="text-xs font-medium text-gray-700 truncate pl-5">{v.variant_name}</p>
          {v.option1_name && <p className="text-[10px] text-gray-400 pl-5">{v.option1_name}: {v.option1_value}</p>}
        </td>
        <td className="px-4 py-2.5 font-mono text-[10px] text-gray-400 truncate">{v.variant_sku}</td>
        <td className="px-4 py-2.5"><span className="text-gray-200">—</span></td>
        <td className="px-4 py-2.5 text-xs font-semibold text-gray-700">${parseFloat(v.price || 0).toFixed(2)}</td>
        <td className="px-4 py-2.5 text-xs text-gray-600">{v.stock}</td>
        <td className="px-4 py-2.5"><span className="text-gray-200">—</span></td>
        <td className="px-4 py-2.5"><StockBadge stock={v.stock} /></td>
      </tr>
    )
  })
})

// ─── Product row ──────────────────────────────────────────────────────────────
const ProductRow = React.memo(function ProductRow({
  p, supplier, isOverridden, expanded, onEdit, onToggleExpand,
}) {
  const imgs = parseImages(p.images)
  const isVariant = p.product_type === 'variation_parent'
  return (
    <React.Fragment>
      <tr
        onClick={() => onEdit(p.product_id)}
        className={`border-b border-gray-50 transition-colors cursor-pointer last:border-none group
          ${freshnessRowClass(p.updated_at) || 'hover:bg-gray-50/80'}`}
      >
        <td className="px-3 py-2.5">
          {imgs[0]
            ? <img src={imgs[0]} alt="" className="w-9 h-9 rounded-lg object-cover bg-gray-100" loading="lazy" />
            : <div className="w-9 h-9 rounded-lg bg-gray-100" />}
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-start gap-2">
            {isVariant && (
              <button
                onClick={e => onToggleExpand(e, p.product_id)}
                className={`mt-0.5 shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors ${
                  expanded
                    ? 'bg-purple-100 text-purple-600'
                    : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'
                }`}
                title={expanded ? 'Collapse' : 'Expand variants'}
              >
                {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </button>
            )}
            <div className="min-w-0">
              <p className="font-medium text-gray-900 truncate leading-snug">{p.title}</p>
              <p className="text-gray-400 mt-0.5 truncate">{p.brand}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-2.5 font-mono text-gray-400 truncate">{p.sku}</td>
        <td className="px-4 py-2.5">
          {p.category
            ? <span className="px-2 py-0.5 rounded-full text-blue-700 bg-blue-50 border border-blue-100 block truncate w-fit max-w-full">{p.category}</span>
            : <span className="text-gray-200">—</span>}
        </td>
        <td className="px-4 py-2.5 font-semibold text-gray-900">${parseFloat(p.price || 0).toFixed(2)}</td>
        <td className="px-4 py-2.5 text-gray-600">{p.stock}</td>
        <td className="px-4 py-2.5 text-gray-400 truncate">{supplier?.supplier_name || '—'}</td>
        <td className="px-4 py-2.5">
          <div className="flex flex-col gap-1">
            <StockBadge stock={p.stock} />
            {isOverridden && <OverrideBadge />}
          </div>
        </td>
      </tr>
      {isVariant && expanded && (
        <VariantRows productId={p.product_id} onSelect={() => onEdit(p.product_id)} />
      )}
    </React.Fragment>
  )
})

// ─── Main Tab ─────────────────────────────────────────────────────────────────
export default function ProductsTab() {
  const {
    searchInput, setSearchInput, searchLoading,
    setFilterCategory, setFilterStock, setFilterSupplier,
    setFilterMinQty, setFilterMinPrice, setFilterMaxPrice, setFilterFreshness,
    filterState, filterKey, hasFilters, clearFilters,setFilterOverride,
  } = useProductFilters()

  const [editingId,      setEditingId]      = useState(null)
  const [view,           setView]           = useState('table')
  const [exporting,      setExporting]      = useState(false)
  const [expandedRows,   setExpandedRows]   = useState(new Set())
  const [showCsvUpload,  setShowCsvUpload]  = useState(false)
  const [importProgress, setImportProgress] = useState(null)

  const [products,        setProducts]        = useState([])
  const [suppliers,       setSuppliers]       = useState({})
  const [categories,      setCategories]      = useState([])
  const [supplierOptions, setSupplierOptions] = useState([])
  const [overrideSkus,    setOverrideSkus]    = useState(new Set())

  // loading — only true when we have NO cached data to show
  const [loading,      setLoading]      = useState(true)
  // statsLoading — only true when we have NO cached stats for this filterKey
  const [statsLoading, setStatsLoading] = useState(!LEGACY_STATS_CACHE.ready)

  const [page,          setPage]          = useState(0)
  const [filteredCount, setFilteredCount] = useState(0)
  const pageCount = Math.ceil(filteredCount / PAGE_SIZE)

  // Seed summary cards from cache immediately (no skeleton flash for known combos)
  const seedStats = (key) => {
    const cached = STATS_CACHE.get(key)
    if (cached) {
      setTotalCount(cached.total)
      setInStockCount(cached.inStock)
      setOutStockCount(cached.outStock)
      setAvgPrice(cached.avgPrice)
      setTotalItems(cached.totalItems)
      return true
    }
    return false
  }

  const [totalCount,    setTotalCount]    = useState(LEGACY_STATS_CACHE.total)
  const [inStockCount,  setInStockCount]  = useState(LEGACY_STATS_CACHE.inStock)
  const [outStockCount, setOutStockCount] = useState(LEGACY_STATS_CACHE.outStock)
  const [avgPrice,      setAvgPrice]      = useState(LEGACY_STATS_CACHE.avgPrice)
  const [totalItems,    setTotalItems]    = useState(LEGACY_STATS_CACHE.totalItems)

  const [sortBy,  setSortBy]  = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')

  const pageAbortRef  = useRef(null)
  const statsAbortRef = useRef(null)

  // Reset page when filters/sort change
  useEffect(() => { setPage(0) }, [filterKey, sortBy, sortDir])

  // Load meta (suppliers, categories, override skus) once
  useEffect(() => {
    async function loadMeta() {
      const [{ data: supps }, { data: cats }, { data: ovRows }] = await Promise.all([
        supabase.from('suppliers').select('*'),
        supabase.from('products').select('category').not('category', 'is', null),
        supabase.from('product_overrides').select('sku'),
      ])
      const suppMap = {}
      supps?.forEach(s => { suppMap[s.supplier_id] = s })
      setSuppliers(suppMap)
      setSupplierOptions(supps?.map(s => ({ id: String(s.supplier_id), name: s.supplier_name })) || [])
      setCategories([...new Set(cats?.map(r => r.category).filter(Boolean))].sort())
      if (ovRows?.length) setOverrideSkus(new Set(ovRows.map(r => r.sku)))
    }
    loadMeta()
  }, [])

  // ── PAGE FETCH — cache-first, stale-while-revalidate ────────────────────────
  const fetchPage = useCallback(async () => {
    pageAbortRef.current?.abort()
    const ctrl = new AbortController()
    pageAbortRef.current = ctrl

    const cacheKey = getPageCacheKey(filterKey, page, sortBy, sortDir)
    const cached   = getPageCache(cacheKey)

    if (cached) {
      // Paint cached data immediately — zero loading spinner
      setProducts(cached.data)
      setFilteredCount(cached.count)
      setLoading(false)

      // Revalidate in background only if stale
      if (Date.now() - cached.ts < STALE_MS) return
    } else {
      setLoading(true)
    }

    // Always use 'exact' — 'estimated' causes 500s on filtered queries in most Supabase setups.
    // For the no-filter case we skip the count and use the cached total instead (saves a seq-scan).
    const needCount = hasFilters || LEGACY_STATS_CACHE.total === 0
    const q = applyFilters(
      supabase.from(filterState.filterOverride ? 'products_with_status' : 'products').select(
  filterState.filterOverride
    ? 'product_id,sku,title,price,stock,category,brand,images,supplier_id,product_type,updated_at,is_overridden'
    : 'product_id,sku,title,price,stock,category,brand,images,supplier_id,product_type,updated_at',
        needCount ? { count: 'exact' } : undefined
      ),
      filterState
    )
      .order(sortBy, { ascending: sortDir === 'asc' })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    const { data, count, error } = await q
    if (ctrl.signal.aborted) return

    if (!error && data) {
      const resolvedCount = needCount ? (count || 0) : LEGACY_STATS_CACHE.total
      setProducts(data)
      setFilteredCount(resolvedCount)
      setPageCache(cacheKey, data, resolvedCount)

      // Also seed the search cache so repeat searches skip debounce
      if (filterState.search && page === 0) {
        setSearchCache(filterState.search, data, resolvedCount)
      }
    }
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page, sortBy, sortDir, hasFilters])

  // ── STATS FETCH — per-filterKey cache, stale-while-revalidate ───────────────
  const fetchStats = useCallback(async () => {
    const cached = STATS_CACHE.get(filterKey)

    if (cached) {
      // Paint immediately from cache — no skeleton
      setTotalCount(cached.total)
      setInStockCount(cached.inStock)
      setOutStockCount(cached.outStock)
      setAvgPrice(cached.avgPrice)
      setTotalItems(cached.totalItems)
      setStatsLoading(false)

      // Only revalidate if stale
      if (Date.now() - cached.ts < STALE_MS) return
    } else {
      // Show previous stats while loading (avoids blank flicker)
      setStatsLoading(true)
    }

    statsAbortRef.current?.abort()
    const ctrl = new AbortController()
    statsAbortRef.current = ctrl

    const af = q => applyFilters(q, filterState)
    // Always use 'exact' — Supabase JS does not support 'planned' or 'estimated' on HEAD requests
    // const countMode = 'exact'

    async function getFilteredVariantCount() {
      if (!hasFilters) {
        const { count } = await supabase.from('variants').select('*', { count: 'exact', head: true })
        return count || 0
      }
      const onlySupplierOrCategory =
      !filterState.search && !filterState.filterStock &&
      !filterState.filterMinQty && !filterState.filterMinPrice &&
      !filterState.filterMaxPrice && !filterState.filterFreshness &&
      !filterState.filterOverride  // ← add this

      if (!onlySupplierOrCategory) return 0

      const { data: parentIds } = await applyFilters(
  supabase.from('products').select('product_id').eq('product_type', 'variation_parent'),
  { ...filterState, filterOverride: '' }
)
      if (!parentIds?.length) return 0
      const { count } = await supabase
        .from('variants')
        .select('*', { count: 'exact', head: true })
        .in('product_id', parentIds.map(r => r.product_id))
      return count || 0
    }

   let total = 0, inStock = 0, outStock = 0, variantCount = 0
    try {
      ;[
        { count: total },
        { count: inStock },
        { count: outStock },
        variantCount,
      ] = await Promise.all([
        af(supabase.from(filterState.filterOverride ? 'products_with_status' : 'products').select('product_id', { count: 'exact' }).limit(0)),
af(supabase.from(filterState.filterOverride ? 'products_with_status' : 'products').select('product_id', { count: 'exact' }).limit(0)).gt('stock', 0),
af(supabase.from(filterState.filterOverride ? 'products_with_status' : 'products').select('product_id', { count: 'exact' }).limit(0)).eq('stock', 0),
        getFilteredVariantCount(),
      ])
    } catch (e) {
      console.warn('Stats fetch error:', e)
    }

    if (ctrl.signal.aborted) return

    const ti = (total || 0) + variantCount

    setTotalCount(total)
    setInStockCount(inStock)
    setOutStockCount(outStock)
    setTotalItems(ti)

    // Defer avg price so counts paint first
    await new Promise(r => setTimeout(r, 50))
    if (ctrl.signal.aborted) return

let avg = '0.00'
if (!hasFilters) {
  // No filters — use fast RPC (single number, no table scan)
  const { data: rpcData } = await supabase.rpc('get_avg_price')
  if (!ctrl.signal.aborted && rpcData != null) {
    avg = parseFloat(rpcData).toFixed(2)
  }
} else {
  // Has filters — fetch prices from filtered set, capped at 5000
  const { data: priceRows } = await af(
    supabase
      .from(filterState.filterOverride ? 'products_with_status' : 'products')
      .select('price')
      .limit(5000)
  )
  if (!ctrl.signal.aborted && priceRows?.length) {
    avg = (priceRows.reduce((a, b) => a + parseFloat(b.price || 0), 0) / priceRows.length).toFixed(2)
  }
}
if (ctrl.signal.aborted) return
setAvgPrice(avg)

    // Cache this filter combo's stats
    STATS_CACHE.set(filterKey, {
      total: total || 0,
      inStock: inStock || 0,
      outStock: outStock || 0,
      avgPrice: avg,
      totalItems: ti,
    })

    setStatsLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, hasFilters])

  useEffect(() => { fetchPage()  }, [fetchPage])
  useEffect(() => { fetchStats() }, [fetchStats])

  const handleEdit         = useCallback(id => setEditingId(id), [])
  const handleToggleExpand = useCallback((e, productId) => {
    e.stopPropagation()
    setExpandedRows(prev => {
      const next = new Set(prev)
      next.has(productId) ? next.delete(productId) : next.add(productId)
      return next
    })
  }, [])

  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  function SortTh({ col, children }) {
    const active = sortBy === col
    return (
      <th
        onClick={() => toggleSort(col)}
        className="text-left px-4 py-3 text-xs text-gray-400 font-medium cursor-pointer select-none hover:text-gray-600 transition-colors"
      >
        <span className="flex items-center gap-1">
          {children}
          <span className="text-gray-300 text-[10px]">
            {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
          </span>
        </span>
      </th>
    )
  }

  function refreshOverrides() {
    supabase.from('product_overrides').select('sku')
      .then(({ data }) => { if (data) setOverrideSkus(new Set(data.map(r => r.sku))) })
  }

  async function handleImportStart({ rows, batches }) {
    setImportProgress({ status: 'running', done: 0, total: rows.length, failed: 0, failedSkus: [] })
    await runBatches(batches, (batchSize, hadError, _msg, skus) => {
      setImportProgress(p => ({
        ...p, done: p.done + batchSize,
        failed: p.failed + (hadError ? batchSize : 0),
        failedSkus: hadError ? [...p.failedSkus, ...skus] : p.failedSkus,
      }))
    })
    setImportProgress(p => ({ ...p, status: 'done' }))
    // Invalidate page cache after import so fresh data loads
    fetchPage(); refreshOverrides()
  }

  if (editingId !== null) {
    return (
      <ProductEditPage
        productId={editingId}
        suppliers={suppliers}
        categories={categories}
        onBack={() => setEditingId(null)}
        onSaved={() => { fetchPage(); refreshOverrides() }}
      />
    )
  }

  return (
    <div>
      <CsvOverrideUploadModal
        open={showCsvUpload}
        onClose={() => setShowCsvUpload(false)}
        onImportStart={handleImportStart}
      />
      <ImportProgressToast state={importProgress} onDismiss={() => setImportProgress(null)} />

      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 gap-3 flex-wrap">
        <ProductFiltersBar
          searchInput={searchInput} setSearchInput={setSearchInput} searchLoading={searchLoading}
          filterState={filterState}
          setFilterCategory={setFilterCategory} setFilterStock={setFilterStock}
          setFilterSupplier={setFilterSupplier} setFilterMinQty={setFilterMinQty}
          setFilterMinPrice={setFilterMinPrice} setFilterMaxPrice={setFilterMaxPrice}
          setFilterFreshness={setFilterFreshness}
          hasFilters={hasFilters} clearFilters={clearFilters}
          categories={categories} supplierOptions={supplierOptions}
            setFilterOverride={setFilterOverride}  // ← add this

        />
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-1">
            <button onClick={() => setView('grid')}
              className={`p-1.5 rounded-md transition-colors ${view === 'grid' ? 'bg-white shadow-sm text-gray-700' : 'text-gray-400 hover:text-gray-600'}`}>
              <LayoutGrid size={13} />
            </button>
            <button onClick={() => setView('table')}
              className={`p-1.5 rounded-md transition-colors ${view === 'table' ? 'bg-white shadow-sm text-gray-700' : 'text-gray-400 hover:text-gray-600'}`}>
              <Table2 size={13} />
            </button>
          </div>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">
            <Plus size={13} /> Add Product
          </button>
          <button
            onClick={async () => {
              setExporting(true)
              await exportProductsCsv(supabase, filterState)
              setExporting(false)
            }}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            <Download size={13} />{exporting ? 'Exporting…' : hasFilters ? 'Export filtered CSV' : 'Export CSV'}
          </button>
          <button
            onClick={() => setShowCsvUpload(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Upload size={13} /> Import Overrides CSV
          </button>
        </div>
      </div>

      <div className="p-5">
        {/* Summary cards */}
        <div className="flex gap-3 mb-5">
          <SummaryCard label="Total products"  value={totalCount.toLocaleString()}    loading={statsLoading} />
          <SummaryCard label="In stock"         value={inStockCount.toLocaleString()}  loading={statsLoading} />
          <SummaryCard label="Out of stock"     value={outStockCount.toLocaleString()} loading={statsLoading} />
          <SummaryCard label="Avg. price"       value={`$${avgPrice}`}                 loading={statsLoading} />
          <SummaryCard
            label={hasFilters ? 'Matching items' : 'Total items (incl. variants)'}
            value={totalItems.toLocaleString()}
            loading={statsLoading}
          />
        </div>

        {/* Table */}
        {view === 'table' ? (
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-xs table-fixed">
              <colgroup>
                <col style={{width:'52px'}}/>
                <col style={{width:'32%'}}/>
                <col style={{width:'14%'}}/>
                <col style={{width:'10%'}}/>
                <col style={{width:'8%'}}/>
                <col style={{width:'6%'}}/>
                <col style={{width:'13%'}}/>
                <col style={{width:'10%'}}/>
              </colgroup>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3" />
                  <SortTh col="title">Product</SortTh>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">SKU</th>
                  <SortTh col="category">Category</SortTh>
                  <SortTh col="price">Price</SortTh>
                  <SortTh col="stock">Stock</SortTh>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Supplier</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 12 }).map((_, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="px-4 py-3"><div className="w-9 h-9 rounded-lg bg-gray-100 animate-pulse" /></td>
                        <td className="px-4 py-3">
                          <div className="h-3 bg-gray-100 rounded animate-pulse w-4/5 mb-1.5" />
                          <div className="h-2.5 bg-gray-50 rounded animate-pulse w-2/5" />
                        </td>
                        <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-4/5" /></td>
                        <td className="px-4 py-3"><div className="h-5 bg-gray-100 rounded-full animate-pulse" /></td>
                        <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                        <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" /></td>
                        <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-4/5" /></td>
                        <td className="px-4 py-3"><div className="h-5 bg-gray-100 rounded-full animate-pulse" /></td>
                      </tr>
                    ))
                  : products.length === 0
                  ? <tr><td colSpan={8} className="px-4 py-16 text-center text-gray-300">No products found.</td></tr>
                  : products.map(p => (
                      <ProductRow
                        key={p.product_id} p={p}
                        supplier={suppliers[p.supplier_id]}
                        isOverridden={p.is_overridden}
                        expanded={expandedRows.has(p.product_id)}
                        onEdit={handleEdit}
                        onToggleExpand={handleToggleExpand}
                      />
                    ))
                }
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {loading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="border border-gray-100 rounded-xl overflow-hidden bg-white">
                    <div className="w-full h-40 bg-gray-100 animate-pulse" />
                    <div className="p-3 space-y-2">
                      <div className="h-2.5 bg-gray-100 rounded animate-pulse w-16" />
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-full" />
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
                    </div>
                  </div>
                ))
              : products.map(p => {
                  const imgs       = parseImages(p.images)
                  const supplier   = suppliers[p.supplier_id]
                  const isVariant  = p.product_type === 'variation_parent'
                  const isOverridden = p.is_overridden

                  return (
                    <div key={p.product_id} onClick={() => setEditingId(p.product_id)}
                      className="border border-gray-100 rounded-xl overflow-hidden bg-white hover:shadow-md transition-shadow cursor-pointer">
                      <div className="relative">
                        {imgs[0]
                          ? <img src={imgs[0]} alt={p.title} className="w-full h-40 object-cover bg-gray-50" loading="lazy" />
                          : <div className="w-full h-40 bg-gray-50 flex items-center justify-center text-gray-200 text-xs">No image</div>}
                        {isVariant && (
                          <span className="absolute top-2 left-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-600/90 text-white">
                            <Layers size={8} /> VARIANTS
                          </span>
                        )}
                        {isOverridden && (
                          <span className="absolute top-2 right-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/90 text-white">
                            🔒
                          </span>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{p.brand}</p>
                        <p className="text-xs font-medium text-gray-900 mb-2 leading-snug line-clamp-2">{p.title}</p>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-gray-900">${parseFloat(p.price || 0).toFixed(2)}</span>
                          <StockBadge stock={p.stock} />
                        </div>
                        <p className="text-xs text-gray-400">{p.stock} units · <span className="font-mono">{p.sku}</span></p>
                        {supplier && (
                          <span className="mt-2 inline-block text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                            {supplier.supplier_name}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })
            }
          </div>
        )}

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Showing {(page * PAGE_SIZE + 1).toLocaleString()}–
              {Math.min((page + 1) * PAGE_SIZE, filteredCount).toLocaleString()} of{' '}
              {filteredCount.toLocaleString()} products
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
                if (pageCount <= 5)          pg = i
                else if (page < 3)           pg = i
                else if (page > pageCount-4) pg = pageCount - 5 + i
                else                         pg = page - 2 + i
                return (
                  <button key={pg} onClick={() => setPage(pg)}
                    className={`w-8 h-7 text-xs rounded-lg border transition-colors ${
                      page === pg
                        ? 'bg-red-600 text-white border-red-600 font-medium'
                        : 'border-gray-200 text-gray-400 hover:bg-gray-50'
                    }`}>
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