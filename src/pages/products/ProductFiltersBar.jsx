// ProductFiltersBar.jsx — src/pages/products/ProductFiltersBar.jsx
// AutoDS-style "Add Filter" panel with active filter chips
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Search, SlidersHorizontal, X, ChevronRight, Loader2, Check } from 'lucide-react'

// ─── Active filter chip ───────────────────────────────────────────────────────
function FilterChip({ label, value, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
      <span className="text-orange-400 font-normal">{label}:</span>
      {value}
      <button onClick={onRemove} className="ml-0.5 text-orange-400 hover:text-orange-700 transition-colors">
        <X size={10} />
      </button>
    </span>
  )
}

// ─── Filter panel sub-option list ─────────────────────────────────────────────
function FilterOptionList({ options, value, onChange, onBack }) {
  const [search, setSearch] = useState('')
  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div className="w-56">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 transition-colors">
          <ChevronRight size={14} className="rotate-180" />
        </button>
        <div className="relative flex-1">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-300" />
          <input
            autoFocus
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full pl-6 pr-2 py-1 text-xs bg-gray-50 rounded-md border border-gray-100 focus:outline-none focus:border-orange-300 placeholder-gray-300"
          />
        </div>
      </div>
      <div className="max-h-52 overflow-y-auto py-1">
        <button
          onClick={() => { onChange(''); onBack() }}
          className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-400 hover:bg-gray-50"
        >
          All
          {!value && <Check size={11} className="text-orange-500" />}
        </button>
        {filtered.map(opt => (
          <button
            key={opt.value}
            onClick={() => { onChange(opt.value); onBack() }}
            className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-orange-50/60 transition-colors ${
              value === opt.value ? 'text-orange-600 font-medium' : 'text-gray-700'
            }`}
          >
            {opt.label}
            {value === opt.value && <Check size={11} className="text-orange-500" />}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-3 py-3 text-xs text-gray-300 text-center">No options</p>
        )}
      </div>
    </div>
  )
}

// ─── Custom number input sub-panel ────────────────────────────────────────────
function FilterNumberPanel({ label, value, onChange, onBack, prefix = '', min = 0, step = 1, presets = [] }) {
  const [custom, setCustom] = useState(value || '')
  function apply(v) {
    onChange(String(v))
    onBack()
  }
  return (
    <div className="w-52">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 transition-colors">
          <ChevronRight size={14} className="rotate-180" />
        </button>
        <span className="text-xs font-medium text-gray-600">{label}</span>
      </div>
      <div className="py-1">
        {presets.map(p => (
          <button
            key={p.value}
            onClick={() => apply(p.value)}
            className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-orange-50/60 transition-colors ${
              value === String(p.value) ? 'text-orange-600 font-medium' : 'text-gray-700'
            }`}
          >
            {p.label}
            {value === String(p.value) && <Check size={11} className="text-orange-500" />}
          </button>
        ))}
      </div>
      <div className="px-3 pb-3 pt-1 border-t border-gray-50">
        <p className="text-[10px] text-gray-400 mb-1.5">Custom value</p>
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            {prefix && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-300 text-xs">{prefix}</span>}
            <input
              type="number" min={min} step={step}
              value={custom}
              onChange={e => setCustom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && custom && apply(custom)}
              placeholder={min === 0 ? '0' : '1'}
              className={`w-full ${prefix ? 'pl-5' : 'pl-2'} pr-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-orange-300 placeholder-gray-300`}
            />
          </div>
          <button
            onClick={() => custom && apply(custom)}
            className="px-2.5 py-1 text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-lg shrink-0 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Date range sub-panel ─────────────────────────────────────────────────────
function FilterDatePanel({ label, value, onChange, onBack, presetLabels }) {
  const DATE_PRESETS = [
    { label: presetLabels?.today    || 'Today',             value: 'today'    },
    { label: presetLabels?.['1']    || 'Last 24 hours',     value: '1'        },
    { label: presetLabels?.['7']    || 'Last 7 days',       value: '7'        },
    { label: presetLabels?.['30']   || 'Last 30 days',      value: '30'       },
    { label: presetLabels?.stale_2  || 'Not updated 2d+',   value: 'stale_2'  },
    { label: presetLabels?.stale_7  || 'Not updated 7d+',   value: 'stale_7'  },
    { label: presetLabels?.stale_30 || 'Not updated 30d+',  value: 'stale_30' },
  ]
  return (
    <div className="w-52">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 transition-colors">
          <ChevronRight size={14} className="rotate-180" />
        </button>
        <span className="text-xs font-medium text-gray-600">{label}</span>
      </div>
      <div className="py-1">
        <button
          onClick={() => { onChange(''); onBack() }}
          className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-400 hover:bg-gray-50"
        >
          Any time
          {!value && <Check size={11} className="text-orange-500" />}
        </button>
        {DATE_PRESETS.map(p => (
          <button
            key={p.value}
            onClick={() => { onChange(p.value); onBack() }}
            className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-orange-50/60 transition-colors ${
              value === p.value ? 'text-orange-600 font-medium' : 'text-gray-700'
            }`}
          >
            {p.label}
            {value === p.value && <Check size={11} className="text-orange-500" />}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── FILTER DEFINITIONS ───────────────────────────────────────────────────────
// (built dynamically so categories/suppliers are injected at render time)
function buildFilters({ categories, supplierOptions }) {
  return [
    {
      id: 'stock',
      label: 'Stock Status',
      type: 'option',
      options: [
        { label: 'In stock',  value: 'in'  },
        { label: 'Out of stock', value: 'out' },
        { label: 'Low stock (< 50)', value: 'low' },
      ],
    },
    {
      id: 'category',
      label: 'Category',
      type: 'option',
      options: categories.map(c => ({ label: c, value: c })),
    },
    {
      id: 'supplier',
      label: 'Supplier',
      type: 'option',
      options: supplierOptions.map(s => ({ label: s.name, value: s.id })),
    },
    {
      id: 'override',
      label: 'Override Status',
      type: 'option',
      options: [
        { label: 'Edited',     value: 'Edited'     },
        { label: 'Not Edited', value: 'Not Edited' },
      ],
    },
    {
      id: 'minQty',
      label: 'Min Quantity',
      type: 'number',
      prefix: '',
      min: 1,
      step: 1,
      presets: [
        { label: '≥ 3',   value: '3'   },
        { label: '≥ 5',   value: '5'   },
        { label: '≥ 10',  value: '10'  },
        { label: '≥ 25',  value: '25'  },
        { label: '≥ 50',  value: '50'  },
        { label: '≥ 100', value: '100' },
      ],
    },
    {
      id: 'minPrice',
      label: 'Min Price',
      type: 'number',
      prefix: '$',
      min: 0,
      step: 0.01,
      presets: [
        { label: '≥ $10',  value: '10'  },
        { label: '≥ $25',  value: '25'  },
        { label: '≥ $50',  value: '50'  },
        { label: '≥ $100', value: '100' },
        { label: '≥ $250', value: '250' },
      ],
    },
    {
      id: 'maxPrice',
      label: 'Max Price',
      type: 'number',
      prefix: '$',
      min: 0,
      step: 0.01,
      presets: [
        { label: '≤ $10',  value: '10'  },
        { label: '≤ $25',  value: '25'  },
        { label: '≤ $50',  value: '50'  },
        { label: '≤ $100', value: '100' },
        { label: '≤ $250', value: '250' },
      ],
    },
    {
      id: 'uploaded',
      label: 'Uploaded At',
      type: 'date',
      dateLabelMap: {
        today: 'Today', '1': 'Last 24h', '7': 'Last 7d', '30': 'Last 30d',
        stale_2: 'Not uploaded 2d+', stale_7: 'Not uploaded 7d+', stale_30: 'Not uploaded 30d+',
      },
    },
    {
      id: 'freshness',
      label: 'Updated At',
      type: 'date',
      dateLabelMap: {
        today: 'Today', '1': 'Last 24h', '7': 'Last 7d', '30': 'Last 30d',
        stale_2: 'Stale 2d+', stale_7: 'Stale 7d+', stale_30: 'Stale 30d+',
      },
    },
  ]
}

// ─── Active value display label ───────────────────────────────────────────────
function getChipLabel(filter, value, supplierOptions) {
  if (filter.type === 'option') {
    if (filter.id === 'supplier') {
      return supplierOptions.find(s => s.id === value)?.name || value
    }
    return filter.options?.find(o => o.value === value)?.label || value
  }
  if (filter.type === 'number') {
    const pre = filter.prefix || ''
    return `${pre}${value}`
  }
  if (filter.type === 'date') {
    const map = filter.dateLabelMap || {
      today: 'Today', '1': 'Last 24h', '7': 'Last 7d', '30': 'Last 30d',
      stale_2: 'Stale 2d+', stale_7: 'Stale 7d+', stale_30: 'Stale 30d+',
    }
    return map[value] || value
  }
  return value
}

// ─── Main Add Filter panel ────────────────────────────────────────────────────
function AddFilterPanel({
  filterState, setters, categories, supplierOptions, onClose,
}) {
  const [sub, setSub] = useState(null) // active sub-panel filter id
  const [panelSearch, setPanelSearch] = useState('')
  const ref = useRef(null)
  const filters = buildFilters({ categories, supplierOptions })

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const subFilter = filters.find(f => f.id === sub)
  const currentValue = sub ? (filterState[sub] || '') : ''

  const displayFilters = panelSearch
    ? filters.filter(f => f.label.toLowerCase().includes(panelSearch.toLowerCase()))
    : filters

  function handleSetValue(id, val) {
    setters[id]?.(val)
  }

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1.5 z-50 bg-white border border-gray-150 rounded-xl shadow-xl overflow-hidden"
      style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.10), 0 1.5px 4px rgba(0,0,0,0.06)' }}
    >
      {sub && subFilter ? (
        // ── Sub-panel ──
        subFilter.type === 'option' ? (
          <FilterOptionList
            options={subFilter.options}
            value={currentValue}
            onChange={val => handleSetValue(sub, val)}
            onBack={() => setSub(null)}
          />
        ) : subFilter.type === 'number' ? (
          <FilterNumberPanel
            label={subFilter.label}
            value={currentValue}
            onChange={val => handleSetValue(sub, val)}
            onBack={() => setSub(null)}
            prefix={subFilter.prefix}
            min={subFilter.min}
            step={subFilter.step}
            presets={subFilter.presets}
          />
        ) : subFilter.type === 'date' ? (
          <FilterDatePanel
            label={subFilter.label}
            value={currentValue}
            onChange={val => handleSetValue(sub, val)}
            onBack={() => setSub(null)}
            presetLabels={subFilter.dateLabelMap}
          />
        ) : null
      ) : (
        // ── Root panel ──
        <div className="w-56">
          {/* Search */}
          <div className="px-3 py-2.5 border-b border-gray-100">
            <div className="relative">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" />
              <input
                autoFocus
                type="text"
                value={panelSearch}
                onChange={e => setPanelSearch(e.target.value)}
                placeholder="Search anything"
                className="w-full pl-7 pr-2 py-1.5 text-xs bg-gray-50 rounded-lg border border-gray-100 focus:outline-none focus:border-orange-300 placeholder-gray-300"
              />
            </div>
          </div>

          {/* Filter list */}
          <div className="py-1 max-h-72 overflow-y-auto">
            {displayFilters.map(filter => {
              const activeVal = filterState[filter.id] || ''
              const chipLabel = activeVal ? getChipLabel(filter, activeVal, supplierOptions) : null
              return (
                <button
                  key={filter.id}
                  onClick={() => setSub(filter.id)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-xs hover:bg-gray-50 transition-colors group"
                >
                  <span className={activeVal ? 'text-orange-600 font-medium' : 'text-gray-700'}>
                    {filter.label}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {chipLabel && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-100 text-orange-600 font-medium max-w-[80px] truncate">
                        {chipLabel}
                      </span>
                    )}
                    <ChevronRight size={12} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main bar ─────────────────────────────────────────────────────────────────
export default React.memo(function ProductFiltersBar({
  searchInput, setSearchInput, searchLoading,
  filterState, setFilterCategory, setFilterStock, setFilterSupplier,
  setFilterMinQty, setFilterMinPrice, setFilterMaxPrice, setFilterFreshness,
  hasFilters, clearFilters, categories, supplierOptions, setFilterOverride,
  setFilterUploaded,
}) {
  const [panelOpen, setPanelOpen] = useState(false)

  if (!filterState) return null

  const {
    filterCategory, filterStock, filterSupplier,
    filterMinQty, filterMinPrice, filterMaxPrice,
    filterFreshness, filterOverride, filterUploaded,
  } = filterState

  const setters = {
    stock:     setFilterStock,
    category:  setFilterCategory,
    supplier:  setFilterSupplier,
    override:  setFilterOverride,
    minQty:    setFilterMinQty,
    minPrice:  setFilterMinPrice,
    maxPrice:  setFilterMaxPrice,
    freshness: setFilterFreshness,
    uploaded:  setFilterUploaded,
  }

  // Map filter id → display label
  const FILTER_LABELS = {
    stock:     'Stock',
    category:  'Category',
    supplier:  'Supplier',
    override:  'Override',
    minQty:    'Min Qty',
    minPrice:  'Min Price',
    maxPrice:  'Max Price',
    freshness: 'Updated',
    uploaded:  'Uploaded',
  }

  // Active filters as chips
  const activeFilters = [
    { id: 'stock',     value: filterStock     },
    { id: 'category',  value: filterCategory  },
    { id: 'supplier',  value: filterSupplier  },
    { id: 'override',  value: filterOverride  },
    { id: 'minQty',    value: filterMinQty    },
    { id: 'minPrice',  value: filterMinPrice  },
    { id: 'maxPrice',  value: filterMaxPrice  },
    { id: 'uploaded',  value: filterUploaded  },
    { id: 'freshness', value: filterFreshness },
  ].filter(f => f.value)

  // Build dummy filter defs for chip label resolution
  const filters = buildFilters({ categories, supplierOptions })
  const filterById = Object.fromEntries(filters.map(f => [f.id, f]))

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Search */}
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
              const trimmed = searchInput.trim()
              if (trimmed !== searchInput) setSearchInput(trimmed)
            }
          }}
          placeholder="Search title, SKU, brand…"
          className="pl-8 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300 placeholder-gray-300 w-56"
        />
        {searchInput && (
          <button
            onClick={() => setSearchInput('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
          >
            <X size={11} />
          </button>
        )}
      </div>

      {/* Add Filter button + panel */}
      <div className="relative">
        <button
          onClick={() => setPanelOpen(o => !o)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors font-medium ${
            panelOpen || hasFilters
              ? 'border-orange-300 text-orange-600 bg-orange-50'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300'
          }`}
        >
          <SlidersHorizontal size={12} />
          Add Filter
          {activeFilters.length > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-500 text-white text-[9px] font-bold">
              {activeFilters.length}
            </span>
          )}
        </button>

        {panelOpen && (
          <AddFilterPanel
            filterState={{
              stock:     filterStock,
              category:  filterCategory,
              supplier:  filterSupplier,
              override:  filterOverride,
              minQty:    filterMinQty,
              minPrice:  filterMinPrice,
              maxPrice:  filterMaxPrice,
              uploaded:  filterUploaded,
              freshness: filterFreshness,
            }}
            setters={setters}
            categories={categories}
            supplierOptions={supplierOptions}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </div>

      {/* Active filter chips */}
      {activeFilters.map(({ id, value }) => {
        const fDef = filterById[id]
        const chipLabel = fDef ? getChipLabel(fDef, value, supplierOptions) : value
        return (
          <FilterChip
            key={id}
            label={FILTER_LABELS[id] || id}
            value={chipLabel}
            onRemove={() => setters[id]?.('')}
          />
        )
      })}

      {hasFilters && (
        <button
          onClick={clearFilters}
          className="text-xs text-gray-400 hover:text-red-500 hover:underline transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  )
})