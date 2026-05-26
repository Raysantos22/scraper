
// C:\Users\ADMIN\scraper\src\pages\products\CsvOverrideUploadModal.jsx
import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Upload, X, AlertCircle, CheckCircle2, Loader2,
  FileText, ChevronDown, ChevronUp, XCircle
} from 'lucide-react'
import { supabase } from '../../lib/supabase'   // ← adjust path if needed

const BATCH_SIZE    = 50   // rows per upsert call
const CONCURRENCY   = 3    // parallel batch calls at once

// ── Robust CSV parser ─────────────────────────────────────────────────────────
function parseCsv(text) {
  const rows = []
  let col = '', row = [], inQuotes = false
  const push = () => { row.push(col); col = '' }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') { col += '"'; i++ }
      else if (ch === '"') { inQuotes = false }
      else { col += ch }
    } else {
      if      (ch === '"')  { inQuotes = true }
      else if (ch === ',')  { push() }
      else if (ch === '\r' && next === '\n') { push(); rows.push(row); row = []; i++ }
      else if (ch === '\n' || ch === '\r')   { push(); rows.push(row); row = [] }
      else { col += ch }
    }
  }
  push()
  if (row.some(c => c !== '')) rows.push(row)
  return rows
}

function normHeader(h) { return h.trim().toLowerCase().replace(/[^a-z]/g, '') }

function csvToObjects(text) {
  const rows    = parseCsv(text)
  if (rows.length < 2) return { objects: [], missing: [] }
  const headers = rows[0].map(normHeader)
  const missing = ['sku', 'title'].filter(r => !headers.includes(r))
  const objects = rows.slice(1)
    .map((row, i) => {
      const obj = {}
      headers.forEach((h, idx) => { obj[h] = (row[idx] ?? '').trim() })
      obj._rowNum = i + 2
      return obj
    })
    .filter(obj => obj.sku)
  return { objects, missing }
}

// ── Chunk array ───────────────────────────────────────────────────────────────
function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ── Run batches with limited concurrency ──────────────────────────────────────
async function runBatches(batches, onBatchDone) {
  let idx = 0

  async function worker() {
    while (idx < batches.length) {
      const i     = idx++
      const batch = batches[i]
      const payloads = batch.map(r => ({
        sku:         r.sku,
        title:       r.title       || null,
        description: r.description || null,
        images:      r.image ? [r.image] : [],
        updated_at:  new Date().toISOString(),
      }))

      const { error } = await supabase
        .from('product_overrides')
        .upsert(payloads, { onConflict: 'sku' })

      // Pass failed SKUs back so toast can list them
      const failedSkus = error ? batch.map(r => r.sku) : []
      onBatchDone(batch.length, !!error, error?.message, failedSkus)
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
}

// ── Floating progress toast (clickable error summary) ─────────────────────────
export function ImportProgressToast({ state, onDismiss }) {
  const [expanded, setExpanded] = useState(false)
  if (!state) return null

  const pct    = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0
  const isDone = state.status === 'done'
  const hasErr = state.failed > 0
  const failedSkus = state.failedSkus || []

  return (
    <div className="fixed bottom-5 right-5 z-[100] w-80 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden">
      {/* progress bar */}
      <div className="h-1 bg-gray-100">
        <div
          className={`h-full transition-all duration-300 ${isDone ? (hasErr ? 'bg-amber-400' : 'bg-green-500') : 'bg-red-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Main row */}
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          {isDone
            ? hasErr
              ? <AlertCircle size={16} className="text-amber-500" />
              : <CheckCircle2 size={16} className="text-green-500" />
            : <Loader2 size={16} className="text-red-500 animate-spin" />
          }
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-800">
            {isDone
              ? hasErr ? `Import done — ${state.failed} row${state.failed !== 1 ? 's' : ''} failed` : 'Import complete'
              : 'Importing in background…'
            }
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {isDone
              ? `${state.done - state.failed} of ${state.total} rows saved`
              : `${state.done} / ${state.total} rows (${pct}%)`
            }
          </p>

          {/* Click to see failed SKUs — only when done + errors exist */}
          {isDone && hasErr && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-600 hover:text-amber-700 font-medium transition-colors">
              {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              {expanded ? 'Hide failed SKUs' : `Show ${failedSkus.length} failed SKU${failedSkus.length !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>

        {isDone && (
          <button onClick={onDismiss} className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors">
            <X size={13} />
          </button>
        )}
      </div>

      {/* Expandable failed SKU list */}
      {expanded && failedSkus.length > 0 && (
        <div className="border-t border-amber-100 bg-amber-50/60 px-4 py-2 max-h-44 overflow-y-auto">
          <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-1.5">Failed SKUs</p>
          <div className="space-y-0.5">
            {failedSkus.map((sku, i) => (
              <p key={i} className="text-[11px] font-mono text-amber-800 leading-relaxed">{sku}</p>
            ))}
          </div>
          <button
            onClick={() => {
              const text = failedSkus.join('\n')
              const blob = new Blob([text], { type: 'text/plain' })
              const url  = URL.createObjectURL(blob)
              const a    = document.createElement('a')
              a.href = url; a.download = 'failed_skus.txt'
              document.body.appendChild(a); a.click()
              document.body.removeChild(a); URL.revokeObjectURL(url)
            }}
            className="mt-2 flex items-center gap-1 text-[11px] text-amber-600 hover:text-amber-700 font-medium underline">
            ↓ Download failed SKUs as .txt
          </button>
        </div>
      )}
    </div>
  )
}


// ── Main modal ────────────────────────────────────────────────────────────────
export function CsvOverrideUploadModal({ open, onClose, onComplete, onImportStart }) {
  const [step, setStep]           = useState('upload')   // upload | preview
  const [rows, setRows]           = useState([])
  const [parseError, setParseError] = useState('')
  const [showAll, setShowAll]     = useState(false)
  const fileRef = useRef(null)

  function reset() {
    setStep('upload'); setRows([]); setParseError(''); setShowAll(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleClose() { reset(); onClose() }

  function handleFile(file) {
    if (!file) return
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setParseError('Please upload a .csv file.'); return
    }
    const reader = new FileReader()
    reader.onload = e => {
      const { objects, missing } = csvToObjects(e.target.result)
      if (missing.length) { setParseError(`Missing required columns: ${missing.join(', ')}`); return }
      if (!objects.length) { setParseError('No data rows found in the CSV.'); return }
      setParseError('')
      setRows(objects)
      setStep('preview')
    }
    reader.readAsText(file)
  }

  const onDrop = useCallback(e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }, [])

  // ── Kick off background import, close modal immediately ───────────────────
  function startImport() {
    onImportStart?.({
      rows,
      batches: chunk(rows, BATCH_SIZE),
    })
    handleClose()
  }

  if (!open) return null
  const previewRows = showAll ? rows : rows.slice(0, 6)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <FileText size={15} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-800">Import Product Overrides via CSV</h2>
          </div>
          <button onClick={handleClose} className="text-gray-300 hover:text-gray-500 transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6">

          {/* ── STEP: upload ── */}
          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500 leading-relaxed">
                Upload a <span className="font-mono bg-gray-50 px-1 rounded">.csv</span> with columns{' '}
                {['sku','title','description','image'].map((c, i, a) => (
                  <span key={c}><span className="font-mono bg-gray-50 px-1 rounded">{c}</span>{i < a.length - 1 ? ', ' : '.'}</span>
                ))}
                {' '}Rows are upserted into <span className="font-mono bg-gray-50 px-1 rounded">product_overrides</span>.
              </p>

              {/* Format callout */}
              <div className="bg-gray-50 rounded-xl border border-gray-100 p-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Expected format</p>
                <div className="overflow-x-auto">
                  <table className="text-[10px] text-gray-500 w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        {['sku','title','description','image'].map(h => (
                          <th key={h} className="text-left px-2 py-1 font-mono font-medium text-gray-700">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="px-2 py-1 font-mono">SEP_001</td>
                        <td className="px-2 py-1">The Clear Set</td>
                        <td className="px-2 py-1 text-gray-400 italic">Full description…</td>
                        <td className="px-2 py-1 text-blue-400">https://…</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-gray-400 mt-2">
                  Column order flexible · Headers case-insensitive · <span className="font-mono">image</span> = single URL stored as JSON array
                </p>
              </div>

              {/* Drop zone */}
              <div
                onDrop={onDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl py-10 flex flex-col items-center gap-2 cursor-pointer hover:border-red-300 hover:bg-red-50/20 transition-colors">
                <Upload size={24} className="text-gray-300" />
                <p className="text-sm font-medium text-gray-500">Drop your CSV here, or click to browse</p>
                <p className="text-xs text-gray-300">.csv files only</p>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => handleFile(e.target.files[0])} />
              </div>

              {parseError && (
                <div className="flex items-start gap-2 text-xs text-red-500 bg-red-50 px-3 py-2.5 rounded-lg border border-red-100">
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />{parseError}
                </div>
              )}
            </div>
          )}

          {/* ── STEP: preview ── */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">
                    <span className="font-semibold text-gray-800">{rows.length.toLocaleString()}</span> rows ready to import
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Will run in ~{Math.ceil(rows.length / BATCH_SIZE)} batches of {BATCH_SIZE} · {CONCURRENCY} at a time · import continues in background
                  </p>
                </div>
                <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 underline">Start over</button>
              </div>

              {/* Speed estimate */}
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 text-xs text-blue-700">
                <Loader2 size={12} className="shrink-0" />
                Estimated time: ~{Math.max(1, Math.ceil(rows.length / (BATCH_SIZE * CONCURRENCY * 4)))} – {Math.max(2, Math.ceil(rows.length / (BATCH_SIZE * CONCURRENCY * 2)))} seconds.
                You can close this and keep using the site while it runs.
              </div>

              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full text-xs table-fixed">
                  <colgroup>
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '25%' }} />
                    <col style={{ width: '40%' }} />
                    <col style={{ width: '20%' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['SKU','Title','Description','Image URL'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-none">
                        <td className="px-3 py-2 font-mono text-gray-600 truncate">{r.sku}</td>
                        <td className="px-3 py-2 text-gray-700 truncate">{r.title}</td>
                        <td className="px-3 py-2 text-gray-400 truncate">{r.description?.slice(0, 60)}{r.description?.length > 60 ? '…' : ''}</td>
                        <td className="px-3 py-2 truncate">
                          {r.image
                            ? <span className="text-blue-400 truncate block">✓ URL</span>
                            : <span className="text-gray-200 italic">empty</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 6 && (
                  <button
                    onClick={() => setShowAll(v => !v)}
                    className="w-full flex items-center justify-center gap-1 py-2 text-xs text-gray-400 hover:bg-gray-50 border-t border-gray-100 transition-colors">
                    {showAll
                      ? <><ChevronUp size={11} /> Show less</>
                      : <><ChevronDown size={11} /> Show all {rows.length.toLocaleString()} rows</>
                    }
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          {step === 'upload' && (
            <>
              <p className="text-[10px] text-gray-300">Existing overrides will be updated; new SKUs inserted.</p>
              <button onClick={handleClose} className="px-4 py-2 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <p className="text-[10px] text-gray-300">
                {rows.length.toLocaleString()} override{rows.length !== 1 ? 's' : ''} will be upserted (insert or update).
              </p>
              <div className="flex gap-2">
                <button onClick={reset} className="px-4 py-2 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                  Back
                </button>
                <button onClick={startImport}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">
                  <Upload size={12} /> Import {rows.length.toLocaleString()} rows in background
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// HOW TO WIRE THIS INTO ProductsTab.jsx
// Replace the old showCsvUpload state + modal with this pattern:
// ─────────────────────────────────────────────────────────────────────────────
//
//  import { CsvOverrideUploadModal, ImportProgressToast } from './CsvOverrideUploadModal'
//
//  // State
//  const [showCsvUpload, setShowCsvUpload]   = useState(false)
//  const [importProgress, setImportProgress] = useState(null)
//                                              // null | { status, done, total, failed }
//
//  // Handler — fires when user clicks "Import N rows in background"
//  async function handleImportStart({ rows, batches }) {
//    setImportProgress({ status: 'running', done: 0, total: rows.length, failed: 0 })
//
//    const failed = await runBatches(batches, (batchSize, hadError) => {
//      setImportProgress(p => ({
//        ...p,
//        done:   p.done + batchSize,
//        failed: p.failed + (hadError ? batchSize : 0),
//      }))
//    })
//
//    setImportProgress(p => ({ ...p, status: 'done' }))
//    fetchPage()
//    refreshOverrides()
//  }
//
//  // In JSX
//  <CsvOverrideUploadModal
//    open={showCsvUpload}
//    onClose={() => setShowCsvUpload(false)}
//    onImportStart={handleImportStart}
//  />
//  <ImportProgressToast
//    state={importProgress}
//    onDismiss={() => setImportProgress(null)}
//  />
//
// Also export runBatches from this file so ProductsTab can call it:
// (already exported below)
// ─────────────────────────────────────────────────────────────────────────────

export { runBatches }