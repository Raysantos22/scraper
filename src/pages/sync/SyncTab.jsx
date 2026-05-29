// SyncTab.jsx — matches EbayTab design language exactly
import React, { useState, useEffect, useMemo } from 'react'
import { api } from '../../lib/api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
  PieChart, Pie, Sector,
  RadialBarChart, RadialBar, PolarGrid, PolarRadiusAxis, Label,
} from 'recharts'
import {
  AlertTriangle, CheckCircle2, Search, X, ChevronLeft, ChevronRight,
  RefreshCw, Download, ShieldAlert, Unlink, Trash2, Activity,
  ArrowDown, Package, ChevronDown, ChevronUp, TrendingUp,
} from 'lucide-react'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter,
} from '@/components/ui/card'
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from '@/components/ui/chart'

// ─── Cache ───────────────────────────────────────────────────────────────────
const STATS_CACHE  = { data: null, ts: 0 }
const HEALTH_CACHE = { data: null, ts: 0 }
const STALE_MS     = 60_000

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

// ─── Skeletons (match EbayTab pattern) ───────────────────────────────────────
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
function SkeletonChart({ height = 'h-[220px]' }) {
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

// ─── Summary stat card — exactly like EbayTab SummaryCard ────────────────────
function SummaryCard({ label, value, subLabel, accent, Icon, badge, loading }) {
  if (loading) return <SkeletonSummaryCard />
  return (
    <Card className="flex-1 min-w-0">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardDescription className="text-xs font-medium">{label}</CardDescription>
          <div className="flex items-center gap-1.5">
            {badge && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: accent + '20', color: accent }}>{badge}</span>
            )}
            {Icon && <Icon size={13} style={{ color: accent }} />}
          </div>
        </div>
        <CardTitle className="text-3xl font-bold tracking-tight" style={{ color: accent }}>
          {fmt(value)}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-xs text-muted-foreground">{subLabel}</p>
      </CardContent>
    </Card>
  )
}

// ─── Problem definitions ─────────────────────────────────────────────────────
const PROBLEMS = [
  {
    key:          'active_no_autods',
    title:        'eBay Active — No AutoDS',
    badge:        'HIGH RISK',
    badgeStyle:   'bg-red-100 text-red-700',
    cardStyle:    'border-red-200 bg-red-50',
    titleStyle:   'text-red-800',
    countColor:   '#ef4444',
    Icon:         ShieldAlert,
    iconColor:    '#ef4444',
    exportStatus: 'active_no_autods',
    exportBg:     'bg-red-50 border-red-200',
    what:    'Live eBay listings where AutoDS stopped monitoring the Amazon source — price & stock are frozen.',
    example: 'Amazon price jumps $18→$52. Your eBay listing still shows $24. You sell it, buy at $52, lose $28 per order.',
    fix:     'Re-add to AutoDS or end listings immediately.',
  },
  {
    key:          'active_no_skumap',
    title:        'eBay Active — No SKU Map',
    badge:        'BLIND',
    badgeStyle:   'bg-orange-100 text-orange-700',
    cardStyle:    'border-orange-200 bg-orange-50',
    titleStyle:   'text-orange-800',
    countColor:   '#f97316',
    Icon:         Unlink,
    iconColor:    '#f97316',
    exportStatus: 'active_no_skumap',
    exportBg:     'bg-orange-50 border-orange-200',
    what:    'Live listings with no Amazon ASIN linked — completely invisible to your monitoring system, forever.',
    example: 'SKU "A9123456789" is live with qty=5 but not in sku_map. AutoDS has no ASIN to watch. Runs on stale data indefinitely.',
    fix:     'Export, find the correct ASIN for each SKU, add rows to sku_map.',
  },
  {
    key:          'autods_not_ebay',
    title:        'AutoDS Monitoring — Not Listed',
    badge:        'OPPORTUNITY',
    badgeStyle:   'bg-blue-100 text-blue-700',
    cardStyle:    'border-blue-200 bg-blue-50',
    titleStyle:   'text-blue-800',
    countColor:   '#3b82f6',
    Icon:         Package,
    iconColor:    '#3b82f6',
    exportStatus: null,
    exportBg:     null,
    what:    'AutoDS is watching these ASINs but you have no eBay listing for them. Paying to monitor, earning nothing.',
    example: 'ASIN B0GZKVSJRX: monitored at $43.49, stock=3. No eBay listing. You pay AutoDS, sell nothing.',
    fix:     'List them on eBay or delete from AutoDS to cut monitoring costs.',
  },
  {
    key:          'dead_no_autods',
    title:        'eBay Dead — No AutoDS',
    badge:        'CLEAN UP',
    badgeStyle:   'bg-gray-100 text-gray-600',
    cardStyle:    'border-gray-200 bg-gray-50',
    titleStyle:   'text-gray-700',
    countColor:   '#6b7280',
    Icon:         Trash2,
    iconColor:    '#9ca3af',
    exportStatus: 'dead_no_autods',
    exportBg:     'bg-gray-50 border-gray-200',
    what:    'qty=0 listings with no AutoDS monitoring — dead weight cluttering your store and hurting search rank.',
    example: 'A USB hub, out of stock 8 months, AutoDS dropped it. Sits at qty=0, invisible to buyers, still counts against store health.',
    fix:     'Bulk-end via eBay\'s bulk tool. Export list below.',
  },
]

// ─── Browse table tabs ────────────────────────────────────────────────────────
const BROWSE_TABS = [
  { id: 'unmonitored', label: 'Unmonitored',  endpoint: '/api/sync/unmonitored', desc: 'On eBay, has SKU map, but AutoDS stopped monitoring the ASIN' },
  { id: 'not-mapped',  label: 'Not Mapped',   endpoint: '/api/sync/not-mapped',  desc: 'On eBay but the eBay SKU is not in sku_map — no ASIN link' },
  { id: 'autods-only', label: 'AutoDS Only',  endpoint: '/api/sync/autods-only', desc: 'In AutoDS monitoring but no corresponding eBay listing exists' },
]

// ─── Export button ────────────────────────────────────────────────────────────
function ExportBtn({ status, label, count, color, bg, BtnIcon, small }) {
  const [loading, setLoading] = useState(false)
  const [done, setDone]       = useState(false)

  async function go(e) {
    e.stopPropagation()
    if (loading) return
    setLoading(true); setDone(false)
    try {
      const url = `${import.meta.env.VITE_API_URL || ''}/api/sync/export-csv?status=${status}`
    //   const url = directUrl || `${import.meta.env.VITE_API_URL || ''}/api/sync/export-csv?status=${status}`
      const res  = await fetch(url)
      if (!res.ok) throw new Error('Export failed')
      const blob    = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a       = Object.assign(document.createElement('a'), {
        href: blobUrl,
        download: `sync_${status}_${new Date().toISOString().slice(0,10)}.csv`,
      })
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
      setDone(true); setTimeout(() => setDone(false), 3000)
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  const spinner = (
    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
    </svg>
  )

  if (small) return (
    <button onClick={go} disabled={loading}
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all
        ${done ? 'bg-green-50 border-green-300 text-green-700' : `${bg} hover:shadow-sm`}
        ${loading ? 'opacity-70 cursor-wait' : 'cursor-pointer'}`}>
      {loading ? spinner : done ? <CheckCircle2 size={12} className="text-green-600" /> : <Download size={12} style={{ color }} />}
      {loading ? 'Preparing…' : done ? '✓ Downloaded' : `Export ${fmt(count)} SKUs`}
    </button>
  )

  return (
    <button onClick={go} disabled={loading}
      className={`flex flex-col gap-1 p-3 rounded-xl border-2 transition-all text-left w-full
        ${done ? 'bg-green-50 border-green-300' : bg}
        ${loading ? 'opacity-80 cursor-wait' : 'hover:shadow-md cursor-pointer'}`}>
      <div className="flex items-center justify-between">
        <BtnIcon size={13} style={{ color: done ? '#22c55e' : color }} />
        {loading ? spinner : done ? <CheckCircle2 size={10} className="text-green-500" /> : <Download size={10} className="text-muted-foreground" />}
      </div>
      <span className="text-xs font-semibold text-foreground mt-1">{label}</span>
      <span className="text-[11px] text-muted-foreground tabular-nums">
        {loading ? 'Preparing…' : done ? '✓ Downloaded' : `${fmt(count)} SKUs`}
      </span>
    </button>
  )
}

// ─── Problem card ─────────────────────────────────────────────────────────────
function ProblemCard({ p, health, loading }) {
  const [open, setOpen] = useState(false)

  const countMap = {
    active_no_autods: health?.active_no_autods,
    active_no_skumap: health?.active_no_skumap,
    autods_not_ebay:  health?.autods_not_ebay,
    dead_no_autods:   (Number(health?.dead_no_autods || 0) + Number(health?.dead_no_skumap || 0)),
  }
  const count = countMap[p.key] || 0
  const Icon  = p.Icon

  if (loading) return (
    <Card className="animate-pulse">
      <CardHeader className="pb-2">
        <div className="h-3 w-16 bg-muted rounded mb-2" />
        <div className="h-7 w-24 bg-muted rounded" />
      </CardHeader>
      <CardContent><div className="h-3 w-full bg-muted/60 rounded" /></CardContent>
    </Card>
  )

  return (
    <Card className={`overflow-hidden border-2 ${p.cardStyle}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${p.badgeStyle}`}>{p.badge}</span>
          </div>
          <Icon size={15} style={{ color: p.iconColor }} className="opacity-50 mt-0.5 shrink-0" />
        </div>
        <CardDescription className={`text-[11px] font-semibold uppercase tracking-wide mt-1 ${p.titleStyle}`}>
          {p.title}
        </CardDescription>
        <CardTitle className="text-3xl font-bold tracking-tight" style={{ color: p.countColor }}>
          {fmt(count)}
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* Short what + example always visible */}
        <p className="text-xs text-muted-foreground leading-relaxed">{p.what}</p>

        {/* Inline export */}
        {p.exportStatus && (
          <ExportBtn
            status={p.exportStatus} label="Export CSV" count={count}
            color={p.iconColor} bg={p.exportBg} BtnIcon={Download} small
          />
        )}
        {p.key === 'autods_not_ebay' && (
            <ExportBtn
                status="_autods_only_direct"
                directUrl={`${import.meta.env.VITE_API_URL || ''}/api/sync/export-autods-only`}
                label="Export CSV" count={count}
                color="#3b82f6" bg="bg-blue-50 border-blue-200" BtnIcon={Download} small
            />
            )}

        {/* Expand toggle */}
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full">
          {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          {open ? 'Hide example' : 'Show example & fix'}
        </button>
      </CardContent>

      {/* Expandable: example + fix */}
      {open && (
        <div className="border-t border-current/10 px-6 py-4 bg-white/60 space-y-3">
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-1">Example</div>
            <p className="text-xs text-amber-900 leading-relaxed">{p.example}</p>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Fix</div>
            <p className="text-xs font-medium text-foreground leading-relaxed">{p.fix}</p>
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── Coverage bar (reusable) ──────────────────────────────────────────────────
function CoverageBar({ label, value, total, color }) {
  const p = pct(value, total)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{fmt(value)} <span className="text-muted-foreground/50">({p}%)</span></span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${p}%`, background: color }} />
      </div>
    </div>
  )
}

// ─── Match rate radial — mirrors EbayTab ActiveRateRadial ─────────────────────
function MatchRateRadial({ matched, total, loading }) {
  const matchPct  = pct(matched, total)
  const chartData = [{ value: matchPct, fill: '#22c55e' }]
  const config    = { match: { label: 'Match Rate', color: '#22c55e' } }

  if (loading) return <SkeletonChart height="h-[180px]" />

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle className="text-sm">Match Rate</CardTitle>
        <CardDescription className="text-xs">eBay listings with AutoDS</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer config={config} className="mx-auto aspect-square max-h-[180px]">
          <RadialBarChart data={chartData} endAngle={(matchPct / 100) * 360} innerRadius={58} outerRadius={85}>
            <PolarGrid gridType="circle" radialLines={false} stroke="none"
              className="first:fill-muted last:fill-background" polarRadius={[76, 64]} />
            <RadialBar dataKey="value" background={{ fill: '#dcfce7' }} fill="#22c55e" />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label content={({ viewBox }) => {
                if (!viewBox || !('cx' in viewBox)) return null
                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} y={viewBox.cy} fontSize={28} fontWeight={700} fill="#111">{matchPct}%</tspan>
                    <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 20} fontSize={10} fill="#9ca3af">Matched</tspan>
                  </text>
                )
              }} />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-1 text-sm pt-2">
        <div className="flex items-center gap-2 font-medium leading-none text-xs">
          {fmt(matched)} of {fmt(total)} listings
          <TrendingUp className="h-3 w-3 text-green-500" />
        </div>
        <div className="leading-none text-muted-foreground text-xs">healthy eBay coverage</div>
      </CardFooter>
    </Card>
  )
}

// ─── At-risk donut — mirrors EbayTab SupplierDonutChart ──────────────────────
function RiskDonut({ health, loading }) {
  const [activeIndex, setActiveIndex] = useState(0)

  const pieData = useMemo(() => [
    { name: 'Matched',            value: Number(health?.matched_rows      || 0), fill: '#22c55e' },
    { name: 'Active — no AutoDS', value: Number(health?.active_no_autods  || 0), fill: '#ef4444' },
    { name: 'Active — no SKU',    value: Number(health?.active_no_skumap  || 0), fill: '#f97316' },
    { name: 'Dead — no AutoDS',   value: Number(health?.dead_no_autods    || 0), fill: '#9ca3af' },
    { name: 'Dead — no SKU',      value: Number(health?.dead_no_skumap    || 0), fill: '#d1d5db' },
  ].filter(d => d.value > 0), [health])

  const config = useMemo(() => Object.fromEntries(
    pieData.map(d => [d.name, { label: d.name, color: d.fill }])
  ), [pieData])

  const total  = pieData.reduce((s, d) => s + d.value, 0)
  const active = pieData[activeIndex] || pieData[0]

  if (loading) return <SkeletonChart height="h-[320px]" />

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle className="text-sm">eBay Listing Status</CardTitle>
        <CardDescription className="text-xs">All Amazon eBay listings breakdown</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer config={config} className="mx-auto aspect-square max-h-[200px]">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
            <Pie data={pieData} dataKey="value" nameKey="name"
              innerRadius={58} outerRadius={85} strokeWidth={3}
              activeIndex={activeIndex}
              onMouseEnter={(_, i) => setActiveIndex(i)}
              activeShape={({ outerRadius = 0, ...props }) => <Sector {...props} outerRadius={outerRadius + 10} />}>
              <Label content={({ viewBox }) => {
                if (!viewBox || !('cx' in viewBox)) return null
                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} y={(viewBox.cy || 0) - 8} fontSize={22} fontWeight={700} fill="#111">
                      {active ? Math.round((active.value / total) * 100) : 0}%
                    </tspan>
                    <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 12} fontSize={9} fill="#9ca3af">
                      {active?.name?.split(' — ')[0]}
                    </tspan>
                  </text>
                )
              }} />
              {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="mt-2 space-y-0.5 px-1">
          {pieData.map((d, i) => (
            <div key={d.name}
              className={`flex items-center justify-between text-xs cursor-pointer rounded px-1.5 py-1 transition-colors ${i === activeIndex ? 'bg-muted' : 'hover:bg-muted/50'}`}
              onMouseEnter={() => setActiveIndex(i)}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.fill }} />
                <span className="text-muted-foreground">{d.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{fmt(d.value)}</span>
                <span className="text-muted-foreground/60 text-[10px] w-7 text-right">
                  {total > 0 ? Math.round((d.value / total) * 100) : 0}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter className="flex-col gap-1 text-sm pt-3">
        <div className="flex items-center gap-2 font-medium leading-none text-xs">
          {active?.name} · {fmt(active?.value)}
          <TrendingUp className="h-3 w-3" style={{ color: active?.fill }} />
        </div>
        <div className="leading-none text-muted-foreground text-xs">{fmt(total)} total eBay listings</div>
      </CardFooter>
    </Card>
  )
}

// ─── Stacked bar: unmonitored by store — mirrors TopStoresChart ───────────────
function UnmonitoredStoresChart({ health, loading }) {
  const data = useMemo(() =>
    (health?.stores || []).slice(0, 10).map(s => ({
      name:   s.store_name.replace(/au$/i,'').slice(0, 9),
      active: Number(s.active_risk),
      dead:   Number(s.dead_safe),
    })), [health])

  const config = {
    active: { label: 'Active risk', color: '#ef4444' },
    dead:   { label: 'Dead safe',   color: '#fca5a5' },
  }

  if (loading) return <SkeletonChart height="h-[220px]" />

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Top Stores by Unmonitored</CardTitle>
        <CardDescription className="text-xs flex items-center gap-4 mt-1">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500" /> Active risk
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-200" /> Dead safe
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[220px] w-full">
          <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="name" tick={{ fontSize: 8 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false}
              tickFormatter={v => v >= 1000 ? `${Math.round(v/1000)}k` : v} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="active" stackId="a" fill="#ef4444" />
            <Bar dataKey="dead"   stackId="a" fill="#fca5a5" radius={[3,3,0,0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

// ─── AutoDS coverage horizontal bar — mirrors OutOfStockChart ─────────────────
function AutodsCoverageChart({ health, loading }) {
  const SHADES = ['#1e3a5f','#1e40af','#1d4ed8','#2563eb','#3b82f6','#60a5fa','#93c5fd','#bfdbfe','#dbeafe','#eff6ff']

  const data = useMemo(() =>
    (health?.stores || []).slice(0, 10).map((s, i) => ({
      name:  s.store_name.replace(/au$/i,'').slice(0, 10),
      risk:  Number(s.active_risk),
      fill:  SHADES[i] || '#3b82f6',
    })), [health])

  const config = { risk: { label: 'Active risk', color: '#3b82f6' } }

  if (loading) return <SkeletonChart height="h-[220px]" />

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Active Risk by Store</CardTitle>
        <CardDescription className="text-xs">Top 10 stores — live listings with no AutoDS</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[220px] w-full">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
            <XAxis type="number" tick={{ fontSize: 9 }} tickLine={false} axisLine={false}
              tickFormatter={v => v >= 1000 ? `${Math.round(v/1000)}k` : v} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 8 }} tickLine={false} axisLine={false} width={65} />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="risk" radius={[0,4,4,0]}>
              {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

// ─── Browse table ─────────────────────────────────────────────────────────────
function BrowseTable({ endpoint, storeOptions }) {
  const [rows, setRows]           = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(0)
  const [busy, setBusy]           = useState(true)
  const [search, setSearch]       = useState('')
  const [store, setStore]         = useState('')
  const [stock, setStock]         = useState('')
  const [debSearch, setDebSearch] = useState('')
  const LIMIT = 50

  useEffect(() => { const t = setTimeout(() => setDebSearch(search), 300); return () => clearTimeout(t) }, [search])
  useEffect(() => { setPage(0) }, [debSearch, store, stock, endpoint])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setBusy(true)
      const p = new URLSearchParams({ page, limit: LIMIT })
      if (debSearch) p.set('search', debSearch)
      if (store)     p.set('store_name', store)
      if (stock)     p.set('stock', stock)
      const data = await api.get(`${endpoint}?${p}`)
      if (!cancelled) { setRows(data?.data || []); setTotal(data?.count || 0); setBusy(false) }
    }
    load(); return () => { cancelled = true }
  }, [endpoint, page, debSearch, store, stock])

  const totalPages    = Math.ceil(total / LIMIT)
  const isUnmonitored = endpoint.includes('unmonitored')
  const isAutodsOnly  = endpoint.includes('autods-only')
  const colCount      = isAutodsOnly ? 3 : isUnmonitored ? 6 : 5

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SKU, item ID…"
            className="w-full pl-8 pr-7 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/60 transition-all" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={12} /></button>}
        </div>
        {!isAutodsOnly && storeOptions?.length > 0 && (
          <select value={store} onChange={e => setStore(e.target.value)}
            className="px-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer text-foreground">
            <option value="">All stores</option>
            {storeOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {!isAutodsOnly && (
          <select value={stock} onChange={e => setStock(e.target.value)}
            className="px-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer text-foreground">
            <option value="">All stock</option>
            <option value="in">In stock</option>
            <option value="out">Out of stock</option>
          </select>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{fmt(total)} rows</span>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {!isAutodsOnly && <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Store</th>}
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">SKU</th>
                {isUnmonitored && <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">ASIN</th>}
                {!isAutodsOnly && <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Item ID</th>}
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Price</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">{isAutodsOnly ? 'Stock' : 'Qty'}</th>
                {!isAutodsOnly && <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Status</th>}
              </tr>
            </thead>
            <tbody>
              {busy ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0 animate-pulse">
                  {Array.from({ length: colCount }).map((_, j) => (
                    <td key={j} className="px-4 py-2.5"><div className="h-3 bg-muted rounded" /></td>
                  ))}
                </tr>
              )) : rows.length === 0 ? (
                <tr><td colSpan={99} className="px-4 py-10 text-center text-sm text-muted-foreground">No items found</td></tr>
              ) : rows.map(row => {
                const qty   = Number(row.quantity ?? row.stock ?? 0)
                const isOut = qty === 0
                return (
                  <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    {!isAutodsOnly && <td className="px-4 py-2 font-medium capitalize text-foreground">{row.store_name}</td>}
                    <td className="px-4 py-2 font-mono text-muted-foreground">{row.sku}</td>
                    {isUnmonitored && <td className="px-4 py-2 font-mono text-amber-600">{row.origin_sku}</td>}
                    {!isAutodsOnly && <td className="px-4 py-2 font-mono text-[11px] text-muted-foreground">{row.item_id || '—'}</td>}
                    <td className="px-4 py-2 text-right font-medium">{row.price ? `$${Number(row.price).toFixed(2)}` : '—'}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${isOut ? 'text-red-500' : ''}`}>{fmt(qty)}</td>
                    {!isAutodsOnly && (
                      <td className="px-4 py-2 text-right">
                        <span className={`inline-flex text-[10px] font-medium border rounded-full px-2 py-0.5 ${isOut ? 'text-red-600 bg-red-50 border-red-100' : 'text-emerald-600 bg-emerald-50 border-emerald-100'}`}>
                          {isOut ? 'Out' : 'In stock'}
                        </span>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Page {page + 1} / {totalPages}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="p-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronLeft size={12} />
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="p-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SyncTab() {
  const [stats,         setStats]         = useState(STATS_CACHE.data  || null)
  const [health,        setHealth]        = useState(HEALTH_CACHE.data || null)
  const [loading,       setLoading]       = useState(!STATS_CACHE.data)
  const [loadingHealth, setLoadingHealth] = useState(!HEALTH_CACHE.data)
  const [browseTab,     setBrowseTab]     = useState('unmonitored')

  useEffect(() => {
    async function loadStats() {
      if (STATS_CACHE.data && Date.now() - STATS_CACHE.ts < STALE_MS) return
      if (!STATS_CACHE.data) setLoading(true)
      const data = await api.get('/api/sync/stats')
      if (data) { setStats(data); STATS_CACHE.data = data; STATS_CACHE.ts = Date.now() }
      setLoading(false)
    }
    async function loadHealth() {
      if (HEALTH_CACHE.data && Date.now() - HEALTH_CACHE.ts < STALE_MS) return
      if (!HEALTH_CACHE.data) setLoadingHealth(true)
      const data = await api.get('/api/sync/health-summary')
      if (data) { setHealth(data); HEALTH_CACHE.data = data; HEALTH_CACHE.ts = Date.now() }
      setLoadingHealth(false)
    }
    loadStats(); loadHealth()
  }, [])

  const storeOptions = useMemo(() => (stats?.stores || []).map(s => s.store_name), [stats])
  const isLoad       = loading || loadingHealth

  const totalEbay   = Number(health?.total_ebay_rows  || 0)
  const totalAutods = Number(health?.total_autods      || 0)
  const matched     = Number(health?.matched_rows      || 0)
  const matchedUniq = Number(health?.matched_unique    || 0)
  const matchPct    = pct(matched, totalEbay)
  const activeRisk  = Number(health?.total_at_risk     || 0)

  const browseTabObj = BROWSE_TABS.find(t => t.id === browseTab)

  function handleRefresh() {
    STATS_CACHE.data = null; HEALTH_CACHE.data = null
    setLoading(true); setLoadingHealth(true)
    window.location.reload()
  }

  return (
    <div className="p-6 space-y-6">

      {/* ── Summary stat cards — same grid as EbayTab ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard label="eBay Amazon Listings" value={totalEbay}
          subLabel="Total Amazon SKUs on eBay" accent="#3b82f6" Icon={Package} loading={isLoad} />
        <SummaryCard label="AutoDS Products" value={totalAutods}
          subLabel="ASINs monitored in AutoDS" accent="#8b5cf6" Icon={Activity} loading={isLoad} />
        <SummaryCard label="Matched & Healthy" value={matched}
          subLabel={`${matchPct}% coverage rate`} accent="#22c55e" Icon={CheckCircle2}
          badge={`${matchPct}%`} loading={isLoad} />
        <SummaryCard label="At Risk (Active)" value={activeRisk}
          subLabel="Live listings with no AutoDS" accent="#ef4444" Icon={AlertTriangle} loading={isLoad} />
      </div>

      {/* Last cached */}
      {!isLoad && health?.computed_at && (
        <p className="text-xs text-muted-foreground -mt-4">
          Cache: {timeAgo(health.computed_at)}
          <button onClick={handleRefresh} className="ml-3 inline-flex items-center gap-1 hover:text-foreground transition-colors">
            <RefreshCw size={10} /> Refresh
          </button>
        </p>
      )}

      {/* ── Main layout: left content + right sidebar — same as EbayTab ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6 items-start">

        {/* LEFT */}
        <div className="space-y-6">

          {/* Flow: two source nodes */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { title: 'AutoDS Products', count: totalAutods, sub: 'Amazon ASINs monitored', style: 'border-teal-200 bg-teal-50', t: 'text-teal-700', c: 'text-teal-800' },
              { title: 'eBay Listings',   count: totalEbay,   sub: 'Amazon SKUs listed',     style: 'border-blue-200 bg-blue-50', t: 'text-blue-700', c: 'text-blue-800' },
            ].map(({ title, count, sub, style, t, c }) => (
              <div key={title} className={`rounded-2xl border-2 p-6 ${style}`}>
                <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${t}`}>{title}</p>
                {isLoad
                  ? <div className="h-8 w-24 bg-current opacity-20 rounded animate-pulse" />
                  : <p className={`text-3xl font-bold tabular-nums ${c}`}>{fmt(count)}</p>}
                <p className={`text-xs mt-1 ${t} opacity-80`}>{sub}</p>
              </div>
            ))}
          </div>

          {/* Arrows */}
          <div className="grid grid-cols-2 gap-4">
            {[0,1].map(i => (
              <div key={i} className="flex flex-col items-center gap-0">
                <div className="w-px h-4 border-l-2 border-gray-300" />
                <ArrowDown size={11} className="text-gray-400 -mt-0.5" />
              </div>
            ))}
          </div>

          {/* Matched block */}
          <div className="rounded-2xl border-2 border-green-300 bg-green-50 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <CheckCircle2 size={13} className="text-green-600" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-green-700">Matched &amp; Healthy</span>
                </div>
                {isLoad
                  ? <div className="h-10 w-28 bg-green-200 rounded animate-pulse" />
                  : <p className="text-4xl font-bold text-green-800 tabular-nums">{fmt(matched)}</p>}
                <p className="text-xs text-green-600 mt-1">
                  {fmt(matchedUniq)} unique ASINs · {matchPct}% of eBay · {health?.total_stores || '—'} stores
                </p>
                <div className="mt-3 h-1.5 bg-green-200 rounded-full overflow-hidden max-w-sm">
                  <div className="h-full bg-green-500 rounded-full transition-all duration-700" style={{ width: `${matchPct}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-dashed border-gray-300" />
            <span className="text-[10px] text-gray-400 font-bold tracking-widest uppercase">PROBLEMS BELOW</span>
            <div className="flex-1 border-t border-dashed border-gray-300" />
          </div>

          {/* Problem cards 2×2 */}
          <div className="grid grid-cols-2 gap-4">
            {PROBLEMS.map(p => <ProblemCard key={p.key} p={p} health={health} loading={isLoad} />)}
          </div>

          {/* Charts row — mirrors EbayTab two-chart row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UnmonitoredStoresChart health={health} loading={isLoad} />
            <AutodsCoverageChart    health={health} loading={isLoad} />
          </div>

        
        

          {/* Export row */}
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-3">
              Export SKU lists <span className="opacity-50">— CSV to fix in AutoDS or bulk-end on eBay</span>
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <ExportBtn status="active_no_autods" label="Active — no AutoDS" count={health?.active_no_autods} color="#ef4444" bg="bg-red-50 border-red-200"      BtnIcon={ShieldAlert}  />
              <ExportBtn status="active_no_skumap" label="Active — no SKU"    count={health?.active_no_skumap} color="#f97316" bg="bg-orange-50 border-orange-200" BtnIcon={Unlink}       />
              <ExportBtn status="dead_no_autods"   label="Dead — no AutoDS"   count={health?.dead_no_autods}   color="#9ca3af" bg="bg-gray-50 border-gray-200"     BtnIcon={Trash2}       />
              <ExportBtn status="matched"          label="All matched"         count={health?.matched_rows}     color="#22c55e" bg="bg-green-50 border-green-200"   BtnIcon={CheckCircle2} />
            <ExportBtn 
                status="_autods_only" 
                directUrl={`${import.meta.env.VITE_API_URL || ''}/api/sync/export-autods-only`}
                label="AutoDS — not listed" 
                count={health?.autods_not_ebay} 
                color="#3b82f6" 
                bg="bg-blue-50 border-blue-200" 
                BtnIcon={Package} 
                />
            </div>
          </div>

          {/* Browse listings */}
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground font-medium">
              Browse listings <span className="opacity-50">({BROWSE_TABS.find(t => t.id === browseTab)?.desc})</span>
            </p>
            <div className="flex items-center gap-1 border-b border-border">
              {BROWSE_TABS.map(tab => (
                <button key={tab.id} onClick={() => setBrowseTab(tab.id)}
                  className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${browseTab === tab.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                  {tab.label}
                </button>
              ))}
            </div>
            {browseTabObj && (
              <BrowseTable key={browseTab} endpoint={browseTabObj.endpoint} storeOptions={storeOptions} />
            )}
          </div>
        </div>

        {/* RIGHT SIDEBAR — same sticky pattern as EbayTab */}
        <div className="xl:sticky xl:top-6 space-y-4">
          <MatchRateRadial matched={matched} total={totalEbay} loading={isLoad} />
          <RiskDonut health={health} loading={isLoad} />
          {/* AutoDS coverage mini bars */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">AutoDS Coverage</CardTitle>
              <CardDescription className="text-xs">{fmt(totalAutods)} ASINs monitored</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: 'Has eBay listing', value: health?.autods_on_ebay  || 0, color: '#3b82f6' },
                { label: 'No eBay listing',  value: health?.autods_not_ebay || 0, color: '#f59e0b' },
              ].map(b => <CoverageBar key={b.label} {...b} total={totalAutods} />)}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}