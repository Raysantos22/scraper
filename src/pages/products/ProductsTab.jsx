// ProductsTab.jsx — src/pages/products/ProductsTab.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../../lib/api'
import {
  LayoutGrid, Table2, Plus, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, Download, Layers, Upload, Clock,
} from 'lucide-react'
import ProductEditPage, { parseImages, StockBadge } from './ProductEditPage'
import { CsvOverrideUploadModal, ImportProgressToast, runBatches } from './CsvOverrideUploadModal'
import {
  useProductFilters,
  STATS_CACHE, LEGACY_STATS_CACHE,
  getPageCacheKey, getPageCache, setPageCache,
} from './useProductFilters'
import ProductFiltersBar from './ProductFiltersBar'
import { exportProductsCsv } from '../../lib/exportCsv'
import AddProductModal from './AddProductModal'
import AddProductActivityPanel from './AddProductActivityPanel'


const PAGE_SIZE = 50
const STALE_MS  = 30_000

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

function hoursSince(d) {
  if (!d) return null
  return (Date.now() - new Date(d).getTime()) / 3600000
}

function daysSince(d) {
  if (!d) return null
  return Math.floor((Date.now() - new Date(d).getTime()) / 864e5)
}

function freshnessRowClass(updatedAt) {
  const h = hoursSince(updatedAt)
  if (h === null || h < 24) return ''
  if (h < 48)  return 'bg-yellow-50/60'
  if (h < 168) return 'bg-orange-50/60'
  return 'bg-red-50/70'
}

// ─── Relative time helper ─────────────────────────────────────────────────────
function relativeTime(d) {
  if (!d) return '—'
  const diff  = Date.now() - new Date(d).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 864e5)
  if (mins < 2)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return '1d ago'
  if (days < 7)   return `${days}d ago`
  if (days < 30)  return `${Math.floor(days / 7)}w ago`
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

// ─── Dot color by staleness (hours) ──────────────────────────────────────────
function stalenessDot(d) {
  const h = hoursSince(d)
  if (h === null)  return { dot: 'bg-gray-300',   text: 'text-gray-300'  }
  if (h < 24)      return { dot: 'bg-green-400',  text: 'text-gray-500'  }
  if (h < 48)      return { dot: 'bg-yellow-400', text: 'text-yellow-700'}
  if (h < 168)     return { dot: 'bg-orange-400', text: 'text-orange-700'}
  return               { dot: 'bg-red-400',    text: 'text-red-600'   }
}

// ─── Date cell with tooltip ───────────────────────────────────────────────────
function DateCell({ date, label }) {
  const [hover, setHover] = useState(false)
  if (!date) return <span className="text-gray-200 select-none">—</span>

  const { dot, text } = stalenessDot(date)
  const full = new Date(date).toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div
      className="relative inline-flex items-center gap-1.5 cursor-default"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      <span className={`whitespace-nowrap text-[11px] ${text}`}>{relativeTime(date)}</span>
      {hover && (
        <div className="absolute bottom-full left-0 mb-2 z-50 bg-gray-900 text-white text-[10px] px-2.5 py-2 rounded-lg whitespace-nowrap shadow-xl pointer-events-none">
          <p className="text-gray-400 text-[9px] mb-0.5 uppercase tracking-wider font-medium">{label}</p>
          <p className="font-medium">{full}</p>
        </div>
      )}
    </div>
  )
}

// ─── Variant rows ─────────────────────────────────────────────────────────────
const VariantRows = React.memo(function VariantRows({ productId, onSelect }) {
  const [variants, setVariants] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.get(`/api/variants?product_id=${productId}`)
      .then(data => { if (!cancelled) setVariants(data || []) })
    return () => { cancelled = true }
  }, [productId])

  if (!variants) return (
    <tr><td colSpan={10} className="bg-blue-50/30 py-2">
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
        <td className="px-4 py-2.5"><span className="text-gray-200">—</span></td>
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
                  expanded ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'
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
        <td className="px-4 py-2.5 text-xs">
          <DateCell date={p.created_at || p.uploaded_at} label="Uploaded" />
        </td>
        <td className="px-4 py-2.5 text-xs">
          <DateCell date={p.updated_at} label="Updated" />
        </td>
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
    filterState, filterKey, hasFilters, clearFilters, setFilterOverride,
    setFilterUploaded,
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

  const [loading,      setLoading]      = useState(true)
  const [statsLoading, setStatsLoading] = useState(!LEGACY_STATS_CACHE.ready)

  const [page,          setPage]          = useState(0)
  const [filteredCount, setFilteredCount] = useState(0)
  const pageCount = Math.ceil(filteredCount / PAGE_SIZE)

  const [totalCount,    setTotalCount]    = useState(LEGACY_STATS_CACHE.total    || 0)
  const [inStockCount,  setInStockCount]  = useState(LEGACY_STATS_CACHE.inStock  || 0)
  const [outStockCount, setOutStockCount] = useState(LEGACY_STATS_CACHE.outStock || 0)
  const [avgPrice,      setAvgPrice]      = useState(LEGACY_STATS_CACHE.avgPrice || '0.00')
  const [totalItems,    setTotalItems]    = useState(LEGACY_STATS_CACHE.totalItems || 0)

  const [sortBy,  setSortBy]  = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const [showAddProduct, setShowAddProduct] = useState(false)

  const [jobs, setJobs] = useState([])

function startJob(jobId, total, label) {
  setJobs(prev => [{ jobId, label, total, done: 0, success: 0, failed: 0, results: [] }, ...prev].slice(0, 50))
  return jobId
}
function addJobResult(jobId, result) {
  setJobs(prev => prev.map(j => j.jobId !== jobId ? j : {
    ...j,
    done: j.done + 1,
    success: j.success + (result.status === 'success' ? 1 : 0),
    failed: j.failed + (result.status === 'error' ? 1 : 0),
    results: [...j.results, result],
  }))
}
function removeJob(jobId) {
  setJobs(prev => prev.filter(j => j.jobId !== jobId))
}

function pollBulkJob(jobId) {
  const seenAsins = new Set()
  const interval = setInterval(async () => {
    const job = await api.get(`/api/products/bulk-add/${jobId}`)
    if (!job || job.error) { clearInterval(interval); return }
    for (const r of job.results) {
      if (seenAsins.has(r.asin)) continue
      seenAsins.add(r.asin)
      addJobResult(jobId, { asin: r.asin, status: r.status, title: r.title, message: r.message })
      if (r.status === 'success') {
        api.get(`/api/products/${r.product_id}`).then(product => {
          if (product) {
            setProducts(prev => [product, ...prev])
            setFilteredCount(c => c + 1)
            setTotalCount(c => c + 1)
            setTotalItems(c => c + 1)
          }
        })
      }
    }
    if (job.status === 'done') { clearInterval(interval); fetchStats() }
  }, 1500)
}

useEffect(() => { setPage(0) }, [filterKey, sortBy, sortDir])

  // ── Load meta once ───────────────────────────────────────────────────────
  useEffect(() => {
    async function loadMeta() {
      const [supps, cats, ovSkus] = await Promise.all([
        api.get('/api/suppliers'),
        api.get('/api/products/categories'),
        api.get('/api/products/override-skus'),
      ])
      const suppMap = {}
      supps?.forEach(s => { suppMap[s.supplier_id] = s })
      setSuppliers(suppMap)
      setSupplierOptions(supps?.map(s => ({ id: String(s.supplier_id), name: s.supplier_name })) || [])
      setCategories(Array.isArray(cats) ? cats : [])
      if (ovSkus?.length) setOverrideSkus(new Set(ovSkus))
    }
    loadMeta()
  }, [])

  // ── Page fetch ───────────────────────────────────────────────────────────
  const fetchPage = useCallback(async () => {
    const cacheKey = getPageCacheKey(filterKey, page, sortBy, sortDir)
    const cached   = getPageCache(cacheKey)

    if (cached) {
      setProducts(cached.data)
      setFilteredCount(cached.count)
      setLoading(false)
      if (Date.now() - cached.ts < STALE_MS) return
    } else {
      setLoading(true)
    }

    const params = new URLSearchParams({
      page, limit: PAGE_SIZE, sort: sortBy, dir: sortDir,
      ...(filterState.filterOverride  ? { override: 'true' }                         : {}),
      ...(filterState.search          ? { search: filterState.search }               : {}),
      ...(filterState.filterCategory  ? { category: filterState.filterCategory }     : {}),
      ...(filterState.filterStock     ? { stock: filterState.filterStock }           : {}),
      ...(filterState.filterSupplier  ? { supplier_id: filterState.filterSupplier }  : {}),
      ...(filterState.filterMinQty    ? { minQty: filterState.filterMinQty }         : {}),
      ...(filterState.filterMinPrice  ? { minPrice: filterState.filterMinPrice }     : {}),
      ...(filterState.filterMaxPrice  ? { maxPrice: filterState.filterMaxPrice }     : {}),
      ...(filterState.filterFreshness ? { freshness: filterState.filterFreshness }   : {}),
      ...(filterState.filterUploaded  ? { uploaded: filterState.filterUploaded }     : {}),
    })

    const res = await api.get(`/api/products?${params}`)
    if (res?.data) {
      setProducts(res.data)
      setFilteredCount(res.count || 0)
      setPageCache(cacheKey, res.data, res.count || 0)
    }
    setLoading(false)
  }, [filterKey, page, sortBy, sortDir, filterState])

  // ── Stats fetch ──────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    const cached = STATS_CACHE.get(filterKey)
    if (cached) {
      setTotalCount(cached.total    || 0)
      setInStockCount(cached.inStock  || 0)
      setOutStockCount(cached.outStock || 0)
      setAvgPrice(cached.avgPrice   || '0.00')
      setTotalItems(cached.totalItems || 0)
      setStatsLoading(false)
      if (Date.now() - cached.ts < STALE_MS) return
    } else {
      setStatsLoading(true)
    }

    const params = new URLSearchParams({
      ...(filterState.filterOverride  ? { override: 'true' }                         : {}),
      ...(filterState.search          ? { search: filterState.search }               : {}),
      ...(filterState.filterCategory  ? { category: filterState.filterCategory }     : {}),
      ...(filterState.filterStock     ? { stock: filterState.filterStock }           : {}),
      ...(filterState.filterSupplier  ? { supplier_id: filterState.filterSupplier }  : {}),
      ...(filterState.filterMinQty    ? { minQty: filterState.filterMinQty }         : {}),
      ...(filterState.filterMinPrice  ? { minPrice: filterState.filterMinPrice }     : {}),
      ...(filterState.filterMaxPrice  ? { maxPrice: filterState.filterMaxPrice }     : {}),
      ...(filterState.filterFreshness ? { freshness: filterState.filterFreshness }   : {}),
      ...(filterState.filterUploaded  ? { uploaded: filterState.filterUploaded }     : {}),
    })

    const stats = await api.get(`/api/products/stats?${params}`)
    if (stats) {
      setTotalCount(stats.total      || 0)
      setInStockCount(stats.inStock   || 0)
      setOutStockCount(stats.outStock  || 0)
      setAvgPrice(stats.avgPrice    || '0.00')
      setTotalItems(stats.totalItems || 0)
      STATS_CACHE.set(filterKey, { ...stats, ts: Date.now() })
    }
    setStatsLoading(false)
  }, [filterKey, filterState])

  useEffect(() => { fetchPage()  }, [fetchPage])
  useEffect(() => { fetchStats() }, [fetchStats])

  const handleEdit = useCallback(id => setEditingId(id), [])
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

  function SortTh({ col, children, className = '' }) {
    const active = sortBy === col
    return (
      <th
        onClick={() => toggleSort(col)}
        className={`text-left px-4 py-3 text-xs text-gray-400 font-medium cursor-pointer select-none hover:text-gray-600 transition-colors ${className}`}
      >
        <span className="flex items-center gap-1">
          {children}
          <span className="text-gray-300 text-[10px]">{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
        </span>
      </th>
    )
  }

  function refreshOverrides() {
    api.get('/api/products/override-skus')
      .then(data => { if (data) setOverrideSkus(new Set(data)) })
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
     
      <CsvOverrideUploadModal open={showCsvUpload} onClose={() => setShowCsvUpload(false)} onImportStart={handleImportStart} />
      <ImportProgressToast state={importProgress} onDismiss={() => setImportProgress(null)} />
   <AddProductModal
  open={showAddProduct}
  onClose={() => setShowAddProduct(false)}
  onActivityStart={(asin) => {
    const jobId = `single_${Date.now()}`
    startJob(jobId, 1, 'Add Product')
    return jobId
  }}
  onActivityDone={(jobId, patch) => {
    addJobResult(jobId, { asin: patch.asin, status: patch.status, title: patch.title, message: patch.message })
  }}
  onAdded={(newProduct) => {
    setProducts(prev => [newProduct, ...prev])
    setFilteredCount(c => c + 1)
    setTotalCount(c => c + 1)
    setTotalItems(c => c + 1)
    fetchStats()
  }}
  onJobStarted={(jobId, asins) => {
    startJob(jobId, asins.length, 'Bulk Import')
    pollBulkJob(jobId)
  }}
/>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 gap-3 flex-wrap">
        <ProductFiltersBar
          searchInput={searchInput} setSearchInput={setSearchInput} searchLoading={searchLoading}
          filterState={filterState}
          setFilterCategory={setFilterCategory} setFilterStock={setFilterStock}
          setFilterSupplier={setFilterSupplier} setFilterMinQty={setFilterMinQty}
          setFilterMinPrice={setFilterMinPrice} setFilterMaxPrice={setFilterMaxPrice}
          setFilterFreshness={setFilterFreshness}
          setFilterUploaded={setFilterUploaded}
          hasFilters={hasFilters} clearFilters={clearFilters}
          categories={categories} supplierOptions={supplierOptions}
          setFilterOverride={setFilterOverride}
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
<button
  onClick={() => setShowAddProduct(true)}
  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
>
  <Plus size={13} /> Add Product
</button>
<AddProductActivityPanel
  jobs={jobs}
  onRemoveJob={removeJob}
/>
          <button
            onClick={async () => {
              setExporting(true)
              await exportProductsCsv(filterState)
              setExporting(false)
            }}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            <Download size={13} />{exporting ? 'Exporting…' : hasFilters ? 'Export filtered CSV' : 'Export CSV'}
          </button>
          <button onClick={() => setShowCsvUpload(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            <Upload size={13} /> Import Overrides CSV
          </button>
        </div>
      </div>

      <div className="p-5">
        {/* Summary cards */}
        <div className="flex gap-3 mb-5">
          <SummaryCard label="Total products"  value={(totalCount   || 0).toLocaleString()} loading={statsLoading} />
          <SummaryCard label="In stock"         value={(inStockCount  || 0).toLocaleString()} loading={statsLoading} />
          <SummaryCard label="Out of stock"     value={(outStockCount || 0).toLocaleString()} loading={statsLoading} />
          <SummaryCard label="Avg. price"       value={`$${avgPrice || '0.00'}`}              loading={statsLoading} />
          <SummaryCard
            label={hasFilters ? 'Matching items' : 'Total items (incl. variants)'}
            value={(totalItems || 0).toLocaleString()}
            loading={statsLoading}
          />
        </div>

        {/* Table */}
        {view === 'table' ? (
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-xs table-fixed">
              <colgroup>
                <col style={{width:'48px'}}/>   {/* img */}
                <col style={{width:'26%'}}/>    {/* product */}
                <col style={{width:'12%'}}/>    {/* sku */}
                <col style={{width:'9%'}}/>     {/* category */}
                <col style={{width:'7%'}}/>     {/* price */}
                <col style={{width:'5%'}}/>     {/* stock */}
                <col style={{width:'9%'}}/>     {/* uploaded */}
                <col style={{width:'9%'}}/>     {/* updated */}
                <col style={{width:'11%'}}/>    {/* supplier */}
                <col style={{width:'9%'}}/>     {/* status */}
              </colgroup>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-3 py-3" />
                  <SortTh col="title">Product</SortTh>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">SKU</th>
                  <SortTh col="category">Category</SortTh>
                  <SortTh col="price">Price</SortTh>
                  <SortTh col="stock">Stock</SortTh>
                  <SortTh col="created_at">
                    <span className="flex items-center gap-1">
                      <Clock size={10} className="text-gray-300" />
                      Uploaded
                    </span>
                  </SortTh>
                  <SortTh col="updated_at">
                    <span className="flex items-center gap-1">
                      <Clock size={10} className="text-gray-300" />
                      Updated
                    </span>
                  </SortTh>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Supplier</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 12 }).map((_, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="px-3 py-3"><div className="w-9 h-9 rounded-lg bg-gray-100 animate-pulse" /></td>
                        <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-4/5 mb-1.5" /><div className="h-2.5 bg-gray-50 rounded animate-pulse w-2/5" /></td>
                        <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-4/5" /></td>
                        <td className="px-4 py-3"><div className="h-5 bg-gray-100 rounded-full animate-pulse" /></td>
                        <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" /></td>
                        <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" /></td>
                        <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-4/5" /></td>
                        <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-4/5" /></td>
                        <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-4/5" /></td>
                        <td className="px-4 py-3"><div className="h-5 bg-gray-100 rounded-full animate-pulse" /></td>
                      </tr>
                    ))
                  : products.length === 0
                  ? <tr><td colSpan={10} className="px-4 py-16 text-center text-gray-300">No products found.</td></tr>
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
          // ── Grid view (unchanged) ─────────────────────────────────────────
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
                          <span className="absolute top-2 right-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/90 text-white">🔒</span>
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
                        {/* Date row */}
                        <div className="mt-2 flex items-center gap-3">
                          {p.created_at && (
                            <span className="text-[10px] text-gray-400">
                              ↑ {relativeTime(p.created_at || p.uploaded_at)}
                            </span>
                          )}
                          {p.updated_at && (
                            <span className="text-[10px] text-gray-400">
                              ↻ {relativeTime(p.updated_at)}
                            </span>
                          )}
                        </div>
                        {supplier && <span className="mt-1.5 inline-block text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{supplier.supplier_name}</span>}
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
              Showing {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, filteredCount).toLocaleString()} of {filteredCount.toLocaleString()} products
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