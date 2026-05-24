// ProductFiltersBar.jsx — src/pages/products/ProductFiltersBar.jsx
// OPTIMIZED: Added Enter key support, improved search UX
import React, { useState, useEffect, useRef } from 'react'
import { Search, ChevronDown, X, Loader2 } from 'lucide-react'

// ─── Generic dropdown ─────────────────────────────────────────────────────────
export const FilterDropdown = React.memo(function FilterDropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg transition-colors ${
          value ? 'border-red-300 text-red-600 bg-red-50' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
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
})

// ─── Min Qty ──────────────────────────────────────────────────────────────────
const MIN_QTY_PRESETS = [
  { label: 'All quantities', value: '' },
  { label: '≥ 3 in stock',   value: '3'   },
  { label: '≥ 5 in stock',   value: '5'   },
  { label: '≥ 10 in stock',  value: '10'  },
  { label: '≥ 25 in stock',  value: '25'  },
  { label: '≥ 50 in stock',  value: '50'  },
  { label: '≥ 100 in stock', value: '100' },
]

export const MinQtyDropdown = React.memo(function MinQtyDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  const label = MIN_QTY_PRESETS.find(p => p.value === value)?.label || (value ? `≥ ${value} in stock` : 'Min Qty')
  function apply() {
    const v = parseInt(custom)
    if (!isNaN(v) && v > 0) { onChange(String(v)); setCustom(''); setOpen(false) }
  }
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg transition-colors ${
          value ? 'border-red-300 text-red-600 bg-red-50' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
        {label}<ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-100 rounded-xl shadow-lg py-1 min-w-[170px]">
          {MIN_QTY_PRESETS.map(p => (
            <button key={p.value} onClick={() => { onChange(p.value); setOpen(false) }}
              className={`w-full text-left px-4 py-2 text-xs hover:bg-gray-50 flex items-center justify-between ${value === p.value ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
              {p.label}{value === p.value && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
            </button>
          ))}
          <div className="px-3 pt-1.5 pb-2 border-t border-gray-50 mt-1">
            <p className="text-[10px] text-gray-400 mb-1.5">Custom minimum</p>
            <div className="flex gap-1.5">
              <input type="number" min="1" value={custom} onChange={e => setCustom(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && apply()} placeholder="e.g. 7"
                className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 placeholder-gray-300 w-0" />
              <button onClick={apply}
                className="px-2.5 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg shrink-0">Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

// ─── Price ────────────────────────────────────────────────────────────────────
const PRICE_PRESETS = {
  min: [
    { label: 'Any price', value: '' }, { label: '≥ $10', value: '10' },
    { label: '≥ $25', value: '25' },   { label: '≥ $50', value: '50' },
    { label: '≥ $100', value: '100' }, { label: '≥ $250', value: '250' },
    { label: '≥ $500', value: '500' },
  ],
  max: [
    { label: 'Any price', value: '' }, { label: '≤ $10', value: '10' },
    { label: '≤ $25', value: '25' },   { label: '≤ $50', value: '50' },
    { label: '≤ $100', value: '100' }, { label: '≤ $250', value: '250' },
    { label: '≤ $500', value: '500' },
  ],
}

export const PriceDropdown = React.memo(function PriceDropdown({ mode, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const ref = useRef(null)
  const presets = PRICE_PRESETS[mode]
  const sym = mode === 'min' ? '≥' : '≤'
  const defaultLabel = mode === 'min' ? 'Min Price' : 'Max Price'
  useEffect(() => {
    if (!open) return
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  const activePreset = presets.find(p => p.value === value)
  const label = activePreset?.value ? activePreset.label : value ? `${sym} $${value}` : defaultLabel
  function apply() {
    const v = parseFloat(custom)
    if (!isNaN(v) && v >= 0) { onChange(String(v)); setCustom(''); setOpen(false) }
  }
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg transition-colors ${
          value ? 'border-red-300 text-red-600 bg-red-50' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
        {label}<ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-100 rounded-xl shadow-lg py-1 min-w-[160px]">
          {presets.map(p => (
            <button key={p.value} onClick={() => { onChange(p.value); setOpen(false) }}
              className={`w-full text-left px-4 py-2 text-xs hover:bg-gray-50 flex items-center justify-between ${value === p.value ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
              {p.label}{value === p.value && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
            </button>
          ))}
          <div className="px-3 pt-1.5 pb-2 border-t border-gray-50 mt-1">
            <p className="text-[10px] text-gray-400 mb-1.5">Custom amount</p>
            <div className="flex gap-1.5">
              <div className="relative flex-1 w-0">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-300 text-xs">$</span>
                <input type="number" min="0" step="0.01" value={custom}
                  onChange={e => setCustom(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && apply()} placeholder="0.00"
                  className="w-full pl-5 pr-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 placeholder-gray-300" />
              </div>
              <button onClick={apply}
                className="px-2.5 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg shrink-0">Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

// ─── Main bar ─────────────────────────────────────────────────────────────────
export default React.memo(function ProductFiltersBar({
  searchInput, setSearchInput, searchLoading,
  filterState, setFilterCategory, setFilterStock, setFilterSupplier,
  setFilterMinQty, setFilterMinPrice, setFilterMaxPrice, setFilterFreshness,
  hasFilters, clearFilters, categories, supplierOptions,setFilterOverride,
}) {
  if (!filterState) return null
  const { filterCategory, filterStock, filterSupplier, filterMinQty, filterMinPrice, filterMaxPrice, filterFreshness, filterOverride } = filterState
  const supplierName = filterSupplier ? (supplierOptions.find(s => s.id === filterSupplier)?.name || '') : ''

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative">
        {searchLoading
          ? <Loader2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
          : <Search  size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />}
        <input 
          type="text" 
          value={searchInput} 
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              // Trigger immediate search (no waiting for debounce)
              const trimmed = searchInput.trim()
              if (trimmed !== searchInput) {
                setSearchInput(trimmed)
              }
            }
          }}
          placeholder="Search title, SKU, brand… (Enter to search)"
          className="pl-8 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300 placeholder-gray-300 w-64" 
        />
        {searchInput && (
          <button onClick={() => setSearchInput('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors">
            <X size={11} />
          </button>
        )}
      </div>
      <FilterDropdown label="Category" options={categories} value={filterCategory} onChange={setFilterCategory} />
      <FilterDropdown label="Stock" options={['in', 'out', 'low']} value={filterStock} onChange={setFilterStock} />
      <FilterDropdown label="Supplier" options={supplierOptions.map(s => s.name)} value={supplierName}
        onChange={name => setFilterSupplier(supplierOptions.find(s => s.name === name)?.id || '')} />
      <MinQtyDropdown value={filterMinQty} onChange={setFilterMinQty} />
      <PriceDropdown mode="min" value={filterMinPrice} onChange={setFilterMinPrice} />
      <PriceDropdown mode="max" value={filterMaxPrice} onChange={setFilterMaxPrice} />
      <FilterDropdown label="Updated" options={['Updated within last 24hrs', '1-7 days', 'Older than 7 days']}
        value={filterFreshness} onChange={setFilterFreshness} />
<FilterDropdown label="Override" options={['Edited', 'Not Edited']} value={filterOverride} onChange={setFilterOverride} />
      {hasFilters && (
        <button onClick={clearFilters} className="text-xs text-red-500 hover:underline">Clear all</button>
      )}
    </div>
  )
})