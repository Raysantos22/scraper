// EbayTab.jsx — src/pages/ebay/EbayTab.jsx
import React, { useState, useEffect, useMemo } from 'react'
import { api } from '../../lib/api'
import {
  RadialBarChart, RadialBar, PolarGrid, PolarRadiusAxis, Label,
  PieChart, Pie, Sector, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
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

// ─── Cache ────────────────────────────────────────────────────────────────────
const SUMMARY_CACHE = { data: null, ts: 0 }
const STALE_MS      = 60_000

// ─── Theme colors ─────────────────────────────────────────────────────────────
const RED    = '#ef4444'   // active / primary
const PINK   = '#fca5a5'   // out of stock / secondary (light red)
const RED_DK = '#b91c1c'   // dark accent

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = n => Number(n || 0).toLocaleString()

function timeAgo(dateStr) {
  if (!dateStr) return null
  const diff  = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  < 1)  return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

// ─── Suppliers ────────────────────────────────────────────────────────────────
const SUPPLIERS = [
  { key: 'ozh_items',        label: 'OZH',         fill: '#ef4444' },
  { key: 'priceline_items',  label: 'Priceline',   fill: '#f97316' },
  { key: 'totaltools_items', label: 'Total Tools', fill: '#eab308' },
  { key: 'mecca_items',      label: 'Mecca',       fill: '#84cc16' },
  { key: 'sephora_items',    label: 'Sephora',     fill: '#06b6d4' },
  { key: 'house_items',      label: 'House',       fill: '#3b82f6' },
  { key: 'vb_items',         label: "Vic's Bsmt",  fill: '#8b5cf6' },
  { key: 'amazon_items',     label: 'Amazon',      fill: '#ec4899' },
  { key: 'other_items',      label: 'Other',       fill: '#64748b' },
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
      up ? 'text-emerald-700 border-emerald-200 bg-emerald-50'
         : 'text-red-600 border-red-200 bg-red-50'
    }`}>
      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {up ? '+' : ''}{pct}%
    </span>
  )
}

// ─── Skeletons ────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-card border border-border rounded-2xl p-7 w-full animate-pulse">
      <div className="h-4 w-32 bg-muted rounded mb-2" />
      <div className="h-3 w-20 bg-muted/60 rounded mb-6" />
      <div className="flex gap-4 pt-5 border-t border-border">
        {[0,1,2].map(i => (
          <div key={i} className="flex-1 space-y-2">
            <div className="h-2 w-12 bg-muted/60 rounded" />
            <div className="h-6 w-16 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

function SkeletonSummaryCard() {
  return (
    <Card className="flex-1 min-w-0 animate-pulse">
      <CardHeader className="pb-2">
        <div className="h-3 w-24 bg-muted rounded mb-3" />
        <div className="h-8 w-28 bg-muted rounded" />
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-3 w-20 bg-muted/60 rounded mt-1" />
        <div className="h-3 w-32 bg-muted/40 rounded mt-2" />
      </CardContent>
    </Card>
  )
}

function SkeletonChart({ height = 'h-[240px]' }) {
  return (
    <Card className="animate-pulse">
      <CardHeader className="pb-2">
        <div className="h-3 w-32 bg-muted rounded mb-2" />
        <div className="h-2 w-24 bg-muted/60 rounded" />
      </CardHeader>
      <CardContent>
        <div className={`${height} bg-muted/40 rounded-lg`} />
      </CardContent>
    </Card>
  )
}

// ─── Summary stat card ────────────────────────────────────────────────────────
function SummaryCard({ label, value, trendPct, trendLabel, subLabel, loading }) {
  if (loading) return <SkeletonSummaryCard />
  return (
    <Card className="flex-1 min-w-0">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardDescription className="text-xs font-medium">{label}</CardDescription>
          <TrendBadge pct={trendPct} />
        </div>
        <CardTitle className="text-3xl font-bold tracking-tight">{fmt(value)}</CardTitle>
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

// ─── Stacked bar: top 10 stores — red=active, pink=oos ───────────────────────
function TopStoresChart({ summary, loading }) {
  const data = useMemo(() => [...summary]
    .sort((a, b) => Number(b.total_items) - Number(a.total_items))
    .slice(0, 10)
    .map(s => ({
      name:   s.store_name.replace(/au$/i, '').slice(0, 9),
      active: Number(s.active_listings),
      oos:    Number(s.out_of_stock),
    })), [summary])

  const config = {
    active: { label: 'Active',       color: RED  },
    oos:    { label: 'Out of Stock', color: PINK },
  }

  if (loading) return <SkeletonChart height="h-[240px]" />

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Top 10 Stores by Listings</CardTitle>
        <CardDescription className="text-xs flex items-center gap-4 mt-1">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: RED }} /> Active
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: PINK }} /> Out of Stock
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[220px] w-full">
          <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="name" tick={{ fontSize: 8 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false}
              tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="active" stackId="a" fill={RED}  radius={[0,0,0,0]} />
            <Bar dataKey="oos"    stackId="a" fill={PINK} radius={[3,3,0,0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

// ─── Horizontal bar: out of stock — shades of red ────────────────────────────
function OutOfStockChart({ summary, loading }) {
  // 10 shades from deep red to light pink
  const SHADES = [
    '#7f1d1d','#991b1b','#b91c1c','#dc2626',
    '#ef4444','#f87171','#fca5a5','#fecaca','#fee2e2','#fff1f2',
  ]

  const data = useMemo(() => [...summary]
    .sort((a, b) => Number(b.out_of_stock) - Number(a.out_of_stock))
    .slice(0, 10)
    .map((s, i) => ({
      name: s.store_name.replace(/au$/i, '').slice(0, 10),
      oos:  Number(s.out_of_stock),
      fill: SHADES[i],
    })), [summary])

  const config = { oos: { label: 'Out of Stock', color: RED } }

  if (loading) return <SkeletonChart height="h-[240px]" />

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Out of Stock by Store</CardTitle>
        <CardDescription className="text-xs">Top 10 stores needing restocking</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[220px] w-full">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
            <XAxis type="number" tick={{ fontSize: 9 }} tickLine={false} axisLine={false}
              tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 8 }} tickLine={false} axisLine={false} width={60} />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="oos" radius={[0,4,4,0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

// ─── Radial: active listing rate — red arc ────────────────────────────────────
function ActiveRateRadial({ total, active, loading }) {
  const pct = total > 0 ? Math.round((active / total) * 100) : 0
  const chartData = [{ name: 'active', value: pct, fill: RED }]
  const config = { active: { label: 'Active Rate', color: RED } }

  if (loading) return <SkeletonChart height="h-[200px]" />

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle className="text-sm">Active Listing Rate</CardTitle>
        <CardDescription className="text-xs">Products vs active listings</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer config={config} className="mx-auto aspect-square max-h-[180px]">
          <RadialBarChart data={chartData} endAngle={(pct / 100) * 360} innerRadius={58} outerRadius={85}>
            <PolarGrid gridType="circle" radialLines={false} stroke="none"
              className="first:fill-muted last:fill-background" polarRadius={[76, 64]} />
            <RadialBar dataKey="value" background={{ fill: '#fee2e2' }} fill={RED} />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label content={({ viewBox }) => {
                if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                  return (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan x={viewBox.cx} y={viewBox.cy} fontSize={28} fontWeight={700} fill="#111">
                        {`${pct}%`}
                      </tspan>
                      <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 20} fontSize={10} fill="#9ca3af">
                        In stock
                      </tspan>
                    </text>
                  )
                }
              }} />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-1 text-sm pt-2">
        <div className="flex items-center gap-2 font-medium leading-none text-xs">
          {fmt(active)} of {fmt(total)} active
          <TrendingUp className="h-3 w-3" style={{ color: RED }} />
        </div>
        <div className="leading-none text-muted-foreground text-xs">Total eBay inventory</div>
      </CardFooter>
    </Card>
  )
}

// ─── Donut: supplier breakdown ────────────────────────────────────────────────
function SupplierDonutChart({ summary, loading }) {
  const [activeIndex, setActiveIndex] = useState(0)
 
  const pieData = useMemo(() => SUPPLIERS.map(s => ({
    key:      s.key,
    supplier: s.label,
    items:    summary.reduce((acc, store) => acc + Number(store[s.key] || 0), 0),
    fill:     s.fill,
  })).filter(s => s.items > 0).sort((a, b) => b.items - a.items), [summary])
 
  const config = useMemo(() => Object.fromEntries(
    pieData.map(s => [s.supplier, { label: s.supplier, color: s.fill }])
  ), [pieData])
 
  const total  = pieData.reduce((acc, s) => acc + s.items, 0)
  const active = pieData[activeIndex] || pieData[0]
 
  if (loading) return <SkeletonChart height="h-[320px]" />
 
  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle className="text-sm">Items by Supplier</CardTitle>
        <CardDescription className="text-xs">All suppliers across all stores</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer config={config} className="mx-auto aspect-square max-h-[200px]">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey="supplier" hideLabel />} />
            <Pie
              data={pieData}
              dataKey="items"
              nameKey="supplier"
              innerRadius={58}
              outerRadius={85}
              strokeWidth={3}
              activeIndex={activeIndex}
              onMouseEnter={(_, index) => setActiveIndex(index)}
              activeShape={({ outerRadius = 0, ...props }) => (
                <Sector {...props} outerRadius={outerRadius + 10} />
              )}
            >
              <Label
                content={({ viewBox }) => {
                  if (!viewBox || !('cx' in viewBox)) return null
                  return (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan x={viewBox.cx} y={(viewBox.cy || 0) - 8} fontSize={22} fontWeight={700} fill="#111">
                        {active ? Math.round((active.items / total) * 100) : 0}%
                      </tspan>
                      <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 12} fontSize={10} fill="#9ca3af">
                        {active?.supplier}
                      </tspan>
                    </text>
                  )
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="mt-2 space-y-0.5 px-1">
          {pieData.map((s, i) => (
            <div key={s.key}
              className={`flex items-center justify-between text-xs cursor-pointer rounded px-1.5 py-1 transition-colors ${i === activeIndex ? 'bg-muted' : 'hover:bg-muted/50'}`}
              onMouseEnter={() => setActiveIndex(i)}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.fill }} />
                <span className="text-muted-foreground">{s.supplier}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{fmt(s.items)}</span>
                <span className="text-muted-foreground/60 text-[10px] w-7 text-right">
                  {total > 0 ? Math.round((s.items / total) * 100) : 0}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter className="flex-col gap-1 text-sm pt-3">
        <div className="flex items-center gap-2 font-medium leading-none text-xs">
          {active?.supplier} leads with {fmt(active?.items)} items
          <TrendingUp className="h-3 w-3" style={{ color: RED }} />
        </div>
        <div className="leading-none text-muted-foreground text-xs">
          {fmt(total)} total items tracked
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
        const hasContent  = !!item.label
        const prevContent = i > 0 && !!cells[i - 1].label
        return (
          <div key={i} className={`flex-1 min-w-0
            ${hasContent && prevContent ? 'border-l border-border pl-4' : ''}
            ${hasContent && i < 2 && cells[i + 1]?.label ? 'pr-4' : ''}`}>
            {hasContent && <>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 truncate">{item.label}</p>
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
      <h3 className="text-2xl font-black text-foreground mb-1 capitalize leading-tight">
        {store.store_name}
      </h3>
      {store.last_updated && (
        <p className="text-[10px] text-muted-foreground mb-3">
          Updated {timeAgo(store.last_updated)}
        </p>
      )}
      <StatRow items={[
        { label: 'All Items',    val: fmt(total)  },
        { label: 'Active',       val: fmt(active) },
        { label: 'Out of Stock', val: fmt(oos)    },
      ]} />
      {supChunks.map((chunk, i) => <StatRow key={i} items={chunk} />)}
    </button>
  )
}

// ─── Filter bar ───────────────────────────────────────────────────────────────
function StoreFilterBar({ search, onSearch, supplierFilter, onSupplierFilter, stockFilter, onStockFilter, resultCount, totalCount }) {
  const hasFilters = search || supplierFilter || stockFilter
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input type="text" value={search} onChange={e => onSearch(e.target.value)}
          placeholder="Search stores…"
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
        <select value={supplierFilter} onChange={e => onSupplierFilter(e.target.value)}
          className="pl-8 pr-7 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer text-foreground transition-all">
          <option value="">All Suppliers</option>
          {SUPPLIERS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>
      <select value={stockFilter} onChange={e => onStockFilter(e.target.value)}
        className="px-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer text-foreground transition-all">
        <option value="">All Stock</option>
        <option value="in">Has Active Listings</option>
        <option value="out">Has Out-of-Stock</option>
      </select>
      <div className="flex items-center gap-2 ml-auto">
        {hasFilters && (
          <button onClick={() => { onSearch(''); onSupplierFilter(''); onStockFilter('') }}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            <X size={11} /> Clear
          </button>
        )}
        {hasFilters && <span className="text-xs text-muted-foreground">{resultCount} of {totalCount}</span>}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function EbayTab() {
  const [summary,       setSummary]       = useState(SUMMARY_CACHE.data || [])
  const [loading,       setLoading]       = useState(!SUMMARY_CACHE.data)
  const [selectedStore, setSelectedStore] = useState(null)

  const [search,         setSearch]         = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [stockFilter,    setStockFilter]    = useState('')

  useEffect(() => {
    async function load() {
      if (SUMMARY_CACHE.data && Date.now() - SUMMARY_CACHE.ts < STALE_MS) return
      if (!SUMMARY_CACHE.data) setLoading(true)
      const data = await api.get('/api/ebay/summary')
      if (Array.isArray(data)) {
        setSummary(data)
        SUMMARY_CACHE.data = data
        SUMMARY_CACHE.ts   = Date.now()
      }
      setLoading(false)
    }
    load()
  }, [])

  const filteredSummary = useMemo(() => {
    return summary.filter(store => {
      if (search && !store.store_name.toLowerCase().includes(search.toLowerCase())) return false
      if (supplierFilter && Number(store[supplierFilter] || 0) === 0) return false
      if (stockFilter === 'in'  && Number(store.active_listings || 0) === 0) return false
      if (stockFilter === 'out' && Number(store.out_of_stock    || 0) === 0) return false
      return true
    })
  }, [summary, search, supplierFilter, stockFilter])

  const totals = useMemo(() => summary.reduce((acc, s) => ({
    total_items:     (acc.total_items     || 0) + Number(s.total_items     || 0),
    active_listings: (acc.active_listings || 0) + Number(s.active_listings || 0),
    out_of_stock:    (acc.out_of_stock    || 0) + Number(s.out_of_stock    || 0),
  }), {}), [summary])

  const globalLastUpdated = useMemo(() => summary.reduce((latest, s) =>
    !latest || new Date(s.last_updated) > new Date(latest) ? s.last_updated : latest
  , null), [summary])

  const noData    = !loading && summary.length === 0
  const storeCols = filteredSummary.length === 1 ? 1 : filteredSummary.length >= 5 ? 3 : 2

  if (selectedStore) {
    return <StoreListingsPage storeName={selectedStore} onBack={() => setSelectedStore(null)} />
  }

  return (
    <div className="p-6 space-y-6">

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard label="Total Listings"  value={totals.total_items}
          trendPct={null} trendLabel="total this period" subLabel="All eBay store listings" loading={loading} />
        <SummaryCard label="Active Listings" value={totals.active_listings}
          trendPct={null} trendLabel="active this period" subLabel="Currently in stock & live" loading={loading} />
        <SummaryCard label="Out of Stock"    value={totals.out_of_stock}
          trendPct={null} trendLabel="out of stock items" subLabel="Needs restocking attention" loading={loading} />
        <SummaryCard label="Stores"          value={summary.length}
          trendPct={null} trendLabel="connected stores" subLabel="eBay seller accounts tracked" loading={loading} />
      </div>

      {/* Global last synced */}
      {!loading && globalLastUpdated && (
        <p className="text-xs text-muted-foreground -mt-4">
          Last synced: {timeAgo(globalLastUpdated)}
        </p>
      )}

      {/* Main layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6 items-start">

        {/* Left: charts + stores */}
        <div className="space-y-6">

          {/* Charts row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TopStoresChart summary={summary} loading={loading} />
            <OutOfStockChart summary={summary} loading={loading} />
          </div>

          {/* Stores */}
          <div className="space-y-4">
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground font-medium">
                Stores <span className="opacity-50">({summary.length})</span>
              </p>
              {!loading && summary.length > 0 && (
                <StoreFilterBar
                  search={search} onSearch={setSearch}
                  supplierFilter={supplierFilter} onSupplierFilter={setSupplierFilter}
                  stockFilter={stockFilter} onStockFilter={setStockFilter}
                  resultCount={filteredSummary.length} totalCount={summary.length}
                />
              )}
            </div>

            {loading ? (
              <div className="grid grid-cols-2 gap-4">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
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
                <button onClick={() => { setSearch(''); setSupplierFilter(''); setStockFilter('') }}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors">
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${storeCols}, minmax(0, 1fr))` }}>
                {filteredSummary.map(store => (
                  <StoreCard key={store.store_name} store={store} onSelect={setSelectedStore} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="xl:sticky xl:top-6 space-y-4">
          <ActiveRateRadial
            total={totals.total_items || 0}
            active={totals.active_listings || 0}
            loading={loading}
          />
          <SupplierDonutChart summary={summary} loading={loading} />
        </div>
      </div>
    </div>
  )
}