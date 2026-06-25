// C:\Users\ADMIN\scraper\src\pages\ebay\EbayTab.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react'
import { api } from '../../lib/api'
import {
  RadialBarChart, RadialBar, PolarGrid, PolarRadiusAxis, Label,
  PieChart, Pie, Sector, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
} from 'recharts'
import {
  TrendingUp, ShoppingBag, Search, X, SlidersHorizontal,
  Download, AlertCircle, CheckCircle2, Clock,
  PackageX, PackageCheck, Package, Zap, ZapOff, ListX,
  Hash, ChevronDown, ChevronUp, Clipboard, FileSearch, ChevronRight, RefreshCw,
} from 'lucide-react'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter,
} from '@/components/ui/card'
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from '@/components/ui/chart'
import StoreListingsPage from '../ebay/StoreListingsPage'
import BannedSkusPage    from '../ebay/BannedSkusPage'
import SkuLookupPage     from '../ebay/SkuLookupPage'
import StoreLimitsPage   from '../ebay/StoreLimitsPage'


// ─── Cache ────────────────────────────────────────────────────────────────────
const STORES_CACHE   = { data: null, ts: 0 }
const SUMMARY_CACHE  = { data: null, ts: 0 }
const SUPPLIER_CACHE = { data: null, ts: 0 }
const STALE_MS       = 60_000

const RED   = '#ef4444'
const PINK  = '#fca5a5'
const GREEN = '#22c55e'
const AMBER = '#f59e0b'
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = n => Number(n || 0).toLocaleString()
const pct = (n, d) => (d > 0 ? Math.round((Number(n) / Number(d)) * 100) : 0)

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

function pairColor(p) {
  if (p > 80) return 'text-green-600'
  if (p > 50) return 'text-amber-500'
  return 'text-red-500'
}

const SUPPLIERS_DEF = [
  { key: 'ozh_items',        label: 'OZH',         fill: '#ef4444' },
  { key: 'priceline_items',  label: 'Priceline',   fill: '#f97316' },
  { key: 'totaltools_items', label: 'Total Tools', fill: '#eab308' },
  { key: 'mecca_items',      label: 'Mecca',       fill: '#84cc16' },
  { key: 'sephora_items',    label: 'Sephora',     fill: '#06b6d4' },
  { key: 'house_items',      label: 'House',       fill: '#3b82f6' },
  { key: 'vb_items',         label: "Vic's Bsmt",  fill: '#8b5cf6' },
  { key: 'kg_items',         label: 'Kogan',       fill: '#f43f5e' },
  { key: 'so_items',         label: 'Sherwood',    fill: '#10b981' },
  { key: 'cc_items',         label: 'Costco',      fill: '#f59e0b' },
  { key: 'amazon_items',     label: 'Amazon',      fill: '#ec4899' },
  { key: 'other_items',      label: 'Other',       fill: '#64748b' },
]

function chunkArray(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ─── Limit helpers ────────────────────────────────────────────────────────────
function fmtItems(n) {
  if (n == null || isNaN(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return Number(n).toLocaleString()
}
function fmtAUD(n) {
  if (n == null || isNaN(n)) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${Number(n).toLocaleString()}`
}
function limitPct(used, limit) {
  if (!limit || limit === 0) return 0
  return Math.min(100, Math.round((used / limit) * 100))
}
function limitBarColor(p) {
  if (p >= 90) return '#ef4444'
  if (p >= 80) return '#f59e0b'
  return '#22c55e'
}
function limitTextColor(p) {
  if (p >= 90) return 'text-red-600'
  if (p >= 80) return 'text-amber-500'
  return 'text-green-600'
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
      <CardContent><div className={`${height} bg-muted/40 rounded-lg`} /></CardContent>
    </Card>
  )
}

// ─── Summary card ─────────────────────────────────────────────────────────────
function SummaryCard({ label, value, subLabel, trendLabel, accent, loading, compact }) {
  if (loading) return <SkeletonSummaryCard />
  return (
    <Card className="flex-1 min-w-0">
      <CardHeader className={compact ? 'pb-1 px-3 pt-3' : 'pb-2'}>
        <CardDescription className={`font-medium truncate ${compact ? 'text-xs' : 'text-xs'}`}>{label}</CardDescription>
        <CardTitle
          className={`font-bold tracking-tight ${compact ? 'text-xl leading-tight' : 'text-3xl'}`}
          style={accent ? { color: accent } : {}}
        >
          {fmt(value)}
        </CardTitle>
      </CardHeader>
      <CardContent className={compact ? 'pt-0 px-3 pb-3' : 'pt-0'}>
        <div className={`font-medium text-foreground truncate ${compact ? 'text-xs' : 'text-sm'}`}>{trendLabel}</div>
        <p className={`text-muted-foreground mt-0.5 truncate ${compact ? 'text-[10px]' : 'text-xs'}`}>{subLabel}</p>
      </CardContent>
    </Card>
  )
}

// ─── Stat row inside store card ───────────────────────────────────────────────
function StatRow({ items }) {
  const cells = [...items]
  while (cells.length < 3) cells.push({ label: '', val: '' })
  return (
    <div className="flex border-border pt-4">
      {cells.map((item, i) => {
        const hasContent  = !!item.label
        const prevContent = i > 0 && !!cells[i - 1].label
        return (
          <div key={i} className={`flex-1 min-w-0
            ${hasContent && prevContent ? 'border-l border-border pl-4' : ''}
            ${hasContent && i < 2 && cells[i + 1]?.label ? 'pr-4' : ''}`}>
            {hasContent && <>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 truncate">{item.label}</p>
              <p className={`text-xl font-bold leading-none ${item.color || 'text-foreground'}`}>{item.val}</p>
            </>}
          </div>
        )
      })}
    </div>
  )
}

function DividerLabel({ label }) {
  return (
    <div className="flex items-center gap-2 pt-4 pb-1">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

// ─── Limit mini bar (used inside store cards) ─────────────────────────────────
function LimitMiniBar({ label, used, limit, formatter }) {
  const p         = limitPct(used, limit)
  const barColor  = limitBarColor(p)
  const textColor = limitTextColor(p)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
        <span className={`text-[10px] font-bold ${textColor}`}>{p}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${p}%`, background: barColor }} />
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground">
        <span>{formatter(used)} used</span>
        <span>{formatter(limit)} limit</span>
      </div>
    </div>
  )
}

// ─── Store card ───────────────────────────────────────────────────────────────
function StoreCard({ store, onSelect, limitsMap }) {
  const total       = Number(store.total_items       || 0)
  const active      = Number(store.active_listings   || 0)
  const oos         = Number(store.out_of_stock      || 0)
  const amazon      = Number(store.amazon_items      || 0)
  const other       = Number(store.other_items       || 0)
  const paired      = Number(store.paired            || 0)
  const notUpd      = Number(store.not_updating      || 0)
  const notUpdAzdp  = Number(store.not_updating_azdp || 0)
  const bannedCount = Number(store.banned_count      || 0)
  
  const totalRisk   = notUpd + notUpdAzdp
  const hasBanned   = bannedCount > 0
  const pairedPct   = pct(paired, amazon || total)

  // Check if this store has limit data
  const lim     = limitsMap?.[store.store_name?.toUpperCase()] || null
  const hasLimit = lim && (lim.items_limit > 0 || lim.revenue_limit > 0)
  const ip      = hasLimit ? limitPct(lim.items_listed_sold,   lim.items_limit)   : 0
  const rp      = hasLimit ? limitPct(lim.revenue_listed_sold, lim.revenue_limit) : 0
  const limitWarn = ip >= 80 || rp >= 80

  const activeSuppliers = SUPPLIERS_DEF
    .filter(s => s.key !== 'amazon_items' && s.key !== 'other_items' && Number(store[s.key] || 0) > 0)
    .map(s => ({ label: s.label, val: fmt(Number(store[s.key])) }))
  const supChunks = chunkArray(activeSuppliers, 3)
  const hasSync   = paired > 0 || totalRisk > 0

  // Border: red if banned, amber if limit warning, default otherwise
  const cardBorder = hasBanned
    ? 'bg-red-50/60 border-2 border-red-400 hover:shadow-[0_12px_30px_rgba(239,68,68,0.25)]'
    : limitWarn
      ? 'bg-amber-50/40 border-2 border-amber-400 hover:shadow-[0_12px_30px_rgba(245,158,11,0.20)]'
      : 'bg-card border border-black/70 hover:shadow-[0_12px_30px_rgba(0,0,0,0.18)]'

  return (
    <button
      onClick={() => onSelect(store.store_name)}
      className={`text-left rounded-2xl p-7 w-full shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:cursor-pointer ${cardBorder}`}
    >
      <div className="flex items-start justify-between mb-1">
        <h3 className="text-2xl font-black text-foreground capitalize leading-tight">{store.store_name}</h3>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          {hasBanned && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-white bg-red-500 px-2 py-0.5 rounded-full animate-pulse">
              ⚠ {bannedCount} BANNED
            </span>
          )}
          {limitWarn && !hasBanned && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
              ⚠ LIMIT
            </span>
          )}
        </div>
      </div>
      {store.last_updated && (
        <p className="text-[10px] text-muted-foreground mb-3">Updated {timeAgo(store.last_updated)}</p>
      )}
      <StatRow items={[
        { label: 'All Items',    val: fmt(total)  },
        { label: 'Active',       val: fmt(active) },
        { label: 'Out of Stock', val: fmt(oos)    },
      ]} />
      {(amazon > 0 || other > 0) && (
        <StatRow items={[
          { label: 'Amazon', val: fmt(amazon) },
          { label: 'Other',  val: fmt(other)  },
          { label: '',       val: ''          },
        ]} />
      )}
      {supChunks.map((chunk, i) => <StatRow key={i} items={chunk} />)}
      {hasSync && (
        <>
          <DividerLabel label="AutoDS Sync" />
          <StatRow items={[
            { label: 'Paired ✓',     val: fmt(paired),     color: pairColor(pairedPct) },
            { label: 'Not Updating', val: fmt(totalRisk),  color: totalRisk > 0 ? 'text-red-500' : 'text-foreground' },
            { label: 'Pair Rate',    val: `${pairedPct}%`, color: pairColor(pairedPct) },
          ]} />
        </>
      )}
      {hasBanned && (
        <>
          <DividerLabel label="⚠ Banned SKUs" />
          <StatRow items={[
            { label: 'Banned Live', val: fmt(bannedCount), color: 'text-red-500' },
            { label: '',            val: ''                                       },
            { label: '',            val: ''                                       },
          ]} />
        </>
      )}

      {/* ── Monthly Limits section ── */}
      {hasLimit && (
        <>
          <DividerLabel label={limitWarn ? '⚠ Monthly Limits' : 'Monthly Limits'} />
          <div className="space-y-2 pt-1">
            <LimitMiniBar
              label="Items"
              used={lim.items_listed_sold}
              limit={lim.items_limit}
              formatter={fmtItems}
            />
            <LimitMiniBar
              label="Revenue"
              used={lim.revenue_listed_sold}
              limit={lim.revenue_limit}
              formatter={fmtAUD}
            />
          </div>
        </>
      )}
    </button>
  )
}

// ─── Charts ───────────────────────────────────────────────────────────────────
function TopStoresChart({ stores, loading }) {
  const data = useMemo(() => [...stores]
    .sort((a, b) => Number(b.total_items) - Number(a.total_items))
    .slice(0, 10)
    .map(s => ({
      name:   s.store_name.replace(/au$/i, '').slice(0, 9),
      active: Number(s.active_listings),
      oos:    Number(s.out_of_stock),
    })), [stores])
  const config = { active: { label: 'Active', color: RED }, oos: { label: 'Out of Stock', color: PINK } }
  if (loading) return <SkeletonChart height="h-[240px]" />
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Top 10 Stores by Listings</CardTitle>
        <CardDescription className="text-xs flex items-center gap-4 mt-1">
          <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: RED }} /> Active</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: PINK }} /> Out of Stock</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[220px] w-full">
          <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="name" tick={{ fontSize: 8 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="active" stackId="a" fill={RED}  radius={[0,0,0,0]} />
            <Bar dataKey="oos"    stackId="a" fill={PINK} radius={[3,3,0,0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

function OutOfStockChart({ stores, loading }) {
  const SHADES = ['#7f1d1d','#991b1b','#b91c1c','#dc2626','#ef4444','#f87171','#fca5a5','#fecaca','#fee2e2','#fff1f2']
  const data = useMemo(() => [...stores]
    .sort((a, b) => Number(b.out_of_stock) - Number(a.out_of_stock))
    .slice(0, 10)
    .map((s, i) => ({
      name: s.store_name.replace(/au$/i, '').slice(0, 10),
      oos:  Number(s.out_of_stock),
      fill: SHADES[i],
    })), [stores])
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
            <XAxis type="number" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 8 }} tickLine={false} axisLine={false} width={60} />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="oos" radius={[0,4,4,0]}>
              {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

// ─── Sidebar charts ───────────────────────────────────────────────────────────
function ActiveRateRadial({ summary, loading }) {
  const total  = Number(summary?.total_listings || 0)
  const active = Number(summary?.total_active   || 0)
  const p      = pct(active, total)
  const chartData = [{ value: p, fill: RED }]
  const config    = { active: { label: 'Active Rate', color: RED } }
  if (loading) return <SkeletonChart height="h-[200px]" />
  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle className="text-sm">Active Listing Rate</CardTitle>
        <CardDescription className="text-xs">All eBay listings (all suppliers)</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer config={config} className="mx-auto aspect-square max-h-[180px]">
          <RadialBarChart data={chartData} endAngle={(p / 100) * 360} innerRadius={58} outerRadius={85}>
            <PolarGrid gridType="circle" radialLines={false} stroke="none" className="first:fill-muted last:fill-background" polarRadius={[76, 64]} />
            <RadialBar dataKey="value" background={{ fill: '#fee2e2' }} fill={RED} />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label content={({ viewBox }) => {
                if (!viewBox || !('cx' in viewBox)) return null
                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} y={viewBox.cy} fontSize={28} fontWeight={700} fill="#111">{p}%</tspan>
                    <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 20} fontSize={10} fill="#9ca3af">In stock</tspan>
                  </text>
                )
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

function PairRateRadial({ summary, loading }) {
  const paired = Number(summary?.paired            || 0)
  const total  = Number(summary?.ebay_total_amazon || 0)
  const p      = pct(paired, total)
  const color  = p > 80 ? GREEN : p > 50 ? AMBER : RED
  const bgFill = p > 80 ? '#dcfce7' : p > 50 ? '#fef3c7' : '#fee2e2'
  const chartData = [{ value: p, fill: color }]
  const config    = { pair: { label: 'Pair Rate', color } }
  if (loading) return <SkeletonChart height="h-[200px]" />
  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle className="text-sm">AutoDS Pair Rate</CardTitle>
        <CardDescription className="text-xs">Amazon eBay listings with AutoDS</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer config={config} className="mx-auto aspect-square max-h-[180px]">
          <RadialBarChart data={chartData} endAngle={(p / 100) * 360} innerRadius={58} outerRadius={85}>
            <PolarGrid gridType="circle" radialLines={false} stroke="none" className="first:fill-muted last:fill-background" polarRadius={[76, 64]} />
            <RadialBar dataKey="value" background={{ fill: bgFill }} fill={color} />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label content={({ viewBox }) => {
                if (!viewBox || !('cx' in viewBox)) return null
                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} y={viewBox.cy} fontSize={28} fontWeight={700} fill="#111">{p}%</tspan>
                    <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 20} fontSize={10} fill="#9ca3af">Paired</tspan>
                  </text>
                )
              }} />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-1 text-sm pt-2">
        <div className="flex items-center gap-2 font-medium leading-none text-xs">
          {fmt(paired)} of {fmt(total)} paired
          <TrendingUp className="h-3 w-3" style={{ color }} />
        </div>
        <div className="leading-none text-muted-foreground text-xs">AutoDS coverage</div>
      </CardFooter>
    </Card>
  )
}

function SyncStatusCard({ summary, loading }) {
  if (loading) return <SkeletonChart height="h-[160px]" />
  const total       = Number(summary?.ebay_total_amazon || 0)
  const paired      = Number(summary?.paired            || 0)
  const notUpd      = Number(summary?.not_updating      || 0)
  const notUpdAzdp  = Number(summary?.not_updating_azdp || 0)
  const notOnEbay   = Number(summary?.not_on_ebay       || 0)
  const autodsTotal = Number(summary?.autods_total      || 0)
  const computedAt  = summary?.computed_at

  const bars = [
    { label: 'Paired ✓',        value: paired,     color: GREEN, total },
    { label: 'Not Updating',    value: notUpd,     color: RED,   total },
    { label: 'Not Upd. (AZDP)', value: notUpdAzdp, color: PINK,  total },
    { label: 'Not on eBay',     value: notOnEbay,  color: AMBER, total: autodsTotal },
  ]

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">eBay Sync Status</CardTitle>
        <CardDescription className="text-xs">
          Amazon listings pairing
          {computedAt && <span className="ml-1 opacity-60">· cache {timeAgo(computedAt)}</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {bars.map(b => {
          const p = pct(b.value, b.total)
          return (
            <div key={b.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{b.label}</span>
                <span className="font-medium tabular-nums">{fmt(b.value)} <span className="text-muted-foreground/50">({p}%)</span></span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${p}%`, background: b.color }} />
              </div>
            </div>
          )
        })}
        <p className="text-[10px] text-muted-foreground pt-1">{fmt(paired)} of {fmt(total)} Amazon eBay listings synced</p>
      </CardContent>
    </Card>
  )
}

function SupplierDonutChart({ stores, loading }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const pieData = useMemo(() => SUPPLIERS_DEF.map(s => ({
    key: s.key, supplier: s.label,
    items: stores.reduce((acc, store) => acc + Number(store[s.key] || 0), 0),
    fill: s.fill,
  })).filter(s => s.items > 0).sort((a, b) => b.items - a.items), [stores])
  const config = useMemo(() => Object.fromEntries(pieData.map(s => [s.supplier, { label: s.supplier, color: s.fill }])), [pieData])
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
            <Pie data={pieData} dataKey="items" nameKey="supplier" innerRadius={58} outerRadius={85} strokeWidth={3}
              activeIndex={activeIndex} onMouseEnter={(_, index) => setActiveIndex(index)}
              activeShape={({ outerRadius = 0, ...props }) => <Sector {...props} outerRadius={outerRadius + 10} />}>
              <Label content={({ viewBox }) => {
                if (!viewBox || !('cx' in viewBox)) return null
                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} y={(viewBox.cy || 0) - 8} fontSize={22} fontWeight={700} fill="#111">
                      {active ? Math.round((active.items / total) * 100) : 0}%
                    </tspan>
                    <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 12} fontSize={10} fill="#9ca3af">{active?.supplier}</tspan>
                  </text>
                )
              }} />
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
                <span className="text-muted-foreground/60 text-[10px] w-7 text-right">{total > 0 ? Math.round((s.items / total) * 100) : 0}%</span>
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
        <div className="leading-none text-muted-foreground text-xs">{fmt(total)} total items tracked</div>
      </CardFooter>
    </Card>
  )
}

// ─── Export section ───────────────────────────────────────────────────────────
const EXPORT_GROUPS = [
  {
    title: 'eBay Listings',
    headerText: 'text-blue-700',
    exports: [
      { id: 'ebay-active-amazon',    label: 'Amazon Active',        icon: Package,      iconColor: 'text-blue-500',   url: `${BASE_URL}/api/export/ebay-active`,            filename: 'ebay_amazon_active.csv' },
      { id: 'ebay-oos-amazon',       label: 'Amazon OOS',           icon: PackageX,     iconColor: 'text-red-500',    url: `${BASE_URL}/api/export/ebay-oos`,               filename: 'ebay_amazon_oos.csv' },
      { id: 'ebay-active-supplier',  label: 'Supplier Active',      icon: Package,      iconColor: 'text-teal-500',   url: `${BASE_URL}/api/export/ebay-active-supplier`,   filename: 'ebay_supplier_active.csv' },
      { id: 'ebay-oos-supplier',     label: 'Supplier OOS',         icon: PackageX,     iconColor: 'text-orange-400', url: `${BASE_URL}/api/export/ebay-oos-supplier`,      filename: 'ebay_supplier_oos.csv' },
      { id: 'ebay-active-no-autods', label: 'Active — No AutoDS',   icon: ZapOff,       iconColor: 'text-orange-500', url: `${BASE_URL}/api/export/ebay-active-no-autods`,  filename: 'ebay_active_no_autods.csv' },
      { id: 'ebay-dead-no-autods',   label: 'OOS — No AutoDS',      icon: ListX,        iconColor: 'text-rose-500',   url: `${BASE_URL}/api/export/ebay-oos-no-autods`,     filename: 'ebay_oos_no_autods.csv' },
      { id: 'ebay-no-autods',        label: 'All — No AutoDS',      icon: AlertCircle,  iconColor: 'text-amber-500',  url: `${BASE_URL}/api/export/ebay-no-autods`,          filename: 'ebay_not_in_autods.csv' },
    ],
  },
  {
    title: 'AutoDS',
    headerText: 'text-green-700',
    exports: [
      { id: 'autods-matched',    label: 'AutoDS Matched',      icon: CheckCircle2, iconColor: 'text-green-600',  url: `${BASE_URL}/api/export/autods-matched`,    filename: 'autods_matched.csv' },
      { id: 'autods-all',        label: 'AutoDS All',          icon: Package,      iconColor: 'text-teal-500',   url: `${BASE_URL}/api/export/autods-all`,         filename: 'autods_all.csv' },
      { id: 'autods-not-ebay',   label: 'Not on eBay',         icon: Clock,        iconColor: 'text-purple-500', url: `${BASE_URL}/api/export/autods-not-ebay`,    filename: 'autods_not_on_ebay.csv' },
      { id: 'not-updating-azdp', label: 'Not Updating (AZDP)', icon: Zap,          iconColor: 'text-yellow-500', url: `${BASE_URL}/api/export/not-updating-azdp`,  filename: 'not_updating_azdp.csv' },
    ],
  },
  {
    title: 'Supplier Inventory',
    headerText: 'text-purple-700',
    exports: [
      { id: 'all-paired',         label: 'All Paired',              icon: PackageCheck, iconColor: 'text-green-600',  url: `${BASE_URL}/api/export/all-paired`,               filename: 'all_paired.csv' },
      { id: 'nonamazon-unlisted', label: 'Non-Amazon Never Listed', icon: TrendingUp,   iconColor: 'text-purple-500', url: `${BASE_URL}/api/export/nonamazon-unlisted`,       filename: 'nonamazon_never_listed.csv', hintText: '~81k rows' },
    ],
  },
]

function ExportSection({ summary, loading }) {
  const [downloading, setDownloading] = useState({})
  const [errors,      setErrors]      = useState({})
  const [counts,      setCounts]      = useState({})

  useEffect(() => {
    fetch(`${BASE_URL}/api/export/counts`)
      .then(r => r.json())
      .then(d => { if (!d.error) setCounts(d) })
      .catch(() => {})
  }, [])

  async function handleDownload(exp) {
    setDownloading(d => ({ ...d, [exp.id]: true }))
    setErrors(e => ({ ...e, [exp.id]: null }))
    try {
      const resp = await fetch(exp.url)
      if (!resp.ok) throw new Error(`${resp.status}`)
      const blob = await resp.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = exp.filename
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch (err) {
      setErrors(e => ({ ...e, [exp.id]: err.message }))
    } finally {
      setDownloading(d => ({ ...d, [exp.id]: false }))
    }
  }

  if (loading) return (
    <Card className="animate-pulse">
      <CardContent className="py-3 px-4">
        <div className="h-24 bg-muted/40 rounded-lg" />
      </CardContent>
    </Card>
  )

  return (
    <Card>
      <CardContent className="p-0">
        <div className="grid grid-cols-3 divide-x divide-border">
          {EXPORT_GROUPS.map(group => (
            <div key={group.title} className="px-3 py-2">
              <p className={`text-[9px] font-bold uppercase tracking-widest mb-1 ${group.headerText}`}>
                {group.title}
              </p>
              <div className="grid grid-cols-2 gap-x-1 gap-y-0">
                {group.exports.map(exp => {
                  const Icon      = exp.icon
                  const isLoading = downloading[exp.id]
                  const hasError  = errors[exp.id]
                  const countVal  = counts[exp.id] !== undefined
                    ? Number(counts[exp.id])
                    : exp.summaryKey ? Number(summary?.[exp.summaryKey] || 0) : null
                  const count = exp.hintText || (countVal !== null && countVal > 0 ? fmt(countVal) : null)

                  return (
                    <button key={exp.id} onClick={() => handleDownload(exp)} disabled={isLoading}
                      title={exp.desc + (exp.slow ? ' (~20s)' : '')}
                      className={`flex items-center justify-between gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-all w-full group
                        ${hasError ? 'bg-red-50 text-red-600' : isLoading ? 'opacity-50 cursor-not-allowed text-muted-foreground' : 'hover:bg-muted text-foreground'}`}>
                      <div className="flex items-center gap-1 min-w-0">
                        {isLoading ? (
                          <svg className="animate-spin h-2.5 w-2.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                          </svg>
                        ) : (
                          <Icon size={10} className={`flex-shrink-0 ${exp.iconColor}`} />
                        )}
                        <span className="truncate text-[11px]">{exp.label}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {count && !isLoading && (
                          <span className="text-muted-foreground tabular-nums text-[10px] font-normal">{count}</span>
                        )}
                        {hasError
                          ? <span className="text-red-500 text-[10px]">✕</span>
                          : <Download size={9} className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Filter bar ───────────────────────────────────────────────────────────────
function FilterBar({
  search, onSearch, supplierFilter, onSupplierFilter, stockFilter, onStockFilter,
  resultCount, totalCount, onSkuLookup, onRefresh, refreshing, onLimitsPage,
  onSkuCount, skuCountLoading,   // ← add these
}) {
  const hasFilters = search || supplierFilter || stockFilter
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Search stores…"
          className="w-full pl-8 pr-8 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/60 transition-all"
        />
        {search && (
          <button onClick={() => onSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={12} />
          </button>
        )}
      </div>
      <div className="relative">
        <SlidersHorizontal size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <select
          value={supplierFilter}
          onChange={e => onSupplierFilter(e.target.value)}
          className="pl-8 pr-7 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer text-foreground transition-all"
        >
          <option value="">All Suppliers</option>
          {SUPPLIERS_DEF.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>
      <select
        value={stockFilter}
        onChange={e => onStockFilter(e.target.value)}
        className="px-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer text-foreground transition-all"
      >
        <option value="">All Stock</option>
        <option value="in">Has Active Listings</option>
        <option value="out">Has Out-of-Stock</option>
      </select>
      {hasFilters && (
        <>
          <button onClick={() => { onSearch(''); onSupplierFilter(''); onStockFilter('') }}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            <X size={11} /> Clear
          </button>
          <span className="text-xs text-muted-foreground">{resultCount} of {totalCount}</span>
        </>
      )}

      {/* ── Right side buttons ── */}
      <div className="ml-auto flex items-center gap-2">
        {/* Refresh store stats */}
        <button
          onClick={onRefresh}
          disabled={refreshing}
          title="Recalculate store stats from live listings"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg bg-muted/30 hover:bg-muted/60 transition-all disabled:opacity-50 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>

        {/* Store Limits */}
        <button
          onClick={onLimitsPage}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg bg-muted/30 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 transition-all group"
        >
          <TrendingUp size={12} className="text-muted-foreground group-hover:text-amber-500 transition-colors" />
          Store Limits
          <ChevronRight size={11} className="text-muted-foreground/50 group-hover:text-amber-400 transition-colors" />
        </button>

        {/* SKU Lookup */}
        <button
          onClick={onSkuLookup}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg bg-muted/30 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all group"
        >
          <FileSearch size={12} className="text-muted-foreground group-hover:text-blue-500 transition-colors" />
          SKU Lookup
          <ChevronRight size={11} className="text-muted-foreground/50 group-hover:text-blue-400 transition-colors" />
        </button>
        {/* SKU Count Download */}
<button
  onClick={onSkuCount}
  disabled={skuCountLoading}
  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg bg-muted/30 hover:bg-green-50 hover:border-green-300 hover:text-green-700 transition-all group disabled:opacity-50"
>
  {skuCountLoading
    ? <svg className="animate-spin h-3 w-3 text-green-500" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
    : <Hash size={12} className="text-muted-foreground group-hover:text-green-500 transition-colors" />
  }
  {skuCountLoading ? 'Building…' : 'SKU Count'}
  {!skuCountLoading && <Download size={9} className="text-muted-foreground/40 group-hover:text-green-400 transition-colors" />}
</button>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function StoresTab() {
  const [stores,         setStores]         = useState(STORES_CACHE.data  || [])
  const [summary,        setSummary]        = useState(SUMMARY_CACHE.data || null)
  const [suppliers,      setSuppliers]      = useState(SUPPLIER_CACHE.data || null)
  const [loading,        setLoading]        = useState(!STORES_CACHE.data)
  const [lastSynced,     setLastSynced]     = useState({ ebay: null, autods: null })
  const [selectedStore,  setSelectedStore]  = useState(null)
  const [showBanned,     setShowBanned]     = useState(false)
  const [bannedStore,    setBannedStore]    = useState(null)
  const [bannedTotal,    setBannedTotal]    = useState(0)
  const [bannedOnEbay,   setBannedOnEbay]   = useState(0)
  const [showSkuLookup,  setShowSkuLookup]  = useState(false)
  const [showLimitsPage, setShowLimitsPage] = useState(false)
  const [limitsMap,      setLimitsMap]      = useState({})
  const [search,         setSearch]         = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [stockFilter,    setStockFilter]    = useState('')
  const [refreshing,     setRefreshing]     = useState(false)
  const [bannedAutodsTotal,     setBannedAutodsTotal]     = useState(0)
  const [bannedAutodsWithStock, setBannedAutodsWithStock] = useState(0)
  const [skuCountLoading, setSkuCountLoading] = useState(false)


  useEffect(() => {
    async function load() {
      const [syncedData, countData] = await Promise.all([
        api.get('/api/sync/last-synced'),
        api.get('/api/banned-skus/count'),
      ])
      if (syncedData) setLastSynced(syncedData)
      if (countData) {
        setBannedTotal(countData.total)
        setBannedOnEbay(countData.on_ebay)
        setBannedAutodsTotal(countData.autods_total || 0)
        setBannedAutodsWithStock(countData.autods_with_stock || 0)
      }

      if (STORES_CACHE.data && Date.now() - STORES_CACHE.ts < STALE_MS) return
      if (!STORES_CACHE.data) setLoading(true)

      const [storeData, sumData, supData, limitsData] = await Promise.all([
        api.get('/api/stores/combined'),
        api.get('/api/stores/summary'),
        api.get('/api/stores/suppliers'),
        api.get('/api/store-limits'),
      ])
      if (Array.isArray(storeData))           { setStores(storeData);  STORES_CACHE.data   = storeData; STORES_CACHE.ts   = Date.now() }
      if (sumData && !Array.isArray(sumData)) { setSummary(sumData);   SUMMARY_CACHE.data  = sumData;   SUMMARY_CACHE.ts  = Date.now() }
      if (supData && !Array.isArray(supData)) { setSuppliers(supData); SUPPLIER_CACHE.data = supData;   SUPPLIER_CACHE.ts = Date.now() }

      // Build limitsMap: { STORENAME_UPPER: limitRow }
      if (Array.isArray(limitsData)) {
        const map = {}
        limitsData.forEach(l => { map[l.store_name.toUpperCase()] = l })
        setLimitsMap(map)
      }

      setLoading(false)
    }
    load()
  }, [])
async function handleSkuCount() {
  setSkuCountLoading(true)
  try {
    const resp = await fetch(`${BASE_URL}/api/export/sku-count`)
    if (!resp.ok) throw new Error(`${resp.status}`)
    const blob = await resp.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    a.href = url; a.download = `sku_count_${date}.csv`
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
  } catch (e) {
    console.error('SKU count failed:', e)
  } finally {
    setSkuCountLoading(false)
  }
}
  async function handleRefresh() {
    setRefreshing(true)
    try {
      const resp = await fetch(`${BASE_URL}/api/sync/refresh-all`, { method: 'POST' })
      const { results } = await resp.json()
      console.log('Refresh results:', results)

      STORES_CACHE.ts   = 0
      SUMMARY_CACHE.ts  = 0
      SUPPLIER_CACHE.ts = 0

      const [storeData, sumData, supData, countData, limitsData] = await Promise.all([
        api.get('/api/stores/combined'),
        api.get('/api/stores/summary'),
        api.get('/api/stores/suppliers'),
        api.get('/api/banned-skus/count'),
        api.get('/api/store-limits'),
      ])
      if (Array.isArray(storeData))           { setStores(storeData);    STORES_CACHE.data   = storeData; STORES_CACHE.ts   = Date.now() }
      if (sumData && !Array.isArray(sumData)) { setSummary(sumData);     SUMMARY_CACHE.data  = sumData;   SUMMARY_CACHE.ts  = Date.now() }
      if (supData && !Array.isArray(supData)) { setSuppliers(supData);   SUPPLIER_CACHE.data = supData;   SUPPLIER_CACHE.ts = Date.now() }
      if (countData) {
        setBannedTotal(countData.total)
        setBannedOnEbay(countData.on_ebay)
        setBannedAutodsTotal(countData.autods_total || 0)
        setBannedAutodsWithStock(countData.autods_with_stock || 0)
      }
      if (Array.isArray(limitsData)) {
        const map = {}
        limitsData.forEach(l => { map[l.store_name.toUpperCase()] = l })
        setLimitsMap(map)
      }
    } catch (e) {
      console.error('Refresh failed:', e)
    } finally {
      setRefreshing(false)
    }
  }

  const filteredStores = useMemo(() => stores.filter(store => {
    if (search && !store.store_name.toLowerCase().includes(search.toLowerCase())) return false
    if (supplierFilter && Number(store[supplierFilter] || 0) === 0) return false
    if (stockFilter === 'in'  && Number(store.active_listings || 0) === 0) return false
    if (stockFilter === 'out' && Number(store.out_of_stock    || 0) === 0) return false
    return true
  }), [stores, search, supplierFilter, stockFilter])

  // eBay numbers
  const totalListings = Number(summary?.total_listings || 0)
  const totalActive   = Number(summary?.total_active   || 0)
  const totalOos      = Number(summary?.total_oos       || 0)
const storeCount       = stores.length
const activeStoreCount = stores.filter(s => Number(s.total_items || 0) > 0).length
  // Amazon/AutoDS numbers
  const amazonTotal  = Number(summary?.ebay_total_amazon || 0)
  // const amazonTotal = stores.reduce((acc, s) => acc + Number(s.amazon_items || 0), 0)

  const autodsTotal  = Number(summary?.autods_total       || 0)
  const paired       = Number(summary?.paired             || 0)
  const notUpdating  = Number(summary?.not_updating       || 0) + Number(summary?.not_updating_azdp || 0)
  const pairedPct    = pct(paired, amazonTotal)

  const noData    = !loading && stores.length === 0
  const storeCols = filteredStores.length === 1 ? 1 : filteredStores.length >= 5 ? 3 : 2

  // ── Page-level navigation guards ──
  if (selectedStore)  return <StoreListingsPage storeName={selectedStore} onBack={() => setSelectedStore(null)} />
  if (showBanned)     return <BannedSkusPage initialStore={bannedStore} onBack={() => { setShowBanned(false); setBannedStore(null); STORES_CACHE.ts = 0 }} />
  if (showSkuLookup)  return <SkuLookupPage onBack={() => setShowSkuLookup(false)} />
  if (showLimitsPage) return <StoreLimitsPage onBack={() => setShowLimitsPage(false)} />

  return (
    <div className="p-6 space-y-6">

      {/* ── Combined summary ── */}
      <div>
        <p className="text-xs text-muted-foreground font-medium mb-3">
          eBay Overview <span className="opacity-50">— all suppliers</span>
          {!loading && (
            <>
              {lastSynced.ebay && (
                <span className="ml-2 opacity-60">· eBay synced {timeAgo(lastSynced.ebay)}</span>
              )}
              {lastSynced.autods && (
                <span className="ml-2 opacity-60">· AutoDS synced {timeAgo(lastSynced.autods)}</span>
              )}
            </>
          )}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-9 gap-4">
          <SummaryCard label="Total Listings"    value={totalListings} trendLabel="total this period"           subLabel="All eBay store listings"      loading={loading} compact />
          <SummaryCard label="Active Listings"   value={totalActive}   trendLabel="active this period"          subLabel="Currently in stock & live"     loading={loading} compact />
          <SummaryCard label="Out of Stock"      value={totalOos}      trendLabel="out of stock items"          subLabel="Needs restocking attention"    loading={loading} compact />
<SummaryCard
  label="Stores"
  value={storeCount}
  trendLabel={`${activeStoreCount} active · ${storeCount - activeStoreCount} inactive`}
  subLabel="eBay seller accounts tracked"
  loading={loading}
  compact
/>          <SummaryCard label="Amazon on eBay"    value={amazonTotal}   trendLabel="Amazon SKUs on eBay"         subLabel="A-prefix and AZDP listings"    loading={loading} compact />
          <SummaryCard label="AutoDS Products"   value={autodsTotal}   trendLabel="ASINs monitored"             subLabel="In AutoDS monitoring"          loading={loading} compact />
          <SummaryCard label="eBay + AutoDS"     value={paired}        trendLabel={`${pairedPct}% pair rate`}   subLabel="Amazon listings monitored"     accent="#22c55e"  loading={loading} compact />
          <SummaryCard label="Not Updating"      value={notUpdating}   trendLabel="need to be updated"          subLabel="No AutoDS monitoring"          accent="#ef4444"  loading={loading} compact />
          <div onClick={() => setShowBanned(true)} className="cursor-pointer col-span-2 sm:col-span-1">
            <SummaryCard
              label="Banned SKUs"
              value={bannedOnEbay}
              trendLabel={`${bannedTotal} banned · ${bannedAutodsTotal} in AutoDS`}
              subLabel={bannedAutodsWithStock > 0 ? `⚠ ${bannedAutodsWithStock} AutoDS still has stock` : 'Needs immediate removal'}
              accent={bannedOnEbay > 0 || bannedAutodsWithStock > 0 ? '#ef4444' : '#22c55e'}
              loading={loading}
              compact
            />
          </div>
        </div>
      </div>

      {/* ── Main layout ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6 items-start">

        {/* LEFT */}
        <div className="space-y-6">

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TopStoresChart  stores={stores} loading={loading} />
            <OutOfStockChart stores={stores} loading={loading} />
          </div>

          {/* Exports */}
          <ExportSection summary={summary} loading={loading} />

          {/* Store cards */}
          <div className="space-y-4">
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground font-medium">
                Stores <span className="opacity-50">({stores.length})</span>
              </p>
              {!loading && (
                <FilterBar
                  search={search}                 onSearch={setSearch}
                  supplierFilter={supplierFilter} onSupplierFilter={setSupplierFilter}
                  stockFilter={stockFilter}       onStockFilter={setStockFilter}
                  resultCount={filteredStores.length} totalCount={stores.length}
                  onSkuLookup={() => setShowSkuLookup(true)}
                  onLimitsPage={() => setShowLimitsPage(true)}
                  onSkuCount={handleSkuCount}
                  skuCountLoading={skuCountLoading}
                  onRefresh={handleRefresh}
                  refreshing={refreshing}
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
            ) : filteredStores.length === 0 ? (
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
                {filteredStores.map(store => (
                  <StoreCard
                    key={store.store_name}
                    store={store}
                    limitsMap={limitsMap}
                    onSelect={name => {
                      const s = stores.find(x => x.store_name === name)
                      if (s && Number(s.banned_count || 0) > 0) {
                        setBannedStore(name)
                        setShowBanned(true)
                      } else {
                        setSelectedStore(name)
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="xl:sticky xl:top-6 space-y-4">
          <ActiveRateRadial   summary={summary} loading={loading} />
          <PairRateRadial     summary={summary} loading={loading} />
          <SyncStatusCard     summary={summary} loading={loading} />
          <SupplierDonutChart stores={stores}   loading={loading} />
        </div>
      </div>
    </div>
  )
}