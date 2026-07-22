// ProductsTab.jsx — src/pages/products/ProductsTab.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../../lib/api'
import {
  LayoutGrid, Table2, Plus, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, Download, Layers, Upload, Clock,
  Trash2, Truck, X, Loader2,
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
const _activelyPolling = new Set()

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
    <tr><td colSpan={11} className="bg-blue-50/30 py-2">
      <div className="h-3 bg-blue-100 rounded animate-pulse w-40 ml-16" />
    </td></tr>
  )

  return variants.map(v => {
    const vImg = parseImages(v.images)[0] || null
    return (
      <tr key={v.variant_id} onClick={onSelect}
        className="border-b border-blue-100/40 last:border-none bg-blue-50/15 hover:bg-blue-50/50 transition-colors cursor-pointer">
        <td className="py-2.5 pl-3 pr-2" />
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
  p, supplier, isOverridden, expanded, selected, onEdit, onToggleExpand, onToggleSelect,
}) {
  const imgs = parseImages(p.images)
  const isVariant = p.product_type === 'variation_parent'
  return (
    <React.Fragment>
      <tr
        onClick={() => onEdit(p.product_id)}
        className={`border-b border-gray-50 transition-colors cursor-pointer last:border-none group
          ${selected ? 'bg-red-50/50 hover:bg-red-50/70' : freshnessRowClass(p.updated_at) || 'hover:bg-gray-50/80'}`}
      >
        <td className="pl-4 pr-1 py-2.5" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(p.product_id)}
            className="w-3.5 h-3.5 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
          />
        </td>
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

// ─── Bulk action bar ──────────────────────────────────────────────────────────
function BulkActionBar({
  count, allOnPageSelected, filteredCount, selectAllMatching,
  onSelectAllMatching, onClear, onDelete, onChangeSupplier, busy,
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 mb-3 rounded-xl bg-red-50 border border-red-100">
      <div className="flex items-center gap-3 text-xs">
        <span className="font-semibold text-red-700">
          {selectAllMatching ? filteredCount.toLocaleString() : count.toLocaleString()} selected
        </span>
        {!selectAllMatching && allOnPageSelected && filteredCount > count && (
          <button
            onClick={onSelectAllMatching}
            className="text-red-600 underline underline-offset-2 hover:text-red-800 font-medium"
          >
            Select all {filteredCount.toLocaleString()} matching products
          </button>
        )}
        <button onClick={onClear} className="text-gray-400 hover:text-gray-600 flex items-center gap-1">
          <X size={12} /> Clear
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onChangeSupplier}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-200 bg-white text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          <Truck size={13} /> Change supplier
        </button>
        <button
          onClick={onDelete}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-40 transition-colors"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete
        </button>
      </div>
    </div>
  )
}

// ─── Generic confirm dialog (replaces window.confirm) ────────────────────────
function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', danger = true, busy, onConfirm, onCancel,
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1.5">{title}</h3>
        <p className="text-xs text-gray-500 leading-relaxed mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-40 transition-colors ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-900 hover:bg-gray-800'
            }`}
          >
            {busy && <Loader2 size={13} className="animate-spin" />} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Generic error/notice dialog (replaces window.alert) ─────────────────────
function ErrorDialog({ open, title = 'Something went wrong', message, onClose }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1.5">{title}</h3>
        <p className="text-xs text-gray-500 leading-relaxed mb-5 break-words">{message}</p>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold bg-gray-900 hover:bg-gray-800 text-white rounded-lg"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Supplier picker modal ────────────────────────────────────────────────────
function SupplierPickerModal({ open, onClose, supplierOptions, onConfirm, busy, count }) {
  const [supplierId, setSupplierId] = useState('')
  useEffect(() => { if (open) setSupplierId('') }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Change supplier</h3>
        <p className="text-xs text-gray-400 mb-4">
          This will update the supplier for {count.toLocaleString()} product{count === 1 ? '' : 's'}.
        </p>
        <select
          value={supplierId}
          onChange={e => setSupplierId(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs mb-4 focus:outline-none focus:ring-1 focus:ring-red-400"
        >
          <option value="">Select a supplier…</option>
          {supplierOptions.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={() => supplierId && onConfirm(supplierId)}
            disabled={busy || !supplierId}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-40"
          >
            {busy && <Loader2 size={13} className="animate-spin" />} Apply
          </button>
        </div>
      </div>
    </div>
  )
}

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

  // ── Bulk selection state ─────────────────────────────────────────────────
  const [selectedIds,      setSelectedIds]      = useState(new Set())
  const [selectAllMatching, setSelectAllMatching] = useState(false)
  const [showSupplierPicker, setShowSupplierPicker] = useState(false)
  const [bulkBusy,          setBulkBusy]          = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [errorDialog,       setErrorDialog]       = useState(null) // { title?, message }

  const [jobs, setJobs] = useState([])

function startJob(jobId, total, label) {
  setJobs(prev => [{ jobId, label, total, done: 0, success: 0, failed: 0, results: [] }, ...prev].slice(0, 50))
  return jobId
}
// Batch-style jobs (bulk delete / bulk supplier change / chunked bulk-add)
// track raw progress counts rather than a per-item results list — `kind:
// 'batch'` tells the activity panel to render a progress bar + summary
// instead of a row list.
function startBatchJob(jobId, total, label) {
  setJobs(prev => [{ jobId, label, total, done: 0, success: 0, failed: 0, results: [], kind: 'batch', status: 'running', summary: null }, ...prev].slice(0, 50))
  return jobId
}
function updateJob(jobId, patch) {
  setJobs(prev => prev.map(j => j.jobId !== jobId ? j : { ...j, ...patch }))
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
async function cancelJob(jobId) {
  try {
    await api.post(`/api/products/bulk-add/${jobId}/cancel`)
    updateJob(jobId, { status: 'cancelling' })
  } catch (e) {
    setErrorDialog({ title: 'Cancel failed', message: e.message || 'Could not cancel the job' })
  }
}
// Polls a single /api/products/bulk-add job until it's done, applying the
// same side effects as before (adding successful products to the list,
// bumping the summary counts). Now returns a Promise that resolves once the
// job reaches 'done', so a caller can `await` one chunk finishing before
// starting the next — existing callers that don't await it keep working
// exactly as before (fire-and-forget).
// Module-level — survives remounts, one poller per jobId, ever.
const _pollers = new Map() // jobId -> { stop: fn }

function pollBulkJob(jobId) {
  if (_pollers.has(jobId)) return _pollers.get(jobId).promise

  const seenAsins = new Set()
  let stopped = false
  let timer = null

  const promise = new Promise((resolve) => {
    async function tick() {
      if (stopped) return
      let job
      try {
        job = await api.get(`/api/products/bulk-add/${jobId}`)
      } catch (e) {
        // network hiccup — back off and retry, don't spin
        timer = setTimeout(tick, 4000)
        return
      }
      if (!job || job.error) { finish(); return }

      for (const r of job.results) {
        if (seenAsins.has(r.asin)) continue
        seenAsins.add(r.asin)
        addJobResult(jobId, { asin: r.asin, status: r.status, title: r.title, message: r.message })
        if (r.status === 'success') {
          api.get(`/api/products/${r.product_id}`).then(product => {
            if (product) {
              setProducts(prev => prev.some(p => p.product_id === product.product_id) ? prev : [product, ...prev])
              setFilteredCount(c => c + 1)
              setTotalCount(c => c + 1)
              setTotalItems(c => c + 1)
            }
          })
        }
      }
      updateJob(jobId, { status: job.status })

      if (job.status === 'done' || job.status === 'cancelled' || job.status === 'error') {
        fetchStats()
        finish()
        return
      }
      timer = setTimeout(tick, 1500) // fixed 1.5s cadence, one in-flight request at a time
    }
    function finish() {
      stopped = true
      _pollers.delete(jobId)
      resolve()
    }
    tick()
  })

  _pollers.set(jobId, { promise })
  return promise
}

// Runs a large bulk-add across multiple <=500-ASIN chunks, one at a time.
// Sequential on purpose: each chunk spawns its own fetch_bulk_products.py
// process with its own fresh rate limiter per account, so firing many
// chunks concurrently would multiply the effective request rate per
// account far past what Amazon accepts and just trigger a wall of 429s.
// One chunk at a time keeps each account's real throughput ceiling intact.
// Runs independently of AddProductModal's lifetime, since the modal closes
// as soon as this starts.
async function runBulkChunksSequential(chunks, supplierId) {
  const overallJobId = `chunked_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const totalAsins = chunks.reduce((n, c) => n + c.length, 0)
  startBatchJob(overallJobId, totalAsins, `Bulk Import (${chunks.length} batches)`)
  updateJob(overallJobId, { summary: `Starting batch 1 of ${chunks.length}…` })

  let doneCount = 0
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    updateJob(overallJobId, { summary: `Batch ${i + 1} of ${chunks.length} running (${chunk.length} ASINs)…` })

    let res
    try {
      res = await api.post('/api/products/bulk-add', { asins: chunk, supplier_id: supplierId })
    } catch (e) {
      updateJob(overallJobId, {
        status: 'error', done: doneCount, failed: totalAsins - doneCount,
        summary: `Stopped at batch ${i + 1}/${chunks.length}: ${e.message || 'network error'}. ${doneCount.toLocaleString()} of ${totalAsins.toLocaleString()} completed before the failure.`,
      })
      return
    }
    if (!res?.job_id) {
      updateJob(overallJobId, {
        status: 'error', done: doneCount, failed: totalAsins - doneCount,
        summary: `Stopped at batch ${i + 1}/${chunks.length}: ${res?.error || 'failed to start'}. ${doneCount.toLocaleString()} of ${totalAsins.toLocaleString()} completed before the failure.`,
      })
      return
    }

    await pollBulkJob(res.job_id)
    doneCount += chunk.length
    updateJob(overallJobId, { done: doneCount, summary: `Completed batch ${i + 1} of ${chunks.length} (${doneCount.toLocaleString()} of ${totalAsins.toLocaleString()} ASINs so far)…` })
  }

  updateJob(overallJobId, {
    status: 'done', done: totalAsins, success: totalAsins,
    summary: `Imported ${totalAsins.toLocaleString()} ASINs across ${chunks.length} batches.`,
  })
  fetchStats()
}

function pollBulkActionJob(jobId, verbLabel, onDone) {
  const interval = setInterval(async () => {
    let job
    try {
      job = await api.get(`/api/products/bulk-job/${jobId}`)
    } catch (e) {
      clearInterval(interval)
      updateJob(jobId, { status: 'error', summary: `Failed: ${e.message}` })
      return
    }
    if (!job || job.error) {
      clearInterval(interval)
      updateJob(jobId, { status: 'error', summary: job?.error || 'Job not found' })
      return
    }
    const done = job.done ?? 0
    const total = job.total ?? 0
    if (job.status === 'done') {
      clearInterval(interval)
      updateJob(jobId, {
        done, total, status: 'done',
        success: done, failed: 0,
        summary: `${verbLabel} ${done.toLocaleString()} of ${total.toLocaleString()} products.`,
      })
      onDone && onDone()
    } else if (job.status === 'error') {
      clearInterval(interval)
      updateJob(jobId, {
        done, total, status: 'error',
        failed: total - done,
        summary: `Stopped after ${done.toLocaleString()} of ${total.toLocaleString()} — ${job.error || 'unknown error'}`,
      })
      onDone && onDone()
    } else {
      updateJob(jobId, { done, total })
    }
  }, 1000)
}

 useEffect(() => {
    api.get('/api/activity?limit=50').then(rows => {
      if (!rows?.length) return

      setJobs(rows.map(r => ({
        jobId: r.job_id,
        label: r.label || r.job_type,
        total: r.total || 0,
        done: r.done || 0,
        success: r.success || 0,
        failed: r.failed || 0,
        status: r.status,
        summary: r.summary,
        results: [],
        kind: (r.job_type === 'bulk_delete' || r.job_type === 'bulk_update') ? 'batch' : undefined,
      })))

      for (const r of rows) {
        if (r.status !== 'running') continue
        if (r.job_type === 'bulk_add') {
          pollBulkJob(r.job_id)
        } else if (r.job_type === 'bulk_delete' || r.job_type === 'bulk_update') {
          pollBulkActionJob(
            r.job_id,
            r.job_type === 'bulk_delete' ? 'Deleted' : 'Updated',
            () => { fetchPage(true); fetchStats(true) }
          )
        }
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Clear selection whenever the filter set or page changes underneath it
  useEffect(() => {
    setPage(0)
    clearSelection()
  }, [filterKey, sortBy, sortDir])

  useEffect(() => {
    clearSelection()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  function clearSelection() {
    setSelectedIds(new Set())
    setSelectAllMatching(false)
  }

  function toggleSelect(productId) {
    setSelectAllMatching(false)
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(productId) ? next.delete(productId) : next.add(productId)
      return next
    })
  }

  function toggleSelectAllOnPage() {
    const allSelected = products.length > 0 && products.every(p => selectedIds.has(p.product_id))
    if (allSelected) {
      clearSelection()
    } else {
      setSelectAllMatching(false)
      setSelectedIds(new Set(products.map(p => p.product_id)))
    }
  }

  // Build the same filter query params fetchPage/fetchStats send, so bulk
  // "select all matching" actions on the backend target exactly what's shown.
  const buildFilterParams = useCallback(() => ({
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
  }), [filterState])

  function handleBulkDelete() {
    const count = selectAllMatching ? filteredCount : selectedIds.size
    if (count === 0) return
    setConfirmDeleteOpen(true)
  }

  async function confirmBulkDelete() {
    setBulkBusy(true)
    try {
      const body = selectAllMatching
        ? { select_all: true, filters: buildFilterParams() }
        : { product_ids: Array.from(selectedIds) }
      const res = await api.post('/api/products/bulk-delete', body)
      if (res?.job_id) {
        startBatchJob(res.job_id, res.total, 'Delete products')
        pollBulkActionJob(res.job_id, 'Deleted', () => { fetchPage(true); fetchStats(true) })

        setConfirmDeleteOpen(false)
        clearSelection()
      } else if (res?.success) {
        // Nothing matched — total was 0, no job needed
        setConfirmDeleteOpen(false)
        clearSelection()
      } else {
        setErrorDialog({ title: 'Delete failed', message: res?.error || 'Bulk delete failed' })
      }
    } catch (e) {
      setErrorDialog({ title: 'Delete failed', message: e.message || 'Bulk delete failed' })
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleBulkSupplierChange(supplierId) {
    setBulkBusy(true)
    try {
      const body = selectAllMatching
        ? { select_all: true, filters: buildFilterParams(), fields: { supplier_id: supplierId } }
        : { product_ids: Array.from(selectedIds), fields: { supplier_id: supplierId } }
      const res = await api.post('/api/products/bulk-update', body)
      if (res?.job_id) {
        startBatchJob(res.job_id, res.total, 'Change supplier')
        pollBulkActionJob(res.job_id, 'Updated', () => { fetchPage(true) })
        setShowSupplierPicker(false)
        clearSelection()
      } else if (res?.success) {
        setShowSupplierPicker(false)
        clearSelection()
      } else {
        setErrorDialog({ title: 'Update failed', message: res?.error || 'Bulk update failed' })
      }
    } catch (e) {
      setErrorDialog({ title: 'Update failed', message: e.message || 'Bulk update failed' })
    } finally {
      setBulkBusy(false)
    }
  }

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
const fetchPage = useCallback(async (force = false) => {
  const cacheKey = getPageCacheKey(filterKey, page, sortBy, sortDir)
  const cached   = !force ? getPageCache(cacheKey) : null
  if (cached) {
    setProducts(cached.data)
    setFilteredCount(cached.count)
    setLoading(false)
    if (Date.now() - cached.ts < STALE_MS) return
  } else {
    setLoading(true)
  }
  const params = new URLSearchParams({ page, limit: PAGE_SIZE, sort: sortBy, dir: sortDir, ...buildFilterParams() })
  const res = await api.get(`/api/products?${params}`)
  if (res?.data) {
    setProducts(res.data)
    setFilteredCount(res.count || 0)
    setPageCache(cacheKey, res.data, res.count || 0)
  }
  setLoading(false)
}, [filterKey, page, sortBy, sortDir, buildFilterParams])

  // ── Stats fetch ──────────────────────────────────────────────────────────
const fetchStats = useCallback(async (force = false) => {
  const cached = !force ? STATS_CACHE.get(filterKey) : null
  if (cached) {
    setTotalCount(cached.total || 0)
    setInStockCount(cached.inStock || 0)
    setOutStockCount(cached.outStock || 0)
    setAvgPrice(cached.avgPrice || '0.00')
    setTotalItems(cached.totalItems || 0)
    setStatsLoading(false)
    if (Date.now() - cached.ts < STALE_MS) return
  } else {
    setStatsLoading(true)
  }
  const params = new URLSearchParams(buildFilterParams())
  const stats = await api.get(`/api/products/stats?${params}`)
  if (stats) {
    setTotalCount(stats.total || 0)
    setInStockCount(stats.inStock || 0)
    setOutStockCount(stats.outStock || 0)
    setAvgPrice(stats.avgPrice || '0.00')
    setTotalItems(stats.totalItems || 0)
    STATS_CACHE.set(filterKey, { ...stats, ts: Date.now() })
  }
  setStatsLoading(false)
}, [filterKey, buildFilterParams])

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

  const allOnPageSelected = products.length > 0 && products.every(p => selectedIds.has(p.product_id))
  const someOnPageSelected = products.some(p => selectedIds.has(p.product_id))
  const selectionCount = selectAllMatching ? filteredCount : selectedIds.size

  return (
    <div>
     
      <CsvOverrideUploadModal open={showCsvUpload} onClose={() => setShowCsvUpload(false)} onImportStart={handleImportStart} />
      <ImportProgressToast state={importProgress} onDismiss={() => setImportProgress(null)} />
      <SupplierPickerModal
        open={showSupplierPicker}
        onClose={() => setShowSupplierPicker(false)}
        supplierOptions={supplierOptions}
        onConfirm={handleBulkSupplierChange}
        busy={bulkBusy}
        count={selectionCount}
      />
      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete products?"
        message={`Delete ${selectionCount.toLocaleString()} product${selectionCount === 1 ? '' : 's'}? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        busy={bulkBusy}
        onConfirm={confirmBulkDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
      <ErrorDialog
        open={!!errorDialog}
        title={errorDialog?.title}
        message={errorDialog?.message}
        onClose={() => setErrorDialog(null)}
      />
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
    setProducts(prev => prev.some(p => p.product_id === product.product_id) ? prev : [product, ...prev])
    setFilteredCount(c => c + 1)
    setTotalCount(c => c + 1)
    setTotalItems(c => c + 1)
    fetchStats()
  }}
  onJobStarted={(jobId, asins) => {
    startJob(jobId, asins.length, 'Bulk Import')
    pollBulkJob(jobId)
  }}
  onBulkChunksStart={(chunks, supplierId) => {
    runBulkChunksSequential(chunks, supplierId)
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
  onCancelJob={cancelJob}
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

        {/* Bulk action bar (only in table view, once something is selected) */}
        {view === 'table' && (selectedIds.size > 0 || selectAllMatching) && (
          <BulkActionBar
            count={selectedIds.size}
            filteredCount={filteredCount}
            allOnPageSelected={allOnPageSelected}
            selectAllMatching={selectAllMatching}
            onSelectAllMatching={() => setSelectAllMatching(true)}
            onClear={clearSelection}
            onDelete={handleBulkDelete}
            onChangeSupplier={() => setShowSupplierPicker(true)}
            busy={bulkBusy}
          />
        )}

        {/* Table */}
        {view === 'table' ? (
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-xs table-fixed">
              <colgroup>
                <col style={{width:'32px'}}/>   {/* checkbox */}
                <col style={{width:'44px'}}/>   {/* img */}
                <col style={{width:'25%'}}/>    {/* product */}
                <col style={{width:'12%'}}/>    {/* sku */}
                <col style={{width:'9%'}}/>     {/* category */}
                <col style={{width:'7%'}}/>     {/* price */}
                <col style={{width:'5%'}}/>     {/* stock */}
                <col style={{width:'9%'}}/>     {/* uploaded */}
                <col style={{width:'9%'}}/>     {/* updated */}
                <col style={{width:'10%'}}/>    {/* supplier */}
                <col style={{width:'9%'}}/>     {/* status */}
              </colgroup>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="pl-4 pr-1 py-3">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      ref={el => { if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected }}
                      onChange={toggleSelectAllOnPage}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                    />
                  </th>
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
                        <td className="pl-4 pr-1 py-3"><div className="w-3.5 h-3.5 rounded bg-gray-100 animate-pulse" /></td>
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
                  ? <tr><td colSpan={11} className="px-4 py-16 text-center text-gray-300">No products found.</td></tr>
                  : products.map(p => (
                      <ProductRow
                        key={p.product_id} p={p}
                        supplier={suppliers[p.supplier_id]}
                        isOverridden={p.is_overridden}
                        expanded={expandedRows.has(p.product_id)}
                        selected={selectAllMatching || selectedIds.has(p.product_id)}
                        onEdit={handleEdit}
                        onToggleExpand={handleToggleExpand}
                        onToggleSelect={toggleSelect}
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