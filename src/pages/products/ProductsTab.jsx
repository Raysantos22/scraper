import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import {
  LayoutGrid, Table2, Search, Plus, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, Download, Layers, Upload, Loader2, X
} from 'lucide-react'
import ProductEditPage, { parseImages, StockBadge } from './ProductEditPage'
import { CsvOverrideUploadModal, ImportProgressToast, runBatches } from './CsvOverrideUploadModal'

const PAGE_SIZE = 50

// ─── Abort-safe fetch wrapper ─────────────────────────────────────────────────
// Returns { data, count, error } and accepts a signal for cancellation
async function safeFetch(queryFn, signal) {
  try {
    const result = await queryFn()
    if (signal?.aborted) return { data: null, count: null, error: new Error('aborted') }
    return result
  } catch (e) {
    return { data: null, count: null, error: e }
  }
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
async function exportProductsCsv(supabase, {
  supplierId, category, stock, search, minQty, minPrice, maxPrice
} = {}) {
  let allRows = [], from = 0
  const BATCH = 1000
  while (true) {
    let q = supabase.from('products').select('*').range(from, from + BATCH - 1)
    if (supplierId) q = q.eq('supplier_id', supplierId)
    if (category)   q = q.eq('category', category)
    if (stock === 'in')  q = q.gt('stock', 0)
    if (stock === 'out') q = q.eq('stock', 0)
    if (stock === 'low') q = q.gt('stock', 0).lt('stock', 50)
    if (search)    q = q.or(`title.ilike.%${search}%,sku.ilike.%${search}%,brand.ilike.%${search}%`)
    if (minQty   != null && minQty   !== '') q = q.gte('stock', parseInt(minQty))
    if (minPrice != null && minPrice !== '') q = q.gte('price', parseFloat(minPrice))
    if (maxPrice != null && maxPrice !== '') q = q.lte('price', parseFloat(maxPrice))
    q = q.order('created_at', { ascending: false })
    const { data, error } = await q
    if (error || !data?.length) break
    allRows = [...allRows, ...data]
    if (data.length < BATCH) break
    from += BATCH
  }
  if (!allRows.length) return
  const headers = Object.keys(allRows[0])
  const esc = v => {
    if (Array.isArray(v)) v = v.join(' | ')
    else if (typeof v === 'object' && v !== null) v = JSON.stringify(v)
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const csv = [headers.join(','), ...allRows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `products_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

// ─── Small UI helpers ─────────────────────────────────────────────────────────
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
        : <p className="text-xl font-medium text-gray-900">{value}</p>
      }
    </div>
  )
}

// ─── Generic dropdown (memoized) ──────────────────────────────────────────────
const FilterDropdown = React.memo(function FilterDropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg transition-colors ${
          value ? 'border-red-300 text-red-600 bg-red-50' : 'border-gray-200 text-gray-400 hover:bg-gray-50'
        }`}>
        {value || label}<ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-100 rounded-xl shadow-lg py-1 min-w-max max-h-60 overflow-y-auto">
          <button
            onClick={() => { onChange(''); setOpen(false) }}
            className="w-full text-left px-4 py-2 text-xs text-gray-400 hover:bg-gray-50">
            All
          </button>
          {options.map(opt => (
            <button
              key={opt} onClick={() => { onChange(opt); setOpen(false) }}
              className={`w-full text-left px-4 py-2 text-xs hover:bg-gray-50 ${value === opt ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
})

const MIN_QTY_PRESETS = [
  { label: 'All quantities', value: '' },
  { label: '≥ 3 in stock',   value: '3' },
  { label: '≥ 5 in stock',   value: '5' },
  { label: '≥ 10 in stock',  value: '10' },
  { label: '≥ 25 in stock',  value: '25' },
  { label: '≥ 50 in stock',  value: '50' },
  { label: '≥ 100 in stock', value: '100' },
]

const MinQtyDropdown = React.memo(function MinQtyDropdown({ value, onChange }) {
  const [open, setOpen]     = useState(false)
  const [custom, setCustom] = useState('')
  const ref                 = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const activePreset = MIN_QTY_PRESETS.find(p => p.value === value)
  const label = activePreset ? activePreset.label : value ? `≥ ${value} in stock` : 'Min Qty'
  function applyCustom() {
    const v = parseInt(custom)
    if (!isNaN(v) && v > 0) { onChange(String(v)); setCustom(''); setOpen(false) }
  }
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg transition-colors ${
          value ? 'border-red-300 text-red-600 bg-red-50' : 'border-gray-200 text-gray-400 hover:bg-gray-50'
        }`}>
        {label}<ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-100 rounded-xl shadow-lg py-1 min-w-[170px]">
          {MIN_QTY_PRESETS.map(p => (
            <button key={p.value} onClick={() => { onChange(p.value); setOpen(false) }}
              className={`w-full text-left px-4 py-2 text-xs hover:bg-gray-50 flex items-center justify-between ${
                value === p.value ? 'text-red-600 font-medium' : 'text-gray-700'
              }`}>
              {p.label}
              {value === p.value && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
            </button>
          ))}
          <div className="px-3 pt-1.5 pb-2 border-t border-gray-50 mt-1">
            <p className="text-[10px] text-gray-400 mb-1.5">Custom minimum</p>
            <div className="flex gap-1.5">
              <input
                type="number" min="1" value={custom}
                onChange={e => setCustom(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyCustom()}
                placeholder="e.g. 7"
                className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 placeholder-gray-300 w-0"
              />
              <button onClick={applyCustom}
                className="px-2.5 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors shrink-0">
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

const PRICE_PRESETS = {
  min: [
    { label: 'Any price', value: '' },
    { label: '≥ $10',  value: '10'  },
    { label: '≥ $25',  value: '25'  },
    { label: '≥ $50',  value: '50'  },
    { label: '≥ $100', value: '100' },
    { label: '≥ $250', value: '250' },
    { label: '≥ $500', value: '500' },
  ],
  max: [
    { label: 'Any price', value: '' },
    { label: '≤ $10',  value: '10'  },
    { label: '≤ $25',  value: '25'  },
    { label: '≤ $50',  value: '50'  },
    { label: '≤ $100', value: '100' },
    { label: '≤ $250', value: '250' },
    { label: '≤ $500', value: '500' },
  ],
}

const PriceDropdown = React.memo(function PriceDropdown({ mode, value, onChange }) {
  const [open, setOpen]     = useState(false)
  const [custom, setCustom] = useState('')
  const ref                 = useRef(null)
  const presets             = PRICE_PRESETS[mode]
  const symbol              = mode === 'min' ? '≥' : '≤'
  const defaultLabel        = mode === 'min' ? 'Min Price' : 'Max Price'
  useEffect(() => {
    if (!open) return
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const activePreset = presets.find(p => p.value === value)
  const label = activePreset?.value ? activePreset.label : value ? `${symbol} $${value}` : defaultLabel
  function applyCustom() {
    const v = parseFloat(custom)
    if (!isNaN(v) && v >= 0) { onChange(String(v)); setCustom(''); setOpen(false) }
  }
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg transition-colors ${
          value ? 'border-red-300 text-red-600 bg-red-50' : 'border-gray-200 text-gray-400 hover:bg-gray-50'
        }`}>
        {label}<ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-100 rounded-xl shadow-lg py-1 min-w-[160px]">
          {presets.map(p => (
            <button key={p.value} onClick={() => { onChange(p.value); setOpen(false) }}
              className={`w-full text-left px-4 py-2 text-xs hover:bg-gray-50 flex items-center justify-between ${
                value === p.value ? 'text-red-600 font-medium' : 'text-gray-700'
              }`}>
              {p.label}
              {value === p.value && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
            </button>
          ))}
          <div className="px-3 pt-1.5 pb-2 border-t border-gray-50 mt-1">
            <p className="text-[10px] text-gray-400 mb-1.5">Custom amount</p>
            <div className="flex gap-1.5">
              <div className="relative flex-1 w-0">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-300 text-xs">$</span>
                <input type="number" min="0" step="0.01" value={custom}
                  onChange={e => setCustom(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && applyCustom()}
                  placeholder="0.00"
                  className="w-full pl-5 pr-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 placeholder-gray-300"
                />
              </div>
              <button onClick={applyCustom}
                className="px-2.5 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors shrink-0">
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

// ─── Inline variant rows (memoized) ──────────────────────────────────────────
const VariantRows = React.memo(function VariantRows({ productId, onSelect }) {
  const [variants, setVariants] = useState(null)
  useEffect(() => {
    let cancelled = false
    supabase.from('variants').select('*').eq('product_id', productId)
      .then(({ data }) => { if (!cancelled) setVariants(data || []) })
    return () => { cancelled = true }
  }, [productId])

  if (variants === null) {
    return (
      <tr>
        <td colSpan={8} className="bg-blue-50/30 py-2">
          <div className="h-3 bg-blue-100 rounded animate-pulse w-40 ml-16" />
        </td>
      </tr>
    )
  }

  return variants.map(v => {
    const vImg = parseImages(v.images)[0] || null
    return (
      <tr key={v.variant_id}
        onClick={() => onSelect?.()}
        className="border-b border-blue-100/40 last:border-none bg-blue-50/15 hover:bg-blue-50/50 transition-colors cursor-pointer">
        <td className="py-2.5 pl-3 pr-2">
          <div className="flex justify-end">
            {vImg
              ? <img src={vImg} alt="" className="w-7 h-7 rounded-md object-cover border border-blue-100/60" loading="lazy" />
              : <div className="w-7 h-7 rounded-md bg-blue-100/50 border border-blue-100 flex items-center justify-center text-[8px] font-bold text-blue-400">V</div>
            }
          </div>
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

// ─── Freshness helpers ────────────────────────────────────────────────────────
function daysSince(dateStr) {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 864e5)
}
function freshnessRowClass(updatedAt) {
  const days = daysSince(updatedAt)
  if (days === null || days === 0) return ''
  if (days <= 7) return 'bg-yellow-50/80'
  return 'bg-red-50/80'
}

// ─── Module-level stats cache ─────────────────────────────────────────────────
const STATS_CACHE = {
  ready: false, total: 0, inStock: 0, outStock: 0, avgPrice: '0.00', totalItems: 0,
}

// ─── Product row (memoized to avoid full list re-render on expand toggle) ────
const ProductRow = React.memo(function ProductRow({
  p, supplier, isOverridden, expanded, onEdit, onToggleExpand
}) {
  const imgs      = parseImages(p.images)
  const isVariant = p.product_type === 'variation_parent'
  return (
    <React.Fragment>
      <tr
        onClick={() => onEdit(p.product_id)}
        className={`border-b border-gray-50 transition-colors cursor-pointer last:border-none group
          ${freshnessRowClass(p.updated_at) || 'hover:bg-gray-50/80'}`}>
        <td className="px-3 py-2.5">
          {imgs[0]
            ? <img src={imgs[0]} alt="" className="w-9 h-9 rounded-lg object-cover bg-gray-100" loading="lazy" />
            : <div className="w-9 h-9 rounded-lg bg-gray-100" />}
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-start gap-2">
            {isVariant && (
              <button onClick={e => onToggleExpand(e, p.product_id)}
                className={`mt-0.5 shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors ${expanded ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'}`}
                title={expanded ? 'Collapse' : 'Expand variants'}>
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
  const [editingId, setEditingId]             = useState(null)
  const [products, setProducts]               = useState([])
  const [suppliers, setSuppliers]             = useState({})
  const [loading, setLoading]                 = useState(true)
  const [searchLoading, setSearchLoading]     = useState(false)
  const [statsLoading, setStatsLoading]       = useState(!STATS_CACHE.ready)
  const [view, setView]                       = useState('table')
  const [exporting, setExporting]             = useState(false)
  const [expandedRows, setExpandedRows]       = useState(new Set())
  const [filterFreshness, setFilterFreshness] = useState('')
  const [showCsvUpload, setShowCsvUpload]     = useState(false)
  const [importProgress, setImportProgress]   = useState(null)
  const [totalCount, setTotalCount]           = useState(STATS_CACHE.total)
  const [inStockCount, setInStockCount]       = useState(STATS_CACHE.inStock)
  const [outStockCount, setOutStockCount]     = useState(STATS_CACHE.outStock)
  const [avgPrice, setAvgPrice]               = useState(STATS_CACHE.avgPrice)
  const [totalItems, setTotalItems]           = useState(STATS_CACHE.totalItems)
  const [overrideSkus, setOverrideSkus]       = useState(new Set())
  const [page, setPage]                       = useState(0)
  const [filteredCount, setFilteredCount]     = useState(0)
  const pageCount = Math.ceil(filteredCount / PAGE_SIZE)

  // ── Search: two-stage — instant optimistic, then committed ──
  const [searchInput, setSearchInput]   = useState('')
  const [search, setSearch]             = useState('')

  const [filterCategory, setFilterCategory]   = useState('')
  const [filterStock, setFilterStock]         = useState('')
  const [filterSupplier, setFilterSupplier]   = useState('')
  const [filterMinQty, setFilterMinQty]       = useState('')
  const [filterMinPrice, setFilterMinPrice]   = useState('')
  const [filterMaxPrice, setFilterMaxPrice]   = useState('')
  const [sortBy, setSortBy]                   = useState('created_at')
  const [sortDir, setSortDir]                 = useState('desc')
  const [categories, setCategories]           = useState([])
  const [supplierOptions, setSupplierOptions] = useState([])

  // ── AbortController refs (cancel stale fetches instantly) ──
  const pageAbortRef  = useRef(null)
  const statsAbortRef = useRef(null)
  const statsKeyRef   = useRef(null)   // last filter key for which stats were loaded

  // ── Load meta once ──
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

  // ── Debounce search input: 300ms (was 600ms) ──
  useEffect(() => {
    if (searchInput !== search) setSearchLoading(true)
    const t = setTimeout(() => {
      setSearch(searchInput)
      setSearchLoading(false)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // ── Reset page when filters change ──
  useEffect(() => {
    setPage(0)
  }, [search, filterCategory, filterStock, filterSupplier,
      filterMinQty, filterMinPrice, filterMaxPrice, filterFreshness, sortBy, sortDir])

  const hasFilters = !!(filterCategory || filterStock || filterSupplier || search ||
    filterMinQty || filterMinPrice || filterMaxPrice || filterFreshness)

  const filterKey = useMemo(() =>
    JSON.stringify({ search, filterCategory, filterStock, filterSupplier,
      filterMinQty, filterMinPrice, filterMaxPrice, filterFreshness }),
    [search, filterCategory, filterStock, filterSupplier,
     filterMinQty, filterMinPrice, filterMaxPrice, filterFreshness]
  )

  // ── Core query builder ──
  // Kept as a plain function (not useCallback) — takes a Supabase query and applies filters.
  // This avoids stale closure issues without adding to dep arrays.
  function applyFilters(q, opts = {}) {
    const {
      s = search, cat = filterCategory, stk = filterStock, sup = filterSupplier,
      mq = filterMinQty, mnp = filterMinPrice, mxp = filterMaxPrice, fr = filterFreshness,
    } = opts
    if (s)   q = q.or(`title.ilike.%${s}%,sku.ilike.%${s}%,brand.ilike.%${s}%`)
    if (cat) q = q.eq('category', cat)
    if (stk === 'in')  q = q.gt('stock', 0)
    if (stk === 'out') q = q.eq('stock', 0)
    if (stk === 'low') q = q.gt('stock', 0).lt('stock', 50)
    if (sup) q = q.eq('supplier_id', sup)
    if (mq  !== '') q = q.gte('stock', parseInt(mq))
    if (mnp !== '') q = q.gte('price', parseFloat(mnp))
    if (mxp !== '') q = q.lte('price', parseFloat(mxp))
    const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString()
    if (fr === 'Updated within last 24hrs') q = q.gte('updated_at', daysAgo(1))
    if (fr === '1-7 days') q = q.lt('updated_at', daysAgo(1)).gte('updated_at', daysAgo(7))
    if (fr === 'Older than 7 days') q = q.lt('updated_at', daysAgo(7))
    return q
  }

  // ── Page fetch — aborts previous, only fetches current page ──
  const fetchPage = useCallback(async (
    opts = {},   // allow caller to pass snapshot of filter state
    pg   = page,
    sb   = sortBy,
    sd   = sortDir
  ) => {
    // Cancel any in-flight page fetch
    pageAbortRef.current?.abort()
    const controller = new AbortController()
    pageAbortRef.current = controller

    setLoading(true)

    const q = applyFilters(
      supabase.from('products').select(
        'product_id,sku,title,price,stock,category,brand,images,supplier_id,product_type,updated_at',
        { count: 'exact' }
      ),
      opts
    )
      .order(sb, { ascending: sd === 'asc' })
      .range(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE - 1)

    const { data, count, error } = await q
    if (controller.signal.aborted) return

    if (!error) {
      setProducts(data || [])
      setFilteredCount(count || 0)
    }
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sortBy, sortDir, filterKey])

  // ── Stats fetch — skipped if filter key unchanged, aborts previous ──
  const fetchStats = useCallback(async (opts = {}) => {
    const key = filterKey

    // Return cached baseline stats immediately
    if (!hasFilters && STATS_CACHE.ready) {
      setTotalCount(STATS_CACHE.total)
      setInStockCount(STATS_CACHE.inStock)
      setOutStockCount(STATS_CACHE.outStock)
      setAvgPrice(STATS_CACHE.avgPrice)
      setTotalItems(STATS_CACHE.totalItems)
      setStatsLoading(false)
      return
    }

    if (statsKeyRef.current === key) return   // same filters → skip

    statsAbortRef.current?.abort()
    const controller = new AbortController()
    statsAbortRef.current = controller
    statsKeyRef.current   = key
    setStatsLoading(true)

    const af = q => applyFilters(q, opts)

    // Run 3 counts + 1 price select in parallel (skip variant count under filters)
    const [
      { count: total },
      { count: inStock },
      { count: outStock },
      { data: priceRows },
      variantResult,
    ] = await Promise.all([
      af(supabase.from('products').select('*', { count: 'exact', head: true })),
      af(supabase.from('products').select('*', { count: 'exact', head: true })).gt('stock', 0),
      af(supabase.from('products').select('*', { count: 'exact', head: true })).eq('stock', 0),
      // Only fetch prices for up to 5000 rows to keep it fast; good enough for avg
      af(supabase.from('products').select('price').limit(5000)),
      hasFilters
        ? Promise.resolve({ count: 0 })
        : supabase.from('variants').select('*', { count: 'exact', head: true }),
    ])

    if (controller.signal.aborted) return

    const avg = priceRows?.length
      ? (priceRows.reduce((a, b) => a + parseFloat(b.price || 0), 0) / priceRows.length).toFixed(2)
      : '0.00'

    const ti = hasFilters
      ? (total || 0)
      : (total || 0) + (variantResult?.count || 0)

    if (!hasFilters) {
      Object.assign(STATS_CACHE, { ready: true, total: total || 0, inStock: inStock || 0,
        outStock: outStock || 0, avgPrice: avg, totalItems: ti })
    }

    setTotalCount(total      || 0)
    setInStockCount(inStock  || 0)
    setOutStockCount(outStock || 0)
    setAvgPrice(avg)
    setTotalItems(ti)
    setStatsLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, hasFilters])

  // ── Trigger fetches ──
  useEffect(() => { fetchPage() }, [fetchPage])
  useEffect(() => { fetchStats() }, [fetchStats])

  // ── Stable callbacks so child rows don't re-render ──
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

  function SortTh({ col, children }) {
    const active = sortBy === col
    return (
      <th onClick={() => toggleSort(col)}
        className="text-left px-4 py-3 text-xs text-gray-400 font-medium cursor-pointer select-none hover:text-gray-600 transition-colors">
        <span className="flex items-center gap-1">
          {children}
          <span className="text-gray-300 text-[10px]">{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
        </span>
      </th>
    )
  }

  function clearFilters() {
    setFilterCategory(''); setFilterStock(''); setFilterSupplier('')
    setSearchInput(''); setSearch(''); setFilterMinQty('')
    setFilterMinPrice(''); setFilterMaxPrice(''); setFilterFreshness('')
  }

  function refreshOverrides() {
    supabase.from('product_overrides').select('sku').then(({ data }) => {
      if (data) setOverrideSkus(new Set(data.map(r => r.sku)))
    })
  }

  async function handleImportStart({ rows, batches }) {
    setImportProgress({ status: 'running', done: 0, total: rows.length, failed: 0, failedSkus: [] })
    await runBatches(batches, (batchSize, hadError, _errMsg, skus) => {
      setImportProgress(p => ({
        ...p,
        done:       p.done + batchSize,
        failed:     p.failed + (hadError ? batchSize : 0),
        failedSkus: hadError ? [...p.failedSkus, ...skus] : p.failedSkus,
      }))
    })
    setImportProgress(p => ({ ...p, status: 'done' }))
    fetchPage()
    refreshOverrides()
  }

  // ── Edit view ──
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

  // ── List view ──
  return (
    <div>
      <CsvOverrideUploadModal
        open={showCsvUpload}
        onClose={() => setShowCsvUpload(false)}
        onImportStart={handleImportStart}
      />
      <ImportProgressToast
        state={importProgress}
        onDismiss={() => setImportProgress(null)}
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search with instant clear button */}
          <div className="relative">
            {searchLoading
              ? <Loader2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
              : <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
            }
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search title, SKU, brand..."
              className="pl-8 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300 placeholder-gray-300 w-52"
            />
            {searchInput && (
              <button
                onClick={() => { setSearchInput(''); setSearch('') }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors">
                <X size={11} />
              </button>
            )}
          </div>
          <FilterDropdown label="Category" options={categories} value={filterCategory} onChange={setFilterCategory} />
          <FilterDropdown label="Stock" options={['in', 'out', 'low']} value={filterStock} onChange={setFilterStock} />
          <FilterDropdown
            label="Supplier"
            options={supplierOptions.map(s => s.name)}
            value={filterSupplier ? (supplierOptions.find(s => s.id === filterSupplier)?.name || '') : ''}
            onChange={name => setFilterSupplier(supplierOptions.find(s => s.name === name)?.id || '')}
          />
          <MinQtyDropdown value={filterMinQty} onChange={setFilterMinQty} />
          <PriceDropdown mode="min" value={filterMinPrice} onChange={setFilterMinPrice} />
          <PriceDropdown mode="max" value={filterMaxPrice} onChange={setFilterMaxPrice} />
          <FilterDropdown
            label="Updated"
            options={['Updated within last 24hrs', '1-7 days', 'Older than 7 days']}
            value={filterFreshness}
            onChange={setFilterFreshness}
          />
          {hasFilters && (
            <button onClick={clearFilters} className="text-xs text-red-500 hover:underline">Clear all</button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-1">
            <button onClick={() => setView('grid')} className={`p-1.5 rounded-md transition-colors ${view === 'grid' ? 'bg-white shadow-sm text-gray-700' : 'text-gray-400 hover:text-gray-600'}`}><LayoutGrid size={13} /></button>
            <button onClick={() => setView('table')} className={`p-1.5 rounded-md transition-colors ${view === 'table' ? 'bg-white shadow-sm text-gray-700' : 'text-gray-400 hover:text-gray-600'}`}><Table2 size={13} /></button>
          </div>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">
            <Plus size={13} /> Add Product
          </button>
          <button
            onClick={async () => {
              setExporting(true)
              await exportProductsCsv(supabase, {
                supplierId: filterSupplier  || null,
                category:   filterCategory  || null,
                stock:      filterStock     || null,
                search:     search          || null,
                minQty:     filterMinQty    || null,
                minPrice:   filterMinPrice  || null,
                maxPrice:   filterMaxPrice  || null,
              })
              setExporting(false)
            }}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors">
            <Download size={13} />{exporting ? 'Exporting…' : hasFilters ? 'Export filtered CSV' : 'Export CSV'}
          </button>
          <button
            onClick={() => setShowCsvUpload(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            <Upload size={13} /> Import Overrides CSV
          </button>
        </div>
      </div>

      <div className="p-5">
        {/* Summary cards */}
        <div className="flex gap-3 mb-5">
          <SummaryCard label="Total products"   value={totalCount.toLocaleString()}   loading={statsLoading} />
          <SummaryCard label="In stock"          value={inStockCount.toLocaleString()}  loading={statsLoading} />
          <SummaryCard label="Out of stock"      value={outStockCount.toLocaleString()} loading={statsLoading} />
          <SummaryCard label="Avg. price"        value={`$${avgPrice}`}                 loading={statsLoading} />
          <SummaryCard
            label={hasFilters ? 'Matching items' : 'Total items (incl. variants)'}
            value={totalItems.toLocaleString()}
            loading={statsLoading}
          />
        </div>

        {/* Table view */}
        {view === 'table' ? (
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-xs table-fixed">
              <colgroup>
                <col style={{ width: '52px' }} />
                <col style={{ width: '32%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '10%' }} />
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
                        <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded animate-pulse w-4/5 mb-1.5" /><div className="h-2.5 bg-gray-50 rounded animate-pulse w-2/5" /></td>
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
                        key={p.product_id}
                        p={p}
                        supplier={suppliers[p.supplier_id]}
                        isOverridden={overrideSkus.has(p.sku)}
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
          /* Grid view */
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
                  const imgs         = parseImages(p.images)
                  const supplier     = suppliers[p.supplier_id]
                  const isVariant    = p.product_type === 'variation_parent'
                  const isOverridden = overrideSkus.has(p.sku)
                  return (
                    <div key={p.product_id}
                      onClick={() => setEditingId(p.product_id)}
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
              Showing {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, filteredCount).toLocaleString()} of {filteredCount.toLocaleString()} products
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(0)} disabled={page === 0} className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 disabled:opacity-30">«</button>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 disabled:opacity-30">
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
              <button onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 disabled:opacity-30">
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