// src/pages/bestsellers/BestsellersTab.jsx  (v3 — eBay linkage + export filter)
import React, { useState, useEffect, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { Download, RefreshCw, CheckCircle2, RotateCcw, Filter, UploadCloud, AlertCircle, ShoppingBag } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const DEPT_COLORS = {
  'books':'#3b82f6','automotive':'#f59e0b','sporting-goods':'#10b981',
  'fashion':'#ec4899','industrial':'#6366f1','home':'#14b8a6',
  'garden':'#84cc16','music':'#8b5cf6','baby-products':'#f43f5e',
  'grocery':'#22c55e','computers':'#0ea5e9','health':'#ef4444',
  'kitchen':'#f97316','beauty':'#d946ef','pet-supplies':'#a78bfa',
  'toys':'#fb923c','home-improvement':'#64748b','musical-instruments':'#06b6d4',
  'office-products':'#78716c','lighting':'#fbbf24','videogames':'#7c3aed',
  'electronics':'#2563eb','movies-and-tv':'#dc2626','amazon-renewed':'#059669',
  'amazon-devices':'#0284c7','root':'#94a3b8',
}
const deptColor = d => DEPT_COLORS[d] || '#94a3b8'
const fmt  = n => Number(n || 0).toLocaleString()
const pct  = (n, d) => d > 0 ? Math.round((Number(n) / Number(d)) * 100) : 0

// Export filter options
const EXPORT_FILTERS = [
  { value: 'new',      label: 'New Only',        desc: 'Not in AutoDS, not uploaded' },
  { value: 'all',      label: 'All ASINs',        desc: 'Every ASIN in this dept'    },
  { value: 'existing', label: 'In AutoDS',        desc: 'Already monitored'          },
  { value: 'on_ebay',  label: 'On eBay',          desc: 'Currently listed on eBay'   },
  { value: 'uploaded', label: 'Marked Uploaded',  desc: 'Manually marked done'       },
]

function timeAgo(dateStr) {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000), hours = Math.floor(diff / 3600000), days = Math.floor(diff / 86400000)
  if (mins < 1) return 'just now'
  if (mins < 60) return mins + 'm ago'
  if (hours < 24) return hours + 'h ago'
  return days + 'd ago'
}

function StatusPill({ value, label, color, bg }) {
  return (
    <div className={'flex flex-col items-center justify-center rounded-xl px-4 py-3 ' + bg}>
      <span className={'text-2xl font-black tabular-nums ' + color}>{fmt(value)}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-0.5">{label}</span>
    </div>
  )
}

function Skel({ className }) { return <div className={'animate-pulse bg-muted rounded ' + className} /> }

function Spin() {
  return (
    <svg className="animate-spin h-2.5 w-2.5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
    </svg>
  )
}

function DeptChart({ departments, loading }) {
  const data = useMemo(() =>
    [...departments]
      .sort((a,b) => Number(b.new_to_autods) - Number(a.new_to_autods))
      .slice(0, 16)
      .map(d => ({
        name: (d.department || 'unknown').replace(/-/g,' '),
        'New':        Number(d.new_to_autods),
        'In AutoDS':  Number(d.already_in_autods),
        'On eBay':    Number(d.on_ebay),
        'Done':       Number(d.marked_uploaded),
      })), [departments])

  const config = {
    'New':       { label:'New to AutoDS',   color:'#3b82f6' },
    'In AutoDS': { label:'In AutoDS',       color:'#22c55e' },
    'On eBay':   { label:'On eBay',         color:'#f59e0b' },
    'Done':      { label:'Marked Done',     color:'#94a3b8' },
  }

  if (loading) return (
    <Card className="animate-pulse">
      <CardHeader><Skel className="h-3 w-48 mb-2"/><Skel className="h-2 w-32"/></CardHeader>
      <CardContent><Skel className="h-[260px]"/></CardContent>
    </Card>
  )

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">ASINs by Department</CardTitle>
        <CardDescription className="text-xs flex items-center gap-4 mt-1 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-500"/>New to AutoDS</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-500"/>Already in AutoDS</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-400"/>On eBay</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-slate-300"/>Marked Done</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[260px] w-full">
          <BarChart data={data} margin={{ top:0, right:0, left:-10, bottom:64 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6"/>
            <XAxis dataKey="name" tick={{fontSize:8}} tickLine={false} axisLine={false} angle={-40} textAnchor="end" interval={0}/>
            <YAxis tick={{fontSize:9}} tickLine={false} axisLine={false} tickFormatter={v => v>=1000?`${(v/1000).toFixed(0)}k`:v}/>
            <ChartTooltip content={<ChartTooltipContent/>}/>
            <Bar dataKey="New"       stackId="a" fill="#3b82f6" radius={[0,0,0,0]}/>
            <Bar dataKey="In AutoDS" stackId="a" fill="#22c55e" radius={[0,0,0,0]}/>
            <Bar dataKey="On eBay"   stackId="a" fill="#f59e0b" radius={[0,0,0,0]}/>
            <Bar dataKey="Done"      stackId="a" fill="#94a3b8" radius={[3,3,0,0]}/>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
        <p className="text-sm font-medium mb-4">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-1.5 text-xs border border-border rounded-lg hover:bg-muted">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Confirm</button>
        </div>
      </div>
    </div>
  )
}

// ─── Bulk Download Modal ──────────────────────────────────────────────────────
// Multi-select checklist — all checked by default, risky depts pre-unchecked
const RISKY_DEPTS = new Set(['beauty','baby-products','health','grocery','amazon-devices','amazon-renewed'])

function BulkDownloadModal({ departments, onClose }) {
  const [selected, setSelected] = useState(() => {
    const s = {}
    departments.forEach(d => { s[d.department] = !RISKY_DEPTS.has(d.department) })
    return s
  })
  const [exportFilter, setExportFilter] = useState('new')
  const [downloading,  setDownloading]  = useState(false)
  const [progress,     setProgress]     = useState(null)
  const [toast,        setToast]        = useState(null)

  const checkedDepts   = departments.filter(d =>  selected[d.department])
  const uncheckedDepts = departments.filter(d => !selected[d.department])
  const allChecked     = checkedDepts.length === departments.length
  const noneChecked    = checkedDepts.length === 0

  function toggleDept(dept) { setSelected(s => ({ ...s, [dept]: !s[dept] })) }
  function toggleAll() {
    const next = !allChecked
    const s = {}
    departments.forEach(d => { s[d.department] = next })
    setSelected(s)
  }
  function uncheckRisky() {
    setSelected(s => {
      const next = { ...s }
      RISKY_DEPTS.forEach(d => { next[d] = false })
      return next
    })
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  async function doDownload() {
    if (noneChecked) return
    setDownloading(true)
    setProgress({ done: 0, total: checkedDepts.length, dept: checkedDepts[0]?.department })

    const allRows  = []
    let headerLine = null

    for (let i = 0; i < checkedDepts.length; i++) {
      const d = checkedDepts[i]
      setProgress({ done: i, total: checkedDepts.length, dept: d.department })
      try {
        const p    = new URLSearchParams({ dept: d.department, filter: exportFilter })
        const resp = await fetch(`${BASE_URL}/api/bestsellers/export?${p}`)
        if (!resp.ok) continue
        const text  = await resp.text()
        const lines = text.trim().split('\n')
        if (!headerLine && lines.length > 0) headerLine = lines[0]
        allRows.push(...lines.slice(1).filter(Boolean))
      } catch(e) { console.warn('Failed dept:', d.department, e) }
    }

    setProgress({ done: checkedDepts.length, total: checkedDepts.length, dept: null })

    if (!headerLine || allRows.length === 0) {
      showToast('No data found for selected filters', 'error')
      setDownloading(false); setProgress(null)
      return
    }

    const csv  = [headerLine, ...allRows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    const date = new Date().toISOString().slice(0,10).replace(/-/g,'')
    const tag  = checkedDepts.length === departments.length ? 'all' : `${checkedDepts.length}depts`
    a.href = url; a.download = `bestsellers_${tag}_${exportFilter}_${date}.csv`
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)

    showToast(`Downloaded ${allRows.length.toLocaleString()} ASINs across ${checkedDepts.length} departments`)
    setDownloading(false); setProgress(null)
  }

  // Live count estimates for selected depts
  const selTotals = checkedDepts.reduce((acc, d) => {
    acc.total     += Number(d.total             || 0)
    acc.new       += Number(d.new_to_autods     || 0)
    acc.in_autods += Number(d.already_in_autods || 0)
    acc.on_ebay   += Number(d.on_ebay           || 0)
    return acc
  }, { total:0, new:0, in_autods:0, on_ebay:0 })

  const filterCount = {
    new: selTotals.new, existing: selTotals.in_autods,
    on_ebay: selTotals.on_ebay, all: selTotals.total, uploaded: null,
  }
  const selectedFilterMeta = EXPORT_FILTERS.find(f => f.value === exportFilter)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h3 className="text-sm font-bold">Download ASINs</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

          {/* Filter type */}
          <div className="space-y-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">What to include</label>
            <div className="grid grid-cols-1 gap-1.5">
              {EXPORT_FILTERS.map(f => (
                <label key={f.value} className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-all text-xs ${
                  exportFilter === f.value ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-border hover:bg-muted/40'
                }`}>
                  <input type="radio" name="exportFilter" value={f.value}
                    checked={exportFilter === f.value} onChange={() => setExportFilter(f.value)}
                    className="accent-blue-600 flex-shrink-0"/>
                  <span className="flex-1">
                    <span className="font-semibold">{f.label}</span>
                    <span className="text-muted-foreground ml-1.5">— {f.desc}</span>
                  </span>
                  {filterCount[f.value] != null && (
                    <span className={`tabular-nums font-bold text-[10px] ${exportFilter === f.value ? 'text-blue-700' : 'text-muted-foreground'}`}>
                      {filterCount[f.value].toLocaleString()}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Department checklist */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Departments <span className="normal-case font-normal">({checkedDepts.length} of {departments.length} selected)</span>
              </label>
              <div className="flex items-center gap-2">
                <button onClick={uncheckRisky}
                  className="text-[10px] text-amber-600 hover:text-amber-700 font-medium border border-amber-200 bg-amber-50 px-2 py-0.5 rounded">
                  Uncheck risky
                </button>
                <button onClick={toggleAll} className="text-[10px] text-blue-600 hover:text-blue-700 font-medium">
                  {allChecked ? 'Uncheck all' : 'Check all'}
                </button>
              </div>
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <div className="max-h-64 overflow-y-auto divide-y divide-border">
                {departments.map(d => {
                  const isChecked = !!selected[d.department]
                  const isRisky   = RISKY_DEPTS.has(d.department)
                  const count =
                    exportFilter === 'new'      ? Number(d.new_to_autods     || 0)
                  : exportFilter === 'existing' ? Number(d.already_in_autods || 0)
                  : exportFilter === 'on_ebay'  ? Number(d.on_ebay           || 0)
                  : exportFilter === 'all'      ? Number(d.total             || 0)
                  : null

                  return (
                    <label key={d.department} className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors text-xs select-none ${
                      isChecked ? 'bg-background hover:bg-muted/30' : 'bg-muted/30 hover:bg-muted/50 opacity-60'
                    }`}>
                      <input type="checkbox" checked={isChecked} onChange={() => toggleDept(d.department)}
                        className="accent-blue-600 flex-shrink-0 w-3.5 h-3.5"/>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: deptColor(d.department) }}/>
                      <span className="flex-1 capitalize font-medium">{d.department.replace(/-/g,' ')}</span>
                      {isRisky && (
                        <span className="text-[9px] bg-amber-100 text-amber-700 border border-amber-200 rounded px-1 py-0.5 font-medium">risky</span>
                      )}
                      {count != null && (
                        <span className={`tabular-nums text-[10px] font-semibold ${isChecked ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {count.toLocaleString()}
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>

            {uncheckedDepts.length > 0 && (
              <p className="text-[10px] text-muted-foreground">
                Skipping: {uncheckedDepts.map(d => d.department.replace(/-/g,' ')).join(', ')}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex-shrink-0 space-y-3">
          <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
            <span>
              <strong className="text-foreground">{checkedDepts.length} dept{checkedDepts.length !== 1 ? 's' : ''}</strong>
              {' · '}
              <strong className="text-foreground">{selectedFilterMeta?.label}</strong>
            </span>
            <span className="font-bold text-foreground tabular-nums">
              ~{(filterCount[exportFilter] ?? selTotals.total).toLocaleString()} ASINs
            </span>
          </div>

          {progress && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{progress.dept ? `Fetching ${progress.dept}…` : 'Merging…'}</span>
                <span>{progress.done}/{progress.total}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width:`${progress.total > 0 ? (progress.done/progress.total)*100 : 0}%` }}/>
              </div>
            </div>
          )}

          {toast && (
            <div className={`px-3 py-2 rounded-lg text-xs font-medium ${
              toast.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'
            }`}>{toast.msg}</div>
          )}

          <div className="flex gap-3 justify-end">
            <button onClick={onClose} disabled={downloading}
              className="px-4 py-1.5 text-xs border border-border rounded-lg hover:bg-muted disabled:opacity-50">
              Cancel
            </button>
            <button onClick={doDownload} disabled={downloading || noneChecked}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
              {downloading ? <Spin/> : <Download size={11}/>}
              {downloading ? 'Downloading…' : `Download ${checkedDepts.length} dept${checkedDepts.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────
export default function BestsellersTab() {
  const [stats,       setStats]       = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [deptFilter,  setDeptFilter]  = useState('all')
  const [marking,     setMarking]     = useState(null)
  const [resetting,   setResetting]   = useState(null)
  const [confirm,     setConfirm]     = useState(null)
  const [toast,       setToast]       = useState(null)
  const [sortCol,     setSortCol]     = useState('new_to_autods')
  const [sortDir,     setSortDir]     = useState('desc')
  const [refreshing,  setRefreshing]  = useState(false)
  const [showDlModal, setShowDlModal] = useState(false)
  // per-row quick download state: key = dept + '_' + filter
  const [dlRow,       setDlRow]       = useState({})

  async function loadStats() {
    setLoading(true)
    try {
      const r = await fetch(`${BASE_URL}/api/bestsellers/stats`)
      setStats(await r.json())
    } catch(e) { console.error(e) }
    finally    { setLoading(false) }
  }
  useEffect(() => { loadStats() }, [])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  // Quick per-row download (always "new" for that department)
  async function handleRowDownload(dept, filter) {
    const key = dept + '_' + filter
    setDlRow(d => ({ ...d, [key]: true }))
    try {
      const p = new URLSearchParams({ dept, filter })
      const resp = await fetch(`${BASE_URL}/api/bestsellers/export?${p}`)
      if (!resp.ok) throw new Error(resp.status)
      const blob = await resp.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const date = new Date().toISOString().slice(0,10).replace(/-/g,'')
      a.href = url; a.download = `bestsellers_${dept}_${filter}_${date}.csv`
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
      showToast('Download started')
    } catch(e) { showToast('Download failed: ' + e.message, 'error') }
    finally    { setDlRow(d => ({ ...d, [key]: false })) }
  }

  async function doMarkUploaded(dept, mode = 'new_only') {
    const k = dept + mode; setMarking(k)
    try {
      const r    = await fetch(`${BASE_URL}/api/bestsellers/mark-uploaded`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dept, mode }),
      })
      const data = await r.json()
      showToast(`Marked ${fmt(data.updated)} ASINs as uploaded`)
      await loadStats()
    } catch(e) { showToast('Failed: ' + e.message, 'error') }
    finally    { setMarking(null) }
  }

  async function doReset(dept) {
    setResetting(dept)
    try {
      const r    = await fetch(`${BASE_URL}/api/bestsellers/reset`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dept }),
      })
      const data = await r.json()
      showToast(`Reset ${fmt(data.updated)} ASINs to pending`)
      await loadStats()
    } catch(e) { showToast('Failed: ' + e.message, 'error') }
    finally    { setResetting(null) }
  }

  const departments = stats?.departments || []
  const totals      = stats?.totals      || {}

  const filteredDepts = useMemo(() => {
    const rows = deptFilter === 'all'
      ? departments
      : departments.filter(d => d.department === deptFilter)
    return [...rows].sort((a, b) => {
      const av = Number(a[sortCol] || 0), bv = Number(b[sortCol] || 0)
      return sortDir === 'desc' ? bv - av : av - bv
    })
  }, [departments, deptFilter, sortCol, sortDir])

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const SortArrow = ({ col }) => (
    <span className={'ml-0.5 ' + (sortCol === col ? 'text-foreground' : 'text-muted-foreground/30')}>
      {sortCol === col ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
    </span>
  )

  const footerNew    = filteredDepts.reduce((s,d) => s + Number(d.new_to_autods    || 0), 0)
  const footerIn     = filteredDepts.reduce((s,d) => s + Number(d.already_in_autods|| 0), 0)
  const footerEbay   = filteredDepts.reduce((s,d) => s + Number(d.on_ebay          || 0), 0)
  const footerDone   = filteredDepts.reduce((s,d) => s + Number(d.marked_uploaded  || 0), 0)
  const footerTot    = filteredDepts.reduce((s,d) => s + Number(d.total            || 0), 0)

  return (
    <div className="p-6 space-y-6">

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      {confirm && (
        <ConfirmModal
          message={confirm.msg}
          onConfirm={() => { confirm.action(); setConfirm(null) }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {showDlModal && (
        <BulkDownloadModal
          departments={departments}
          onClose={() => setShowDlModal(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Amazon Bestsellers</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cross-referenced with AutoDS &amp; eBay listings
            {totals.last_scraped && (
              <span className="ml-2 opacity-60">· scraped {timeAgo(totals.last_scraped)}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDlModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-blue-300 text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-all"
          >
            <Download size={11}/> Download…
          </button>
          <button
            onClick={async () => { setRefreshing(true); await loadStats(); setRefreshing(false) }}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg bg-muted/30 hover:bg-muted/60 transition-all disabled:opacity-50 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''}/>{refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Status pills — 5 now (added On eBay) */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[0,1,2,3,4].map(i => <Skel key={i} className="h-20 rounded-xl"/>)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatusPill value={totals.total}             label="Total ASINs"         color="text-foreground"  bg="bg-muted/40 border border-border"/>
          <StatusPill value={totals.new_to_autods}     label="New — not in AutoDS" color="text-blue-600"   bg="bg-blue-50 border border-blue-200"/>
          <StatusPill value={totals.already_in_autods} label="In AutoDS"           color="text-green-600"  bg="bg-green-50 border border-green-200"/>
          <StatusPill value={totals.on_ebay}           label="On eBay"             color="text-amber-600"  bg="bg-amber-50 border border-amber-200"/>
          <StatusPill value={totals.marked_uploaded}   label="Marked Uploaded"     color="text-slate-500"  bg="bg-slate-50 border border-slate-200"/>
        </div>
      )}

      {/* Coverage callout */}
      {!loading && totals.total > 0 && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
          pct(totals.already_in_autods, totals.total) > 50
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          {pct(totals.already_in_autods, totals.total) > 50
            ? <CheckCircle2 size={15} className="flex-shrink-0"/>
            : <AlertCircle  size={15} className="flex-shrink-0"/>}
          <span>
            <strong>{pct(totals.already_in_autods, totals.total)}%</strong> in AutoDS ·{' '}
            <strong>{pct(totals.on_ebay, totals.total)}%</strong> on eBay ·{' '}
            <strong>{fmt(totals.new_to_autods)}</strong> new ASINs ready to upload
          </span>
        </div>
      )}

      <DeptChart departments={departments} loading={loading}/>

      {/* Filter bar + bulk actions */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Department filter */}
        <div className="relative">
          <Filter size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"/>
          <select
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            className="pl-7 pr-6 py-1.5 text-xs bg-muted/50 border border-border rounded-lg appearance-none cursor-pointer text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Departments</option>
            {departments.map(d => (
              <option key={d.department} value={d.department}>
                {d.department} — {fmt(d.new_to_autods)} new
              </option>
            ))}
          </select>
        </div>

        {/* Download modal trigger */}
        <button
          onClick={() => setShowDlModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-blue-300 text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-all"
        >
          <Download size={11}/> Download…
        </button>

        <button
          onClick={() => setConfirm({
            msg: `Mark all NEW (not in AutoDS) ${deptFilter === 'all' ? '' : deptFilter + ' '}ASINs as uploaded?`,
            action: () => doMarkUploaded(deptFilter, 'new_only'),
          })}
          disabled={!!marking}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-green-300 text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-all disabled:opacity-50"
        >
          {marking ? <Spin/> : <UploadCloud size={11}/>} Mark New as Uploaded
        </button>

        <button
          onClick={() => setConfirm({
            msg: `Reset ${deptFilter === 'all' ? 'ALL' : deptFilter} uploaded ASINs back to pending?`,
            action: () => doReset(deptFilter),
          })}
          disabled={!!resetting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg bg-muted/30 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 transition-all disabled:opacity-50"
        >
          {resetting ? <Spin/> : <RotateCcw size={11}/>} Reset
        </button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Department</th>
                  {[
                    { key:'total',             label:'Total'      },
                    { key:'new_to_autods',     label:'🔵 New'     },
                    { key:'already_in_autods', label:'🟢 AutoDS'  },
                    { key:'on_ebay',           label:'🟡 On eBay' },
                    { key:'marked_uploaded',   label:'✓ Done'     },
                  ].map(col => (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className="text-right px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none"
                    >
                      {col.label} <SortArrow col={col.key}/>
                    </th>
                  ))}
                  <th className="text-right px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">AutoDS %</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Download</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length:8 }).map((_,i) => (
                    <tr key={i} className="border-b border-border animate-pulse">
                      {Array.from({ length:8 }).map((_,j) => (
                        <td key={j} className="px-4 py-3"><Skel className="h-3 w-full"/></td>
                      ))}
                    </tr>
                  ))
                  : filteredDepts.map(d => {
                    const newN   = Number(d.new_to_autods     || 0)
                    const inN    = Number(d.already_in_autods || 0)
                    const ebayN  = Number(d.on_ebay           || 0)
                    const doneN  = Number(d.marked_uploaded   || 0)
                    const totalN = Number(d.total             || 0)
                    const inPct  = pct(inN, totalN)
                    const color  = deptColor(d.department)
                    const dlKey  = (filter) => d.department + '_' + filter

                    return (
                      <tr key={d.department} className="border-b border-border hover:bg-muted/20 transition-colors">
                        {/* Department name */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }}/>
                            <span className="font-medium capitalize">{(d.department || 'unknown').replace(/-/g,' ')}</span>
                          </div>
                        </td>

                        {/* Numbers */}
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(totalN)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <span className={newN > 0 ? 'text-blue-600 font-semibold' : 'text-muted-foreground'}>{fmt(newN)}</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <span className={inN > 0 ? 'text-green-600 font-semibold' : 'text-muted-foreground'}>{fmt(inN)}</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <span className={ebayN > 0 ? 'text-amber-600 font-semibold' : 'text-muted-foreground'}>{fmt(ebayN)}</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-400">{fmt(doneN)}</td>

                        {/* AutoDS % bar */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width:`${inPct}%`, background: inPct>80?'#22c55e':inPct>40?'#f59e0b':'#3b82f6' }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground tabular-nums w-6 text-right">{inPct}%</span>
                          </div>
                        </td>

                        {/* Per-row download buttons */}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {/* New */}
                            <button
                              onClick={() => handleRowDownload(d.department, 'new')}
                              disabled={dlRow[dlKey('new')] || newN === 0}
                              title={`${fmt(newN)} new ASINs`}
                              className="flex items-center gap-0.5 px-2 py-1 rounded text-[10px] font-medium border border-blue-200 text-blue-600 hover:bg-blue-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              {dlRow[dlKey('new')] ? <Spin/> : <Download size={9}/>} New
                            </button>

                            {/* On eBay */}
                            <button
                              onClick={() => handleRowDownload(d.department, 'on_ebay')}
                              disabled={dlRow[dlKey('on_ebay')] || ebayN === 0}
                              title={`${fmt(ebayN)} on eBay`}
                              className="flex items-center gap-0.5 px-2 py-1 rounded text-[10px] font-medium border border-amber-200 text-amber-600 hover:bg-amber-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              {dlRow[dlKey('on_ebay')] ? <Spin/> : <ShoppingBag size={9}/>} eBay
                            </button>

                            {/* All */}
                            <button
                              onClick={() => handleRowDownload(d.department, 'all')}
                              disabled={dlRow[dlKey('all')]}
                              title={`All ${fmt(totalN)}`}
                              className="flex items-center gap-0.5 px-2 py-1 rounded text-[10px] font-medium border border-border hover:bg-muted transition-all disabled:opacity-30"
                            >
                              {dlRow[dlKey('all')] ? <Spin/> : <Download size={9}/>} All
                            </button>

                            {/* Mark */}
                            <button
                              onClick={() => setConfirm({
                                msg: `Mark ${fmt(newN)} new ${d.department} ASINs as uploaded?`,
                                action: () => doMarkUploaded(d.department, 'new_only'),
                              })}
                              disabled={marking === d.department + 'new_only' || newN === 0}
                              className="flex items-center gap-0.5 px-2 py-1 rounded text-[10px] font-medium border border-green-200 text-green-600 hover:bg-green-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              {marking === d.department + 'new_only' ? <Spin/> : <CheckCircle2 size={9}/>} Mark
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                }
              </tbody>

              {/* Footer totals */}
              {!loading && filteredDepts.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/20">
                    <td className="px-4 py-3 font-bold text-[11px]">{deptFilter === 'all' ? 'Total' : deptFilter}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">{fmt(footerTot)}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-blue-600">{fmt(footerNew)}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-green-600">{fmt(footerIn)}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-amber-600">{fmt(footerEbay)}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-400">{fmt(footerDone)}</td>
                    <td colSpan={2}/>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}