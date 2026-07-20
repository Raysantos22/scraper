// src/pages/priceRuns/PriceRunViewerPage.jsx
import React, { useState, useEffect, useMemo } from 'react'
import { api } from '../../lib/api'
import { ChevronLeft, ChevronRight, Search, X, RefreshCw, AlertCircle, CheckCircle2, Package, PackageX, Ban, DollarSign, ShieldAlert } from 'lucide-react'

function StatusBadge({ status }) {
  const isOk = status === 'OK'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold
      ${isOk ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
      {isOk ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
      {isOk ? 'OK' : 'ERROR'}
    </span>
  )
}

function DecisionBadge({ decision }) {
  const d = decision || ''
  let color = 'bg-muted text-muted-foreground'
  if (d.startsWith('FETCH_FAILED')) color = 'bg-red-50 text-red-700'
  else if (d.startsWith('NO_AMAZON_PRICE')) color = 'bg-amber-50 text-amber-700'
  else if (d.includes('ZEROED')) color = 'bg-orange-50 text-orange-700'
  else if (d === 'OK-passthrough') color = 'bg-green-50 text-green-700'
  else if (d.includes('CAPPED')) color = 'bg-blue-50 text-blue-700'
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${color}`}>{d}</span>
}

// One tile in the summary card. `active` highlights it when it matches the
// current decisionFilter, and clicking it applies that filter + jumps to page 0.
function StatTile({ label, value, total, icon: Icon, colorClass, onClick, active }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <button
      onClick={onClick}
      className={`text-left p-3 rounded-lg border transition-colors ${
        active ? 'border-gray-900 bg-gray-900/5' : 'border-border hover:bg-muted/40'
      } ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className={`flex items-center gap-1.5 text-[11px] font-medium ${colorClass}`}>
        <Icon size={12} />
        <span>{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-lg font-bold">{value.toLocaleString()}</span>
        {total > 0 && <span className="text-[10px] text-muted-foreground">{pct}%</span>}
      </div>
    </button>
  )
}

const PAGE_SIZE = 10

export default function PriceRunViewerPage({ storeName, onBack }) {
  const [runs, setRuns] = useState([])
  const [selectedRun, setSelectedRun] = useState(null)
  const [runData, setRunData] = useState(null)
  const [loadingRuns, setLoadingRuns] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [tab, setTab] = useState('debug') // 'debug' | 'log'
  const [search, setSearch] = useState('')
  const [decisionFilter, setDecisionFilter] = useState('all')
  const [page, setPage] = useState(0)

  useEffect(() => {
    setLoadingRuns(true)
    api.get(`/api/price-runs/${storeName}`).then(d => {
      const list = d?.runs || []
      setRuns(list)
      setSelectedRun(list[0] || null)
      setLoadingRuns(false)
    })
  }, [storeName])

  useEffect(() => {
    if (!selectedRun) { setRunData(null); return }
    setLoadingData(true)
    api.get(`/api/price-runs/${storeName}/${selectedRun}`).then(d => {
      setRunData(d)
      setLoadingData(false)
    })
  }, [storeName, selectedRun])

  // Reset to page 0 whenever the filters or the run itself change
  useEffect(() => { setPage(0) }, [search, decisionFilter, selectedRun])

  const debugRows = runData?.debug_rows || []

  // ── Summary stats, derived once per run load ──────────────────────────────
  const summary = useMemo(() => {
    const s = {
      total: debugRows.length,
      inStock: 0,
      outOfStock: 0,
      scarce: 0,
      ok: 0,
      zeroed: 0,
      capped: 0,
      noAmazonPrice: 0,
      fetchFailed: 0,
      other: 0,
    }
    for (const r of debugRows) {
      // Final stock state (what actually ended up live)
      if (Number(r.final_stock) > 0) s.inStock++
      else s.outOfStock++

      if (r.type === 'IN_STOCK_SCARCE') s.scarce++

      const d = r.decision || ''
      if (d === 'OK-passthrough') s.ok++
      else if (d.includes('ZEROED')) s.zeroed++
      else if (d.includes('CAPPED')) s.capped++
      else if (d.startsWith('NO_AMAZON_PRICE')) s.noAmazonPrice++
      else if (d.startsWith('FETCH_FAILED')) s.fetchFailed++
      else s.other++
    }
    return s
  }, [debugRows])

  const filteredRows = useMemo(() => debugRows.filter(r => {
    if (search && !r.sku?.toLowerCase().includes(search.toLowerCase()) &&
        !r.asin?.toLowerCase().includes(search.toLowerCase())) return false
    if (decisionFilter === 'failed' && !r.decision?.startsWith('FETCH_FAILED')) return false
    if (decisionFilter === 'zeroed' && !r.decision?.includes('ZEROED')) return false
    if (decisionFilter === 'capped' && !r.decision?.includes('CAPPED')) return false
    if (decisionFilter === 'no_price' && !r.decision?.startsWith('NO_AMAZON_PRICE')) return false
    if (decisionFilter === 'in_stock' && !(Number(r.final_stock) > 0)) return false
    if (decisionFilter === 'out_of_stock' && !(Number(r.final_stock) === 0)) return false
    if (decisionFilter === 'ok' && r.decision !== 'OK-passthrough') return false
    return true
  }), [debugRows, search, decisionFilter])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const pageRows   = useMemo(
    () => filteredRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [filteredRows, page]
  )

  function fmtRunFolder(name) {
    const parts = name.split('_')
    const ts = parts[parts.length - 2] + '_' + parts[parts.length - 1]
    const m = ts.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/)
    if (!m) return name
    return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`
  }

  function toggleFilter(key) {
    setDecisionFilter(prev => (prev === key ? 'all' : key))
    setTab('debug')
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft size={14} /> Back
        </button>
        <h2 className="text-xl font-black capitalize">{storeName} — Price/Stock Runs</h2>
      </div>

      {loadingRuns ? (
        <p className="text-sm text-muted-foreground">Loading run history…</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No runs found for this store yet.</p>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={selectedRun || ''}
              onChange={e => setSelectedRun(e.target.value)}
              className="px-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg"
            >
              {runs.map(r => (
                <option key={r} value={r}>{fmtRunFolder(r)}</option>
              ))}
            </select>

            {runData && (
              <>
                <StatusBadge status={runData.status === 'OK' ? 'OK' : 'ERROR'} />
                <span className="text-xs text-muted-foreground">
                  {runData.skus_ok}/{runData.skus_total} SKUs OK
                </span>
                {runData.status !== 'OK' && (
                  <span className="text-xs text-red-600 truncate max-w-md" title={runData.status}>
                    {runData.status}
                  </span>
                )}
              </>
            )}

            <button
              onClick={() => { const r = selectedRun; setSelectedRun(null); setTimeout(() => setSelectedRun(r), 0) }}
              className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          {/* ── Summary card ── */}
          {!loadingData && debugRows.length > 0 && (
            <div className="border border-border rounded-xl p-4 bg-card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Run Summary</h3>
                <span className="text-[11px] text-muted-foreground">{summary.total.toLocaleString()} SKUs processed</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
                <StatTile
                  label="In Stock" value={summary.inStock} total={summary.total}
                  icon={Package} colorClass="text-green-700"
                  active={decisionFilter === 'in_stock'} onClick={() => toggleFilter('in_stock')}
                />
                <StatTile
                  label="Out of Stock" value={summary.outOfStock} total={summary.total}
                  icon={PackageX} colorClass="text-red-700"
                  active={decisionFilter === 'out_of_stock'} onClick={() => toggleFilter('out_of_stock')}
                />
                <StatTile
                  label="Scarce" value={summary.scarce} total={summary.total}
                  icon={AlertCircle} colorClass="text-amber-700"
                />
                <StatTile
                  label="OK passthrough" value={summary.ok} total={summary.total}
                  icon={CheckCircle2} colorClass="text-green-700"
                  active={decisionFilter === 'ok'} onClick={() => toggleFilter('ok')}
                />
                <StatTile
                  label="Zeroed" value={summary.zeroed} total={summary.total}
                  icon={Ban} colorClass="text-orange-700"
                  active={decisionFilter === 'zeroed'} onClick={() => toggleFilter('zeroed')}
                />
                <StatTile
                  label="Capped" value={summary.capped} total={summary.total}
                  icon={ShieldAlert} colorClass="text-blue-700"
                  active={decisionFilter === 'capped'} onClick={() => toggleFilter('capped')}
                />
                <StatTile
                  label="No Amazon Price" value={summary.noAmazonPrice} total={summary.total}
                  icon={DollarSign} colorClass="text-amber-700"
                  active={decisionFilter === 'no_price'} onClick={() => toggleFilter('no_price')}
                />
              </div>
              {summary.fetchFailed > 0 && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-red-600">
                  <AlertCircle size={12} />
                  {summary.fetchFailed.toLocaleString()} SKUs failed to fetch — click "Fetch failed" filter below to inspect.
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setTab('debug')}
              className={`px-3 py-1.5 text-xs rounded-lg border ${tab === 'debug' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-border'}`}
            >
              Debug Trail ({debugRows.length.toLocaleString()})
            </button>
            <button
              onClick={() => setTab('log')}
              className={`px-3 py-1.5 text-xs rounded-lg border ${tab === 'log' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-border'}`}
            >
              Console Log
            </button>
          </div>

          {loadingData ? (
            <p className="text-sm text-muted-foreground">Loading run data…</p>
          ) : tab === 'log' ? (
            <pre className="bg-black text-green-400 text-xs p-4 rounded-lg overflow-auto max-h-[600px] whitespace-pre-wrap">
              {runData?.console_log || 'No console log captured for this run.'}
            </pre>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative max-w-xs">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search SKU or ASIN…"
                    className="w-full pl-8 pr-8 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X size={12} />
                    </button>
                  )}
                </div>
                <select
                  value={decisionFilter}
                  onChange={e => setDecisionFilter(e.target.value)}
                  className="px-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg"
                >
                  <option value="all">All decisions</option>
                  <option value="ok">OK-passthrough</option>
                  <option value="in_stock">In stock (final)</option>
                  <option value="out_of_stock">Out of stock (final)</option>
                  <option value="zeroed">Zeroed (low stock)</option>
                  <option value="capped">Capped</option>
                  <option value="no_price">No Amazon price</option>
                  <option value="failed">Fetch failed</option>
                </select>
                <span className="text-xs text-muted-foreground">
                  {filteredRows.length.toLocaleString()} rows match
                </span>
              </div>

              {/* ── Table ── */}
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted border-b border-border">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">SKU</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">ASIN</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Type</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">MaxQty</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">RawStock</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Decision</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">RawPrice</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">FinalPrice</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">FinalStock</th>
                      </tr>
                    </thead>
                    <tbody className="bg-card">
                      {pageRows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="text-center py-8 text-muted-foreground">
                            No rows match your search or filter.
                          </td>
                        </tr>
                      ) : pageRows.map((row, idx) => (
                        <tr key={`${row.sku}-${idx}`} className="border-t border-border hover:bg-muted/40 transition-colors">
                          <td className="px-3 py-1.5 font-mono">{row.sku}</td>
                          <td className="px-3 py-1.5 font-mono">{row.asin}</td>
                          <td className="px-3 py-1.5">{row.type}</td>
                          <td className="px-3 py-1.5 text-right">{row.max_qty}</td>
                          <td className="px-3 py-1.5 text-right">{row.raw_stock}</td>
                          <td className="px-3 py-1.5"><DecisionBadge decision={row.decision} /></td>
                          <td className="px-3 py-1.5 text-right">{row.raw_price}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{row.final_price}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{row.final_stock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ── Pagination footer ── */}
                <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted/30">
                  <span className="text-[11px] text-muted-foreground">
                    {filteredRows.length === 0
                      ? '0 rows'
                      : `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filteredRows.length)} of ${filteredRows.length.toLocaleString()}`}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted transition-colors"
                    >
                      <ChevronLeft size={12} /> Prev
                    </button>
                    <span className="text-[11px] text-muted-foreground px-2">
                      Page {page + 1} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted transition-colors"
                    >
                      Next <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}