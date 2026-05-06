import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import {
  LayoutGrid, Table2, Search, Plus, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, Download, ArrowLeft, Save, Trash2,
  X, ExternalLink, Layers, GripVertical, ImagePlus, Check,
  AlertCircle, Tag, Package, Pencil
} from 'lucide-react'

const PAGE_SIZE = 50

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
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g,'""')}"` : s
  }
  const csv = [headers.join(','), ...allRows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `products_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.csv`
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseImages(raw) {
  try { return typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []) } catch { return [] }
}

function StockBadge({ stock }) {
  if (stock === 0) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-100 whitespace-nowrap">Out of stock</span>
  if (stock < 2)  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-yellow-50 text-yellow-700 border border-yellow-100 whitespace-nowrap">Low stock</span>
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 border border-green-100 whitespace-nowrap">In stock</span>
}

function SummaryCard({ label, value }) {
  return (
    <div className="flex-1 min-w-0 bg-gray-50 rounded-lg px-4 py-3">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-xl font-medium text-gray-900">{value}</p>
    </div>
  )
}

function FilterDropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg transition-colors ${
          value ? 'border-red-300 text-red-600 bg-red-50' : 'border-gray-200 text-gray-400 hover:bg-gray-50'
        }`}>
        {value || label}<ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-100 rounded-xl shadow-lg py-1 min-w-max max-h-60 overflow-y-auto">
          <button onClick={() => { onChange(''); setOpen(false) }} 
  className="w-full text-left px-4 py-2 text-xs text-gray-400 hover:bg-gray-50">All</button>
          {options.map(opt => (
            <button key={opt} onClick={() => { onChange(opt); setOpen(false) }}
              className={`w-full text-left px-4 py-2 text-xs hover:bg-gray-50 ${value === opt ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Min Qty Dropdown ─────────────────────────────────────────────────────────
// Presets: "All", "≥ 3", "≥ 5", "≥ 10", "≥ 25", "≥ 50", or custom typed
const MIN_QTY_PRESETS = [
  { label: 'All quantities', value: '' },
  { label: '≥ 3 in stock',   value: '3' },
  { label: '≥ 5 in stock',   value: '5' },
  { label: '≥ 10 in stock',  value: '10' },
  { label: '≥ 25 in stock',  value: '25' },
  { label: '≥ 50 in stock',  value: '50' },
  { label: '≥ 100 in stock', value: '100' },
]

function MinQtyDropdown({ value, onChange }) {
  const [open, setOpen]       = useState(false)
  const [custom, setCustom]   = useState('')
  const ref                   = useRef(null)

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
            <button
              key={p.value}
              onClick={() => { onChange(p.value); setOpen(false) }}
              className={`w-full text-left px-4 py-2 text-xs hover:bg-gray-50 flex items-center justify-between ${
                value === p.value ? 'text-red-600 font-medium' : 'text-gray-700'
              }`}>
              {p.label}
              {value === p.value && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
            </button>
          ))}
          {/* Custom input row */}
          <div className="px-3 pt-1.5 pb-2 border-t border-gray-50 mt-1">
            <p className="text-[10px] text-gray-400 mb-1.5">Custom minimum</p>
            <div className="flex gap-1.5">
              <input
                type="number"
                min="1"
                value={custom}
                onChange={e => setCustom(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyCustom()}
                placeholder="e.g. 7"
                className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 placeholder-gray-300 w-0"
              />
              <button
                onClick={applyCustom}
                className="px-2.5 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors shrink-0">
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Price Dropdown ───────────────────────────────────────────────────────────
// mode: 'min' (price ≥ X) or 'max' (price ≤ X)
const PRICE_PRESETS = {
  min: [
    { label: 'Any price',    value: '' },
    { label: '≥ $10',        value: '10' },
    { label: '≥ $25',        value: '25' },
    { label: '≥ $50',        value: '50' },
    { label: '≥ $100',       value: '100' },
    { label: '≥ $250',       value: '250' },
    { label: '≥ $500',       value: '500' },
  ],
  max: [
    { label: 'Any price',    value: '' },
    { label: '≤ $10',        value: '10' },
    { label: '≤ $25',        value: '25' },
    { label: '≤ $50',        value: '50' },
    { label: '≤ $100',       value: '100' },
    { label: '≤ $250',       value: '250' },
    { label: '≤ $500',       value: '500' },
  ],
}

function PriceDropdown({ mode, value, onChange }) {
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
  const label = activePreset?.value
    ? activePreset.label
    : value ? `${symbol} $${value}` : defaultLabel

  function applyCustom() {
    const v = parseFloat(custom)
    if (!isNaN(v) && v >= 0) { onChange(String(v)); setCustom(''); setOpen(false) }
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
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-100 rounded-xl shadow-lg py-1 min-w-[160px]">
          {presets.map(p => (
            <button
              key={p.value}
              onClick={() => { onChange(p.value); setOpen(false) }}
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
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={custom}
                  onChange={e => setCustom(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && applyCustom()}
                  placeholder="0.00"
                  className="w-full pl-5 pr-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 placeholder-gray-300"
                />
              </div>
              <button
                onClick={applyCustom}
                className="px-2.5 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors shrink-0">
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Section Card ─────────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
        {Icon && <Icon size={14} className="text-gray-400" />}
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ─── Field ────────────────────────────────────────────────────────────────────
function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text', className = '' }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-200 placeholder-gray-300 text-gray-800 transition-colors ${className}`}
    />
  )
}

function Textarea({ value, onChange, placeholder, rows = 4 }) {
  return (
    <textarea
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-200 placeholder-gray-300 text-gray-800 resize-none transition-colors"
    />
  )
}

// ─── Image Manager ────────────────────────────────────────────────────────────
function ImageManager({ images, onChange }) {
  const [newUrl, setNewUrl] = useState('')
  const [active, setActive] = useState(0)

  function addUrl() {
    const url = newUrl.trim()
    if (!url) return
    onChange([...images, url])
    setNewUrl('')
    setActive(images.length)
  }

  function remove(i) {
    const next = images.filter((_, idx) => idx !== i)
    onChange(next)
    setActive(Math.min(active, next.length - 1))
  }

  function moveUp(i) {
    if (i === 0) return
    const next = [...images]
    ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
    onChange(next)
    setActive(i - 1)
  }

  return (
    <div className="space-y-3">
      <div className="relative bg-gray-50 rounded-xl border border-gray-100 h-56 flex items-center justify-center overflow-hidden">
        {images[active]
          ? <img src={images[active]} alt="" className="max-h-full max-w-full object-contain p-4" />
          : <div className="flex flex-col items-center gap-2 text-gray-300">
              <ImagePlus size={32} />
              <span className="text-xs">No images yet</span>
            </div>
        }
        {images[active] && (
          <button onClick={() => remove(active)}
            className="absolute top-2 right-2 w-7 h-7 bg-white rounded-full shadow border border-gray-100 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors">
            <X size={12} />
          </button>
        )}
      </div>

      {images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <div key={i} className="relative shrink-0 group">
              <button onClick={() => setActive(i)}
                className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors ${active === i ? 'border-red-400' : 'border-transparent'}`}>
                <img src={img} alt="" className="w-full h-full object-cover" />
              </button>
              <div className="absolute -top-1 -right-1 hidden group-hover:flex gap-0.5">
                {i > 0 && (
                  <button onClick={() => moveUp(i)}
                    className="w-4 h-4 bg-white rounded-full shadow border border-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-800 text-[8px]">↑</button>
                )}
                <button onClick={() => remove(i)}
                  className="w-4 h-4 bg-white rounded-full shadow border border-gray-200 flex items-center justify-center text-red-400">
                  <X size={8} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="url"
          value={newUrl}
          onChange={e => setNewUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addUrl()}
          placeholder="Paste image URL and press Enter..."
          className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 placeholder-gray-300"
        />
        <button onClick={addUrl}
          className="px-3 py-2 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors">
          Add
        </button>
      </div>
    </div>
  )
}

// ─── Variant Editor Row ────────────────────────────────────────────────────────
function VariantRow({ variant, onChange, onDelete }) {
  return (
    <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100 group">
      <GripVertical size={14} className="text-gray-300 mt-2.5 shrink-0 cursor-grab" />

      <div className="shrink-0">
        {parseImages(variant.images)[0]
          ? <img src={parseImages(variant.images)[0]} className="w-10 h-10 rounded-lg object-cover border border-gray-200" alt="" />
          : <div className="w-10 h-10 rounded-lg bg-gray-200 border border-gray-100 flex items-center justify-center text-gray-400 text-[9px] font-bold">V</div>
        }
      </div>

      <div className="flex-1 grid grid-cols-2 gap-2 min-w-0">
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Name</label>
          <input value={variant.variant_name ?? ''} onChange={e => onChange({ ...variant, variant_name: e.target.value })}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400" />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">SKU</label>
          <input value={variant.variant_sku ?? ''} onChange={e => onChange({ ...variant, variant_sku: e.target.value })}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 font-mono" />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Price</label>
          <input type="number" step="0.01" value={variant.price ?? ''} onChange={e => onChange({ ...variant, price: e.target.value })}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400" />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Stock</label>
          <input type="number" value={variant.stock ?? ''} onChange={e => onChange({ ...variant, stock: parseInt(e.target.value) || 0 })}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400" />
        </div>
        {variant.option1_name && (
          <div className="col-span-2">
            <label className="text-[10px] text-gray-400 mb-1 block">{variant.option1_name}</label>
            <input value={variant.option1_value ?? ''} onChange={e => onChange({ ...variant, option1_value: e.target.value })}
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400" />
          </div>
        )}
      </div>

      <button onClick={onDelete}
        className="shrink-0 mt-1 p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

// ─── Product Edit Page ────────────────────────────────────────────────────────
function ProductEditPage({ productId, suppliers, categories, onBack, onSaved }) {
  const [product, setProduct]   = useState(null)
  const [variants, setVariants] = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: p } = await supabase.from('products').select('*').eq('product_id', productId).single()
      if (p) {
        setProduct({ ...p, images: parseImages(p.images) })
        if (p.product_type === 'variation_parent') {
          const { data: vs } = await supabase.from('variants').select('*').eq('product_id', productId)
          setVariants(vs || [])
        }
      }
      setLoading(false)
    }
    load()
  }, [productId])

  function set(field, value) {
    setProduct(p => ({ ...p, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const payload = {
        title:             product.title,
        brand:             product.brand,
        sku:               product.sku,
        price:             parseFloat(product.price) || 0,
        stock:             parseInt(product.stock) || 0,
        category:          product.category,
        description:       product.description,
        short_description: product.short_description,
        product_url:       product.product_url,
        images:            JSON.stringify(product.images),
        updated_at:        new Date().toISOString(),
      }
      const { error: err } = await supabase.from('products').update(payload).eq('product_id', productId)
      if (err) throw err

      for (const v of variants) {
        await supabase.from('variants').update({
          variant_name:  v.variant_name,
          variant_sku:   v.variant_sku,
          price:         parseFloat(v.price) || 0,
          stock:         parseInt(v.stock) || 0,
          option1_value: v.option1_value,
          option2_value: v.option2_value,
          updated_at:    new Date().toISOString(),
        }).eq('variant_id', v.variant_id)
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      onSaved && onSaved()
    } catch (e) {
      setError(e.message || 'Save failed')
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        {[1,2,3].map(i => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  if (!product) {
    return <div className="p-8 text-center text-gray-400">Product not found.</div>
  }

  const imgs = product.images || []

  return (
    <div className="min-h-full bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors">
            <ArrowLeft size={14} /> Back to products
          </button>
          <span className="text-gray-200">|</span>
          <div className="flex items-center gap-2">
            <Package size={13} className="text-gray-400" />
            <span className="text-xs font-medium text-gray-700 truncate max-w-xs">{product.title}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {error && (
            <div className="flex items-center gap-1.5 text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">
              <AlertCircle size={12} /> {error}
            </div>
          )}
          {saved && (
            <div className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-100">
              <Check size={12} /> Saved
            </div>
          )}
          {product.product_url && (
            <a href={product.product_url} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors">
              <ExternalLink size={12} /> View store
            </a>
          )}
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50">
            <Save size={12} />
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="p-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-3 gap-5">
          <div className="col-span-2 space-y-5">
            <Section title="Product Info" icon={Pencil}>
              <div className="space-y-4">
                <Field label="Title">
                  <Input value={product.title} onChange={v => set('title', v)} placeholder="Product title" />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Brand">
                    <Input value={product.brand} onChange={v => set('brand', v)} placeholder="Brand name" />
                  </Field>
                  <Field label="SKU">
                    <Input value={product.sku} onChange={v => set('sku', v)} placeholder="SKU" className="font-mono" />
                  </Field>
                </div>
                <Field label="Description">
                  <Textarea value={product.description} onChange={v => set('description', v)} placeholder="Full product description…" rows={5} />
                </Field>
                <Field label="Short Description">
                  <Textarea value={product.short_description} onChange={v => set('short_description', v)} placeholder="Brief summary…" rows={2} />
                </Field>
                <Field label="Product URL">
                  <Input value={product.product_url} onChange={v => set('product_url', v)} placeholder="https://…" type="url" />
                </Field>
              </div>
            </Section>

            <Section title="Images" icon={ImagePlus}>
              <ImageManager images={imgs} onChange={v => set('images', v)} />
            </Section>

            {product.product_type === 'variation_parent' && (
              <Section title="Variants" icon={Layers}>
                {variants.length === 0
                  ? <p className="text-xs text-gray-300 italic py-2">No variants.</p>
                  : (
                    <div className="space-y-2">
                      {variants.map((v, i) => (
                        <VariantRow
                          key={v.variant_id}
                          variant={v}
                          onChange={updated => setVariants(vs => vs.map((x, j) => j === i ? updated : x))}
                          onDelete={() => setVariants(vs => vs.filter((_, j) => j !== i))}
                        />
                      ))}
                    </div>
                  )
                }
              </Section>
            )}
          </div>

          <div className="space-y-5">
            <Section title="Pricing & Stock" icon={Tag}>
              <div className="space-y-4">
                <Field label="Price ($)">
                  <Input type="number" value={product.price} onChange={v => set('price', v)} placeholder="0.00" />
                </Field>
                <Field label="Stock">
                  <Input type="number" value={product.stock} onChange={v => set('stock', v)} placeholder="0" />
                </Field>
                <div className="pt-1">
                  <StockBadge stock={parseInt(product.stock) || 0} />
                </div>
              </div>
            </Section>

            <Section title="Organization" icon={Package}>
              <div className="space-y-4">
                <Field label="Category">
                  <select
                    value={product.category || ''}
                    onChange={e => set('category', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 text-gray-800 bg-white"
                  >
                    <option value="">— None —</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Supplier">
                  <select
                    value={product.supplier_id || ''}
                    onChange={e => set('supplier_id', parseInt(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 text-gray-800 bg-white"
                  >
                    <option value="">— None —</option>
                    {Object.values(suppliers).map(s => (
                      <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Product Type">
                  <Input value={product.product_type || ''} onChange={v => set('product_type', v)} placeholder="e.g. variation_parent" />
                </Field>
              </div>
            </Section>

            <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 space-y-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Meta</p>
              <div className="space-y-1 text-xs text-gray-400">
                <div className="flex justify-between"><span>Product ID</span><span className="font-mono text-gray-600">{product.product_id}</span></div>
                <div className="flex justify-between"><span>Created</span><span>{product.created_at ? new Date(product.created_at).toLocaleDateString() : '—'}</span></div>
                <div className="flex justify-between"><span>Updated</span><span>{product.updated_at ? new Date(product.updated_at).toLocaleDateString() : '—'}</span></div>
                {variants.length > 0 && <div className="flex justify-between"><span>Variants</span><span>{variants.length}</span></div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Variant Sub-Rows (table inline) ─────────────────────────────────────────
function VariantRows({ productId, parentImages, onSelect }) {
  const [variants, setVariants] = useState(null)
  useEffect(() => {
    supabase.from('variants').select('*').eq('product_id', productId)
      .then(({ data }) => setVariants(data || []))
  }, [productId])

  if (variants === null) {
    return <tr><td colSpan={8} className="bg-blue-50/30 py-2"><div className="h-3 bg-blue-100 rounded animate-pulse w-40 ml-16" /></td></tr>
  }

  return variants.map((v, idx) => {
    const vImgs = parseImages(v.images)
    const displayImg = vImgs[0] || parentImages[idx] || null
    return (
      <tr key={v.variant_id} onClick={() => onSelect && onSelect(v)}
        className="border-b border-blue-100/40 last:border-none bg-blue-50/15 hover:bg-blue-50/50 transition-colors cursor-pointer">
        <td className="py-2.5 pl-3 pr-2">
          <div className="flex justify-end">
            {displayImg
              ? <img src={displayImg} alt="" className="w-7 h-7 rounded-md object-cover border border-blue-100/60" />
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
}
function daysSince(dateStr) {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function FreshnessBadge({ updatedAt }) {
  const days = daysSince(updatedAt)
  if (days === null) return null
  if (days === 0) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 border border-green-100 whitespace-nowrap">
      Today
    </span>
  )
  if (days <= 3) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-yellow-50 text-yellow-700 border border-yellow-100 whitespace-nowrap">
      {days}d ago
    </span>
  )
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700 border border-red-100 whitespace-nowrap">
      {days}d ago
    </span>
  )
}
function freshnessRowClass(updatedAt) {
  const days = daysSince(updatedAt)
  if (days === null || days === 0) return ''        // today = no color
  if (days <= 7)  return 'bg-yellow-50/80'          // 1-7 days = yellow
  return 'bg-red-50/80'                             // 7+ days = red
}
// ─── Main Tab ─────────────────────────────────────────────────────────────────
export default function ProductsTab() {
  const [editingId, setEditingId]             = useState(null)
  const [products, setProducts]               = useState([])
  const [suppliers, setSuppliers]             = useState({})
  const [suppliersLoaded, setSuppliersLoaded] = useState(false)
  const [loading, setLoading]                 = useState(true)
  const [view, setView]                       = useState('table')
  const [exporting, setExporting]             = useState(false)
  const [expandedRows, setExpandedRows]       = useState(new Set())
  const [filterFreshness, setFilterFreshness] = useState('') // '' | 'today' | 'warning' | 'stale'
  const [totalCount, setTotalCount]           = useState(0)
  const [inStockCount, setInStockCount]       = useState(0)
  const [outStockCount, setOutStockCount]     = useState(0)
  const [avgPrice, setAvgPrice]               = useState('0.00')

  const [page, setPage]                       = useState(0)
  const [filteredCount, setFilteredCount]     = useState(0)
  const pageCount = Math.ceil(filteredCount / PAGE_SIZE)

  const [searchInput, setSearchInput]         = useState('')
  const [search, setSearch]                   = useState('')
  const [filterCategory, setFilterCategory]   = useState('')
  const [filterStock, setFilterStock]         = useState('')
  const [filterSupplier, setFilterSupplier]   = useState('')
  const [filterMinQty, setFilterMinQty]       = useState('')   // e.g. '3' = stock >= 3
  const [filterMinPrice, setFilterMinPrice]   = useState('')   // e.g. '10' = price >= 10
  const [filterMaxPrice, setFilterMaxPrice]   = useState('')   // e.g. '100' = price <= 100
  const [sortBy, setSortBy]                   = useState('created_at')
  const [sortDir, setSortDir]                 = useState('desc')
  const [categories, setCategories]           = useState([])
  const [supplierOptions, setSupplierOptions] = useState([])
  const globalStats = useRef({ total: 0, inStock: 0, outStock: 0, avgPrice: '0.00' })



  function toggleExpand(e, productId) {
    e.stopPropagation()
    setExpandedRows(prev => {
      const next = new Set(prev)
      next.has(productId) ? next.delete(productId) : next.add(productId)
      return next
    })
  }

  useEffect(() => {
    async function loadMeta() {
      const { data: supps } = await supabase.from('suppliers').select('*')
      const suppMap = {}
      supps?.forEach(s => { suppMap[s.supplier_id] = s })
      setSuppliers(suppMap)
      setSupplierOptions(supps?.map(s => ({ id: String(s.supplier_id), name: s.supplier_name })) || [])
      setSuppliersLoaded(true)
      const { data: cats } = await supabase.from('products').select('category').not('category', 'is', null)
      setCategories([...new Set(cats?.map(r => r.category).filter(Boolean))].sort())
      const [{ count: total }, { count: inStock }, { count: outStock }] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact', head: true }),
        supabase.from('products').select('*', { count: 'exact', head: true }).gt('stock', 0),
        supabase.from('products').select('*', { count: 'exact', head: true }).eq('stock', 0),
      ])
      setTotalCount(total || 0); setInStockCount(inStock || 0); setOutStockCount(outStock || 0)
      const { data: priceRows } = await supabase.from('products').select('price')
      if (priceRows?.length) {
        const avg = priceRows.reduce((a, b) => a + parseFloat(b.price || 0), 0) / priceRows.length
        setAvgPrice(avg.toFixed(2))
        // ← ADD THIS HERE
        globalStats.current = { total: total || 0, inStock: inStock || 0, outStock: outStock || 0, avgPrice: avg.toFixed(2) }
      }
    }
    loadMeta()
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400)
    return () => clearTimeout(t)
  }, [searchInput])

useEffect(() => {
  setPage(0)
}, [search, filterCategory, filterStock, filterSupplier,
    filterMinQty, filterMinPrice, filterMaxPrice, filterFreshness, sortBy, sortDir])
const fetchPage = useCallback(async () => {
  if (!suppliersLoaded) return
  setLoading(true)

  // Build a reusable filter function
function applyFilters(q) {
  if (search)         q = q.or(`title.ilike.%${search}%,sku.ilike.%${search}%,brand.ilike.%${search}%`)
  if (filterCategory) q = q.eq('category', filterCategory)
  if (filterStock === 'in')  q = q.gt('stock', 0)
  if (filterStock === 'out') q = q.eq('stock', 0)
  if (filterStock === 'low') q = q.gt('stock', 0).lt('stock', 50)
  if (filterSupplier) q = q.eq('supplier_id', filterSupplier)
  if (filterMinQty   !== '') q = q.gte('stock', parseInt(filterMinQty))
  if (filterMinPrice !== '') q = q.gte('price', parseFloat(filterMinPrice))
  if (filterMaxPrice !== '') q = q.lte('price', parseFloat(filterMaxPrice))

  // ── Freshness filter ──────────────────────────────────────────────────────
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString()
if (filterFreshness === 'Updated within last 24hrs')   q = q.gte('updated_at', daysAgo(1))   // updated within last 24hrs
if (filterFreshness === '1-7 days') q = q.lt('updated_at', daysAgo(1)).gte('updated_at', daysAgo(7))  // 1-7 days
if (filterFreshness === 'Older than 7 days')   q = q.lt('updated_at', daysAgo(7))    // older than 7 days

  return q  // ← make sure this is here
}

  // Page query
let q = applyFilters(
  supabase.from('products')
    .select('product_id,sku,title,price,stock,category,brand,images,supplier_id,product_type,updated_at', // ← ADD updated_at
      { count: 'exact' })
).order(sortBy, { ascending: sortDir === 'asc' })
   .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  const { data, count, error } = await q
  if (!error) { setProducts(data || []); setFilteredCount(count || 0) }

const hasFilters = search || filterCategory || filterStock || filterSupplier || filterMinQty || filterMinPrice || filterMaxPrice || filterFreshness

if (hasFilters) {
  const [{ count: total }, { count: inStock }, { count: outStock }] = await Promise.all([
    applyFilters(supabase.from('products').select('*', { count: 'exact', head: true })),
    applyFilters(supabase.from('products').select('*', { count: 'exact', head: true })).gt('stock', 0),
    applyFilters(supabase.from('products').select('*', { count: 'exact', head: true })).eq('stock', 0),
  ])
  setTotalCount(total || 0)
  setInStockCount(inStock || 0)
  setOutStockCount(outStock || 0)

  const { data: priceRows } = await applyFilters(supabase.from('products').select('price'))
  if (priceRows?.length) {
    const avg = priceRows.reduce((a, b) => a + parseFloat(b.price || 0), 0) / priceRows.length
    setAvgPrice(avg.toFixed(2))
  } else {
    setAvgPrice('0.00')
  }
} else {
  // ← ADD THIS ELSE BACK — restore global stats when no filters active
  setTotalCount(globalStats.current.total)
  setInStockCount(globalStats.current.inStock)
  setOutStockCount(globalStats.current.outStock)
  setAvgPrice(globalStats.current.avgPrice)
}
  // ← no else needed here at all

  setLoading(false)
}, [suppliersLoaded, search, filterCategory, filterStock, filterSupplier,
    filterMinQty, filterMinPrice, filterMaxPrice, filterFreshness, sortBy, sortDir, page])
  useEffect(() => { fetchPage() }, [fetchPage])

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

const hasFilters = filterCategory || filterStock || filterSupplier || search 
  || filterMinQty || filterMinPrice || filterMaxPrice || filterFreshness  // ← ADD
  const exportLabel = hasFilters
    ? `Export filtered CSV`
    : 'Export CSV'

  if (editingId !== null) {
    return (
      <ProductEditPage
        productId={editingId}
        suppliers={suppliers}
        categories={categories}
        onBack={() => setEditingId(null)}
        onSaved={() => fetchPage()}
      />
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
            <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)}
              placeholder="Search title, SKU, brand..."
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300 placeholder-gray-300 w-52" />
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

{/* ← ADD THIS */}
<FilterDropdown
  label="Updated"
  options={['Updated within last 24hrs', '1-7 days', 'Older than 7 days']}
  value={filterFreshness}
  onChange={setFilterFreshness}
/>


          {hasFilters && (
            <button onClick={() => {
  setFilterCategory(''); setFilterStock(''); setFilterSupplier('')
  setSearchInput(''); setSearch(''); setFilterMinQty('')
  setFilterMinPrice(''); setFilterMaxPrice('')
  setFilterSupplier('')
  setFilterFreshness('')  // ← ADD THIS
  setTotalCount(globalStats.current.total)
  setInStockCount(globalStats.current.inStock)
  setOutStockCount(globalStats.current.outStock)
  setAvgPrice(globalStats.current.avgPrice)
}} className="text-xs text-red-500 hover:underline">Clear all</button>
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
            <Download size={13} />{exporting ? 'Exporting…' : exportLabel}
          </button>
        </div>
      </div>

      <div className="p-5">
        {/* Summary */}
        <div className="flex gap-3 mb-5">
          <SummaryCard label="Total products" value={totalCount.toLocaleString()} />
          <SummaryCard label="In stock" value={inStockCount.toLocaleString()} />
          <SummaryCard label="Out of stock" value={outStockCount.toLocaleString()} />
          <SummaryCard label="Avg. price" value={`$${avgPrice}`} />
        </div>

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
                  : products.map(p => {
                      const imgs = parseImages(p.images)
                      const supplier = suppliers[p.supplier_id]
                      const isVariant = p.product_type === 'variation_parent'
                      const expanded = expandedRows.has(p.product_id)
                      return (
                        <>
                          <tr key={p.product_id}
                          onClick={() => setEditingId(p.product_id)}
                          className={`border-b border-gray-50 transition-colors cursor-pointer last:border-none group
                            ${freshnessRowClass(p.updated_at) || 'hover:bg-gray-50/80'}`}>
                            <td className="px-3 py-2.5">
                              {imgs[0]
                                ? <img src={imgs[0]} alt="" className="w-9 h-9 rounded-lg object-cover bg-gray-100" />
                                : <div className="w-9 h-9 rounded-lg bg-gray-100" />}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-start gap-2">
                                {isVariant && (
                                  <button onClick={e => toggleExpand(e, p.product_id)}
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
                              {/* <FreshnessBadge updatedAt={p.updated_at} /> */}
                            </div>
                          </td>
                          </tr>
                          {isVariant && expanded && (
                            <VariantRows key={`vr-${p.product_id}`} productId={p.product_id} parentImages={imgs}
                              onSelect={() => setEditingId(p.product_id)} />
                          )}
                        </>
                      )
                    })
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
                  const imgs = parseImages(p.images)
                  const supplier = suppliers[p.supplier_id]
                  const isVariant = p.product_type === 'variation_parent'
                  return (
                    <div key={p.product_id} onClick={() => setEditingId(p.product_id)}
                      className="border border-gray-100 rounded-xl overflow-hidden bg-white hover:shadow-md transition-shadow cursor-pointer">
                      <div className="relative">
                        {imgs[0]
                          ? <img src={imgs[0]} alt={p.title} className="w-full h-40 object-cover bg-gray-50" />
                          : <div className="w-full h-40 bg-gray-50 flex items-center justify-center text-gray-200 text-xs">No image</div>}
                        {isVariant && (
                          <span className="absolute top-2 left-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-600/90 text-white">
                            <Layers size={8} /> VARIANTS
                          </span>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{p.brand}</p>
                        <p className="text-xs font-medium text-gray-900 mb-2 leading-snug line-clamp-2">{p.title}</p>
                       <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-gray-900">${parseFloat(p.price || 0).toFixed(2)}</span>
                        <div className="flex flex-col items-end gap-1">
                          <StockBadge stock={p.stock} />
                       
                        </div>
                      </div>
                        <p className="text-xs text-gray-400">{p.stock} units · <span className="font-mono">{p.sku}</span></p>
                        {supplier && <span className="mt-2 inline-block text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{supplier.supplier_name}</span>}
                      </div>
                    </div>
                  )
                })
            }
          </div>
        )}

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