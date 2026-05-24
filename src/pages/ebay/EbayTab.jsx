// EbayTab.jsx — src/pages/ebay/EbayTab.jsx
import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import {
  RadialBarChart, RadialBar, PolarGrid, PolarRadiusAxis, Label,
  PieChart, Pie,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Minus,
  ShoppingBag, Search, X, SlidersHorizontal,
} from 'lucide-react'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter,
} from '@/components/ui/card'
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from '@/components/ui/chart'
import StoreListingsPage from './StoreListingsPage'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = n => Number(n || 0).toLocaleString()

function pctChange(current, previous) {
  if (!previous || Number(previous) === 0) return null
  return Math.round(((Number(current) - Number(previous)) / Number(previous)) * 100)
}

// ─── All suppliers ────────────────────────────────────────────────────────────
const SUPPLIERS = [
  { key: 'ozh_items',        label: 'OZH',        color: 'var(--chart-1)' },
  { key: 'priceline_items',  label: 'Priceline',  color: 'var(--chart-2)' },
  { key: 'totaltools_items', label: 'Total Tools',color: 'var(--chart-3)' },
  { key: 'mecca_items',      label: 'Mecca',      color: 'var(--chart-4)' },
  { key: 'sephora_items',    label: 'Sephora',    color: 'var(--chart-5)' },
  { key: 'house_items',      label: 'House',      color: 'var(--chart-1)' },
  { key: 'vb_items',         label: "Vic's Bsmt", color: 'var(--chart-2)' },
  { key: 'amazon_items',     label: 'Amazon',     color: '#FF9900' },
  { key: 'other_items',      label: 'Other',      color: 'var(--chart-4)' },
]

const EXAMPLE_SUPPLIER_DATA = [
  { key: 'ozh_items',        supplier: 'OZH',        items: 500, fill: '#cd00f7' },
  { key: 'priceline_items',  supplier: 'Priceline',  items: 320, fill: '#f700d6' },
  { key: 'totaltools_items', supplier: 'Total Tools',items: 210, fill: '#f70000' },
  { key: 'mecca_items',      supplier: 'Mecca',      items: 180, fill: '#5c0202' },
  { key: 'sephora_items',    supplier: 'Sephora',    items: 145, fill: '#c8f71e' },
  { key: 'house_items',      supplier: 'House',      items: 95,  fill: '#221ef7' },
  { key: 'vb_items',         supplier: "Vic's Bsmt", items: 80,  fill: '#1ed7f7)' },
  { key: 'amazon_items',     supplier: 'Amazon',     items: 70,  fill: '#FF9900' },
  { key: 'other_items',      supplier: 'Other',      items: 60,  fill: '#09c713' },

]

function chunkArray(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ─── Trend badge ──────────────────────────────────────────────────────────────
function TrendBadge({ pct }) {
  if (pct === null) return null
  if (pct === 0) return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground border border-border rounded-full px-2 py-0.5">
      <Minus size={10} /> 0%
    </span>
  )
  const up = pct > 0
  return (
    <span className={`inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 ${
      up
        ? 'text-emerald-700 border-emerald-200 bg-emerald-50'
        : 'text-red-600 border-red-200 bg-red-50'
    }`}>
      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {up ? '+' : ''}{pct}%
    </span>
  )
}

// ─── Summary stat card ────────────────────────────────────────────────────────
function SummaryCard({ label, value, trendPct, trendLabel, subLabel, loading }) {
  return (
    <Card className="flex-1 min-w-0">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardDescription className="text-xs font-medium">{label}</CardDescription>
          <TrendBadge pct={trendPct} />
        </div>
        {loading
          ? <div className="h-8 w-24 bg-muted rounded animate-pulse mt-1" />
          : <CardTitle className="text-3xl font-bold tracking-tight">{fmt(value)}</CardTitle>
        }
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-1 text-sm font-medium">
          {trendPct > 0 ? <TrendingUp size={13} /> : trendPct < 0 ? <TrendingDown size={13} /> : null}
          {trendLabel}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{subLabel}</p>
      </CardContent>
    </Card>
  )
}

// ─── Supplier pie chart ───────────────────────────────────────────────────────
function SupplierPieChart({ summary }) {
  const liveData = SUPPLIERS.map(s => ({
    key: s.key,
    supplier: s.label,
    items: summary.reduce((acc, store) => acc + Number(store[s.key] || 0), 0),
  })).filter(s => s.items > 0)

  const pieData = liveData.length > 0
    ? liveData.map((s, i) => ({
        ...s,
        fill: EXAMPLE_SUPPLIER_DATA.find(e => e.key === s.key)?.fill || `var(--chart-${(i % 5) + 1})`,
      }))
    : EXAMPLE_SUPPLIER_DATA

  const config = Object.fromEntries(
    pieData.map(s => [s.supplier, { label: s.supplier, color: s.fill }])
  )

  const top = [...pieData].sort((a, b) => b.items - a.items)[0]

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle className="text-sm">Items by Supplier</CardTitle>
        <CardDescription className="text-xs">All suppliers across all stores</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={config}
          className="mx-auto aspect-square max-h-[250px] [&_.recharts-pie-label-text]:fill-foreground"
        >
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey="supplier" hideLabel />} />
            <Pie
              data={pieData}
              dataKey="items"
              nameKey="supplier"
              label={({ supplier }) => supplier}
              labelLine={true}
              outerRadius={85}
            />
          </PieChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-1 text-sm">
        <div className="flex items-center gap-2 font-medium leading-none text-xs">
          {top?.supplier} leads with {fmt(top?.items)} items
          <TrendingUp className="h-3 w-3" />
        </div>
        <div className="leading-none text-muted-foreground text-xs">
          {liveData.length > 0 ? 'Live supplier totals' : 'Example data — run scraper to populate'}
        </div>
      </CardFooter>
    </Card>
  )
}

// ─── Radial chart: active listing rate ───────────────────────────────────────
function ActiveRateRadial({ total, active, loading }) {
  const pct = total > 0 ? Math.round((active / total) * 100) : 0
  const chartData = [{ name: 'active', value: pct, fill: 'var(--chart-1)' }]
  const config = { active: { label: 'Active Rate', color: 'var(--chart-1)' } }

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle className="text-sm">Active Listing Rate</CardTitle>
        <CardDescription className="text-xs">Products vs active listings</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer config={config} className="mx-auto aspect-square max-h-[220px]">
          <RadialBarChart
            data={chartData}
            endAngle={(pct / 100) * 360}
            innerRadius={65}
            outerRadius={95}
          >
            <PolarGrid
              gridType="circle"
              radialLines={false}
              stroke="none"
              className="first:fill-muted last:fill-background"
              polarRadius={[86, 74]}
            />
            <RadialBar dataKey="value" background />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                        <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-4xl font-bold" fontSize={32} fontWeight={700}>
                          {loading ? '—' : `${pct}%`}
                        </tspan>
                        <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 24} className="fill-muted-foreground" fontSize={12}>
                          In stock
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-1 text-sm">
        <div className="flex items-center gap-2 font-medium leading-none">
          {fmt(active)} of {fmt(total)} listings active
          <TrendingUp className="h-4 w-4" />
        </div>
        <div className="leading-none text-muted-foreground text-xs">
          Total eBay scraper inventory
        </div>
      </CardFooter>
    </Card>
  )
}

// ─── Stat row inside store card ───────────────────────────────────────────────
function StatRow({ items }) {
  const cells = [...items]
  while (cells.length < 3) cells.push({ label: '', val: '' })
  return (
    <div className="flex border-border pt-5">
      {cells.map((item, i) => {
        const hasContent = !!item.label
        const prevContent = i > 0 && !!cells[i - 1].label
        return (
          <div
            key={i}
            className={`flex-1 min-w-0 ${hasContent && prevContent ? 'border-l border-border pl-4' : ''} ${hasContent && i < 2 && cells[i + 1]?.label ? 'pr-4' : ''}`}
          >
            {hasContent && <>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 truncate">
                {item.label}
              </p>
              <p className="text-xl font-bold text-foreground leading-none">{item.val}</p>
            </>}
          </div>
        )
      })}
    </div>
  )
}

// ─── Store card ───────────────────────────────────────────────────────────────
function StoreCard({ store, onSelect }) {
  const total  = Number(store.total_items     || 0)
  const active = Number(store.active_listings || 0)
  const oos    = Number(store.out_of_stock    || 0)

  const activeSuppliers = SUPPLIERS
    .filter(s => Number(store[s.key] || 0) > 0)
    .map(s => ({ label: s.label, val: fmt(Number(store[s.key])) }))

  const supChunks = chunkArray(activeSuppliers, 3)

  return (
    <button
      onClick={() => onSelect(store.store_name)}
      className="text-left bg-card border border-black/70 rounded-2xl p-7 w-full shadow-sm transition-all duration-300 ease-out hover:shadow-[0_12px_30px_rgba(0,0,0,0.18)] hover:-translate-y-1 hover:cursor-pointer"
    >
      <h3 className="text-2xl font-black text-foreground mb-4 capitalize leading-tight">
        {store.store_name}
      </h3>
      <StatRow items={[
        { label: 'All Items',    val: fmt(total)  },
        { label: 'Active',       val: fmt(active) },
        { label: 'Out of Stock', val: fmt(oos)    },
      ]} />
      {supChunks.map((chunk, i) => (
        <StatRow key={i} items={chunk} />
      ))}
    </button>
  )
}

// ─── Search + Filter bar ──────────────────────────────────────────────────────
function StoreFilterBar({ search, onSearch, supplierFilter, onSupplierFilter, stockFilter, onStockFilter, resultCount, totalCount }) {
  const hasFilters = search || supplierFilter || stockFilter

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search input */}
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Search stores…"
          className="w-full pl-8 pr-8 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent placeholder:text-muted-foreground/60 transition-all"
        />
        {search && (
          <button
            onClick={() => onSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Supplier filter */}
      <div className="relative">
        <SlidersHorizontal size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <select
          value={supplierFilter}
          onChange={e => onSupplierFilter(e.target.value)}
          className="pl-8 pr-7 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer text-foreground transition-all"
        >
          <option value="">All Suppliers</option>
          {SUPPLIERS.map(s => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Stock filter */}
      <select
        value={stockFilter}
        onChange={e => onStockFilter(e.target.value)}
        className="px-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer text-foreground transition-all"
      >
        <option value="">All Stock</option>
        <option value="in">Has Active Listings</option>
        <option value="out">Has Out-of-Stock</option>
      </select>

      {/* Clear + result count */}
      <div className="flex items-center gap-2 ml-auto">
        {hasFilters && (
          <button
            onClick={() => { onSearch(''); onSupplierFilter(''); onStockFilter('') }}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <X size={11} /> Clear
          </button>
        )}
        {(search || supplierFilter || stockFilter) && (
          <span className="text-xs text-muted-foreground">
            {resultCount} of {totalCount}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function EbayTab() {
  const [summary,       setSummary]       = useState([])
  const [chartData,     setChartData]     = useState([])
  const [loading,       setLoading]       = useState(true)
  const [chartLoading,  setChartLoading]  = useState(true)
  const [selectedStore, setSelectedStore] = useState(null)  // store_name string | null

  // ── Filter state ──────────────────────────────────────────────────────────
  const [search,         setSearch]         = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [stockFilter,    setStockFilter]    = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('ebay_store_summary')
        .select('*')
        .order('snapshot_date', { ascending: false })
      if (data) {
        const seen = {}
        data.forEach(r => { if (!seen[r.store_name]) seen[r.store_name] = r })
        setSummary(Object.values(seen))
      }
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    async function loadChart() {
      setChartLoading(true)
      const since = new Date()
      since.setDate(since.getDate() - 30)
      const { data } = await supabase
        .from('ebay_store_summary')
        .select('snapshot_date, total_items, active_listings, out_of_stock')
        .gte('snapshot_date', since.toISOString().slice(0, 10))
        .order('snapshot_date', { ascending: true })
      if (data) {
        const byDate = {}
        data.forEach(r => {
          if (!byDate[r.snapshot_date])
            byDate[r.snapshot_date] = { date: r.snapshot_date, total: 0, active: 0, out: 0 }
          byDate[r.snapshot_date].total  += Number(r.total_items     || 0)
          byDate[r.snapshot_date].active += Number(r.active_listings || 0)
          byDate[r.snapshot_date].out    += Number(r.out_of_stock    || 0)
        })
        setChartData(Object.values(byDate))
      }
      setChartLoading(false)
    }
    loadChart()
  }, [])

  // ── Client-side filtering ─────────────────────────────────────────────────
  const filteredSummary = useMemo(() => {
    return summary.filter(store => {
      if (search) {
        const q = search.toLowerCase()
        if (!store.store_name.toLowerCase().includes(q)) return false
      }
      if (supplierFilter) {
        if (Number(store[supplierFilter] || 0) === 0) return false
      }
      if (stockFilter === 'in'  && Number(store.active_listings || 0) === 0) return false
      if (stockFilter === 'out' && Number(store.out_of_stock    || 0) === 0) return false
      return true
    })
  }, [summary, search, supplierFilter, stockFilter])

  const totals = summary.reduce((acc, s) => ({
    total_items:     (acc.total_items     || 0) + Number(s.total_items     || 0),
    active_listings: (acc.active_listings || 0) + Number(s.active_listings || 0),
    out_of_stock:    (acc.out_of_stock    || 0) + Number(s.out_of_stock    || 0),
  }), {})

  const first = chartData[0]
  const last  = chartData[chartData.length - 1]
  const noData = !loading && summary.length === 0

  const storeCols = filteredSummary.length === 1 ? 1 : filteredSummary.length >= 5 ? 3 : 2

  // ── Store listings page ───────────────────────────────────────────────────
  if (selectedStore) {
    return (
      <StoreListingsPage
        storeName={selectedStore}
        onBack={() => setSelectedStore(null)}
      />
    )
  }

  return (
    <div className="p-6 space-y-6">

      {/* ── Top summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Listings"
          value={totals.total_items}
          trendPct={first && last ? pctChange(last.total, first.total) : null}
          trendLabel="total this period"
          subLabel="All eBay store listings"
          loading={loading || chartLoading}
        />
        <SummaryCard
          label="Active Listings"
          value={totals.active_listings}
          trendPct={first && last ? pctChange(last.active, first.active) : null}
          trendLabel="active this period"
          subLabel="Currently in stock & live"
          loading={loading || chartLoading}
        />
        <SummaryCard
          label="Out of Stock"
          value={totals.out_of_stock}
          trendPct={first && last ? pctChange(last.out, first.out) : null}
          trendLabel="out of stock items"
          subLabel="Needs restocking attention"
          loading={loading || chartLoading}
        />
        <SummaryCard
          label="Stores"
          value={summary.length}
          trendPct={null}
          trendLabel="connected stores"
          subLabel="eBay seller accounts tracked"
          loading={loading}
        />
      </div>

      {/* ── Store cards + right panel ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">

        {/* Left: store cards */}
        <div className="space-y-4">
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground font-medium">
              Stores <span className="opacity-50">({summary.length})</span>
            </p>

            {/* ── Filter bar ── */}
            {!loading && summary.length > 0 && (
              <StoreFilterBar
                search={search}
                onSearch={setSearch}
                supplierFilter={supplierFilter}
                onSupplierFilter={setSupplierFilter}
                stockFilter={stockFilter}
                onStockFilter={setStockFilter}
                resultCount={filteredSummary.length}
                totalCount={summary.length}
              />
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-48 bg-muted/40 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : noData ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <ShoppingBag size={28} className="text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground font-medium">No store data yet</p>
              <p className="text-xs text-muted-foreground/60">Run the Python script to push your first snapshot</p>
            </div>
          ) : filteredSummary.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Search size={28} className="text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground font-medium">No stores match your filters</p>
              <button
                onClick={() => { setSearch(''); setSupplierFilter(''); setStockFilter('') }}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(${storeCols}, minmax(0, 1fr))` }}
            >
              {filteredSummary.map(store => (
                <StoreCard key={store.store_name} store={store} onSelect={setSelectedStore} />
              ))}
            </div>
          )}
        </div>

        {/* Right: charts — sticky */}
        <div className="space-y-4 xl:sticky xl:top-6">
          <ActiveRateRadial
            total={totals.total_items || 0}
            active={totals.active_listings || 0}
            loading={loading}
          />
          <SupplierPieChart summary={summary} />
        </div>
      </div>
    </div>
  )
}