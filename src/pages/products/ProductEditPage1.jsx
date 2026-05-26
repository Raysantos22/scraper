// C:\Users\ADMIN\scraper\src\pages\products\ProductEditPage.jsx
import { useState, useEffect, useRef } from 'react'

import { supabase } from '../../lib/supabase'
import {
  ArrowLeft, Save, Trash2, X, ExternalLink, Layers,
  GripVertical, ImagePlus, Check, AlertCircle,
  Tag, Package, Pencil, AlertTriangle, Link
} from 'lucide-react'

// ─── Shared Helpers ────────────────────────────────────────────────────────────
export function parseImages(raw) {
  try {
    return typeof raw === 'string'
      ? JSON.parse(raw)
      : Array.isArray(raw) ? raw : []
  } catch { return [] }
}

export function StockBadge({ stock }) {
  if (stock === 0)
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-100 whitespace-nowrap">Out of stock</span>
  if (stock < 2)
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-yellow-50 text-yellow-700 border border-yellow-100 whitespace-nowrap">Low stock</span>
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 border border-green-100 whitespace-nowrap">In stock</span>
}

// ─── Generic Confirm Modal ─────────────────────────────────────────────────────
function ConfirmModal({ open, icon, title, message, confirmLabel, confirmClass, cancelLabel, onConfirm, onCancel }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm p-6">
        <div className="flex flex-col items-center text-center gap-3">
          {icon && (
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-500">
              {icon}
            </div>
          )}
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {message && <p className="text-xs text-gray-500 leading-relaxed">{message}</p>}
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onCancel}
            className="flex-1 px-4 py-2 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            {cancelLabel || 'Cancel'}
          </button>
          <button onClick={onConfirm}
            className={`flex-1 px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors ${confirmClass || 'bg-red-600 hover:bg-red-700'}`}>
            {confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Unsaved Changes Modal ─────────────────────────────────────────────────────
function UnsavedModal({ open, onSave, onDiscard, onCancel }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm p-6">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
            <AlertTriangle size={22} />
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Unsaved changes</h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            You have unsaved changes. Do you want to save before leaving, or discard them?
          </p>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onCancel}
            className="flex-1 px-4 py-2 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            Keep editing
          </button>
          <button onClick={onDiscard}
            className="flex-1 px-4 py-2 text-xs font-medium border border-gray-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors">
            Discard
          </button>
          <button onClick={onSave}
            className="flex-1 px-4 py-2 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">
            Save & leave
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Image Link Modal ──────────────────────────────────────────────────────────
function ImageLinkModal({ open, url, onClose }) {
  const inputRef = useRef(null)
  useEffect(() => { if (open && inputRef.current) inputRef.current.select() }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-md p-5">
        <div className="flex items-center gap-2 mb-3">
          <Link size={14} className="text-gray-400" />
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Image URL</h3>
          <button onClick={onClose} className="ml-auto text-gray-300 hover:text-gray-500 transition-colors">
            <X size={14} />
          </button>
        </div>
        <input ref={inputRef} readOnly value={url}
          className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg font-mono text-gray-700 bg-gray-50 focus:outline-none focus:border-gray-400 mb-3" />
        <div className="flex gap-2">
          <button onClick={() => { navigator.clipboard.writeText(url); onClose() }}
            className="flex-1 px-3 py-2 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors">
            Copy URL
          </button>
          <a href={url} target="_blank" rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">
            <ExternalLink size={11} /> Open in new tab
          </a>
        </div>
      </div>
    </div>
  )
}

// ─── Section / Field / Input / Textarea ───────────────────────────────────────
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
    <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-200 placeholder-gray-300 text-gray-800 transition-colors ${className}`}
    />
  )
}

function Textarea({ value, onChange, placeholder, rows = 4 }) {
  return (
    <textarea value={value ?? ''} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} rows={rows}
      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-200 placeholder-gray-300 text-gray-800 resize-none transition-colors"
    />
  )
}

// ─── Image Manager ─────────────────────────────────────────────────────────────
// No immediate DB persist — all changes flow through handleSave only.
function ImageManager({ images, onChange }) {
  const [newUrl, setNewUrl]           = useState('')
  const [active, setActive]           = useState(0)
  const [deleteIndex, setDeleteIndex] = useState(null)
  const [linkUrl, setLinkUrl]         = useState(null)

  function addUrl() {
    const url = newUrl.trim()
    if (!url) return
    onChange([...images, url])
    setNewUrl('')
    setActive(images.length)
  }

  function doRemove() {
    const i    = deleteIndex
    const next = images.filter((_, idx) => idx !== i)
    onChange(next)
    setActive(Math.min(active, next.length - 1))
    setDeleteIndex(null)
  }

  function moveUp(i) {
    if (i === 0) return
    const next = [...images]
    ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
    onChange(next)
    setActive(i - 1)
  }

  return (
    <>
      <ConfirmModal
        open={deleteIndex !== null}
        icon={<Trash2 size={22} />}
        title="Remove this image?"
        message="This image will be removed from the product. Click Save Changes to persist."
        confirmLabel="Yes, remove"
        confirmClass="bg-red-600 hover:bg-red-700"
        cancelLabel="Cancel"
        onConfirm={doRemove}
        onCancel={() => setDeleteIndex(null)}
      />
      <ImageLinkModal open={!!linkUrl} url={linkUrl || ''} onClose={() => setLinkUrl(null)} />

      <div className="space-y-3">
        <div className="relative bg-gray-50 rounded-xl border border-gray-100 h-56 flex items-center justify-center overflow-hidden">
          {images[active]
            ? <img src={images[active]} alt="" className="max-h-full max-w-full object-contain p-4" />
            : <div className="flex flex-col items-center gap-2 text-gray-300"><ImagePlus size={32} /><span className="text-xs">No images yet</span></div>
          }
          {images[active] && (
            <div className="absolute top-2 right-2 flex gap-1">
              <button onClick={() => setLinkUrl(images[active])} title="View image URL"
                className="w-7 h-7 bg-white rounded-full shadow border border-gray-100 flex items-center justify-center text-gray-400 hover:text-blue-500 transition-colors">
                <Link size={12} />
              </button>
              <button onClick={() => setDeleteIndex(active)} title="Remove image"
                className="w-7 h-7 bg-white rounded-full shadow border border-gray-100 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors">
                <X size={12} />
              </button>
            </div>
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
                      className="w-4 h-4 bg-white rounded-full shadow border border-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-800 text-[8px]">
                      ↑
                    </button>
                  )}
                  <button onClick={() => setDeleteIndex(i)}
                    className="w-4 h-4 bg-white rounded-full shadow border border-gray-200 flex items-center justify-center text-red-400">
                    <X size={8} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input type="url" value={newUrl} onChange={e => setNewUrl(e.target.value)}
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
    </>
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

// ─── Product Edit Page ─────────────────────────────────────────────────────────
//
// STATE SPLIT — two separate state objects, never mixed:
//
//  pf  (productFields)  → saved to `products` table only
//      price, stock, category, brand, sku, product_url, product_type, supplier_id
//
//  ov  (overrideFields) → saved to `product_overrides` table only
//      title, description, images
//
// KEY FIX: images are loaded as:
//   hasOv → parseImages(ovRow.images)   ← use override value as-is, even if empty []
//   !hasOv → parseImages(p.images)      ← no override, use scraped row
//
// This means a saved empty [] is respected and never falls back to p.images.
// On save, images is always stored as ov.images ?? [] — never null —
// so null in product_overrides.images is unambiguous "no override row" signal.
// ──────────────────────────────────────────────────────────────────────────────
export default function ProductEditPage({ productId, suppliers, categories, onBack, onSaved }) {
  // ── Separate state for each table ──
  const [pf, setPf] = useState(null)   // products table fields
  const [ov, setOv] = useState(null)   // product_overrides fields

  // Snapshots for dirty detection
  const [pfSnap, setPfSnap] = useState(null)
  const [ovSnap, setOvSnap] = useState(null)

  const pfRef = useRef(null)
  useEffect(() => { pfRef.current = pf }, [pf])

  // Cache the original scraped product row at load time.
  // doRemoveOverride reads from here — never from a re-fetch —
  // so the original images are always available regardless of
  // what has been saved to product_overrides.
  const originalProductRef = useRef(null)

  // Misc
  const [variants, setVariants]         = useState([])
  const [varSnap, setVarSnap]           = useState([])
  const [hasOverride, setHasOverride]   = useState(false)
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)
  const [error, setError]               = useState(null)

  // Modals
  const [showUnsaved, setShowUnsaved]               = useState(false)
  const [showRemoveOverride, setShowRemoveOverride] = useState(false)

  // ── Load ──
  useEffect(() => {
    async function load() {
      setLoading(true)

      const { data: p } = await supabase
        .from('products').select('*').eq('product_id', productId).single()

      if (p) {
        // Store the original scraped row so Remove Override can always
        // restore from it, even after Save Changes has been clicked.
        originalProductRef.current = p

        const { data: ovRow } = await supabase
          .from('product_overrides')
          .select('sku, title, description, images')
          .eq('sku', p.sku)
          .maybeSingle()

        const hasOv = !!ovRow
        setHasOverride(hasOv)

        // ── products table fields only ──
        const pfData = {
          product_id:        p.product_id,
          sku:               p.sku,
          price:             p.price,
          stock:             p.stock,
          category:          p.category,
          brand:             p.brand,
          short_description: p.short_description,
          product_url:       p.product_url,
          product_type:      p.product_type,
          supplier_id:       p.supplier_id,
          created_at:        p.created_at,
          updated_at:        p.updated_at,
        }

        // ── FIX: if override exists, use its images value as-is (even if []).
        // Never fall back to p.images when hasOv is true — that would resurrect
        // deliberately deleted images on every reload.
        const ovData = {
          title:       hasOv ? (ovRow.title       ?? p.title)       : p.title,
          description: hasOv ? (ovRow.description ?? p.description) : p.description,
          images:      hasOv ? parseImages(ovRow.images) : parseImages(p.images),
        }

        setPf(pfData)
        setOv(ovData)
        setPfSnap(JSON.parse(JSON.stringify(pfData)))
        setOvSnap(JSON.parse(JSON.stringify(ovData)))

        if (p.product_type === 'variation_parent') {
          const { data: vs } = await supabase
            .from('variants').select('*').eq('product_id', productId)
          setVariants(vs || [])
          setVarSnap(JSON.parse(JSON.stringify(vs || [])))
        }
      }
      setLoading(false)
    }
    load()
  }, [productId])

  // ── Dirty detection ──
  function isDirty() {
    if (!pf || !ov) return false
    return JSON.stringify(pf) !== JSON.stringify(pfSnap) ||
           JSON.stringify(ov) !== JSON.stringify(ovSnap) ||
           JSON.stringify(variants) !== JSON.stringify(varSnap)
  }

  // ── Setters ──
  function setPfField(field, value) { setPf(p => ({ ...p, [field]: value })) }
  function setOvField(field, value) { setOv(o => ({ ...o, [field]: value })) }

  // ── Back with guard ──
  function handleBack() {
    if (isDirty()) setShowUnsaved(true)
    else onBack()
  }

  // ── Remove override: delete row, restore raw products data ──
  async function doRemoveOverride() {
    setShowRemoveOverride(false)
    setError(null)

    const { error: err } = await supabase
      .from('product_overrides').delete().eq('sku', pf.sku)
    if (err) { setError(err.message); return }

    // Restore from the original scraped product cached at load time.
    const p = originalProductRef.current
    if (p) {
      const rawImages =
        Array.isArray(p.images)
          ? p.images
          : typeof p.images === 'string'
            ? (() => { try { return JSON.parse(p.images) } catch { return [] } })()
            : []

      const restoredOv = {
        title:       p.title       ?? '',
        description: p.description ?? '',
        images:      rawImages,
      }

      setOv(restoredOv)
      setOvSnap(JSON.parse(JSON.stringify(restoredOv)))
    }

    setHasOverride(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    onSaved?.()
  }

  // ── Save ──
  // pf fields → products table ONLY
  // ov fields → product_overrides table ONLY
  // images is stored as ov.images ?? [] — NEVER null —
  // so that an empty array is unambiguously "images deleted intentionally"
  // and is not confused with "no override row" on next load.
  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      // 1. Save operational fields to products table
      const { error: prodErr } = await supabase
        .from('products')
        .update({
          price:             parseFloat(pf.price) || 0,
          stock:             parseInt(pf.stock)   || 0,
          category:          pf.category,
          brand:             pf.brand,
          short_description: pf.short_description,
          sku:               pf.sku,
          product_url:       pf.product_url,
          product_type:      pf.product_type,
          supplier_id:       pf.supplier_id,
          updated_at:        new Date().toISOString(),
        })
        .eq('product_id', productId)
      if (prodErr) throw prodErr

      // 2. Save display content to product_overrides ONLY — never to products.
      //    Store images as [] when empty so null in this column always means
      //    "no override row fetched", never "images were cleared".
      const { error: ovErr } = await supabase
        .from('product_overrides')
        .upsert({
          sku:         pf.sku,
          title:       ov.title       || null,
          description: ov.description || null,
          images:      ov.images ?? [],
          updated_at:  new Date().toISOString(),
        }, { onConflict: 'sku' })
      if (ovErr) throw ovErr

      setHasOverride(true)

      // 3. Save variants
      for (const v of variants) {
        await supabase.from('variants').update({
          variant_name:  v.variant_name,
          variant_sku:   v.variant_sku,
          price:         parseFloat(v.price) || 0,
          stock:         parseInt(v.stock)   || 0,
          option1_value: v.option1_value,
          option2_value: v.option2_value,
          updated_at:    new Date().toISOString(),
        }).eq('variant_id', v.variant_id)
      }

      // 4. Sync snapshots so dirty indicator resets
      setPfSnap(JSON.parse(JSON.stringify(pf)))
      setOvSnap(JSON.parse(JSON.stringify(ov)))
      setVarSnap(JSON.parse(JSON.stringify(variants)))

      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      onSaved?.()
    } catch (e) {
      setError(e.message || 'Save failed')
    }
    setSaving(false)
  }

  async function handleSaveAndLeave() {
    await handleSave()
    setShowUnsaved(false)
    onBack()
  }

  // ── Render guards ──
  if (loading) {
    return (
      <div className="p-8 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  if (!pf || !ov) {
    return <div className="p-8 text-center text-gray-400">Product not found.</div>
  }

  const dirty = isDirty()

  return (
    <div className="min-h-full bg-gray-50">

      {/* ── Modals ── */}
      <ConfirmModal
        open={showRemoveOverride}
        icon={<Trash2 size={22} />}
        title="Remove override?"
        message="This will delete the override record and immediately restore the original scraped title, description, and images. Any unsaved edits will be discarded."
        confirmLabel="Yes, remove override"
        confirmClass="bg-purple-600 hover:bg-purple-700"
        cancelLabel="Keep override"
        onConfirm={doRemoveOverride}
        onCancel={() => setShowRemoveOverride(false)}
      />
      <UnsavedModal
        open={showUnsaved}
        onSave={handleSaveAndLeave}
        onDiscard={() => { setShowUnsaved(false); onBack() }}
        onCancel={() => setShowUnsaved(false)}
      />

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={handleBack}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors">
            <ArrowLeft size={14} /> Back to products
          </button>
          <span className="text-gray-200">|</span>
          <div className="flex items-center gap-2 min-w-0">
            <Package size={13} className="text-gray-400 shrink-0" />
            <span className="text-xs font-medium text-gray-700 truncate max-w-xs">{ov.title}</span>
            {hasOverride && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700 border border-purple-100 whitespace-nowrap">
                🔒 Manually edited
              </span>
            )}
            {dirty && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-600 border border-amber-100 whitespace-nowrap">
                ● Unsaved
              </span>
            )}
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
          {hasOverride && (
            <button onClick={() => setShowRemoveOverride(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-purple-200 text-purple-600 rounded-lg hover:bg-purple-50 transition-colors">
              🔓 Remove override
            </button>
          )}
          {pf.product_url && (
            <a href={pf.product_url} target="_blank" rel="noreferrer"
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

      {/* ── Body ── */}
      <div className="p-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-3 gap-5">

          {/* Left column */}
          <div className="col-span-2 space-y-5">

            {/* Override fields — go to product_overrides */}
            <Section title="Product Info" icon={Pencil}>
              <div className="space-y-4">
                <Field label="Title" hint="Saved to product_overrides">
                  <Input value={ov.title} onChange={v => setOvField('title', v)} placeholder="Product title" />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Brand" hint="Saved to products">
                    <Input value={pf.brand} onChange={v => setPfField('brand', v)} placeholder="Brand name" />
                  </Field>
                  <Field label="SKU" hint="Saved to products">
                    <Input value={pf.sku} onChange={v => setPfField('sku', v)} placeholder="SKU" className="font-mono" />
                  </Field>
                </div>
                <Field label="Description" hint="Saved to product_overrides">
                  <Textarea value={ov.description} onChange={v => setOvField('description', v)} placeholder="Full product description…" rows={5} />
                </Field>
                <Field label="Short Description" hint="Saved to products">
                  <Textarea value={pf.short_description} onChange={v => setPfField('short_description', v)} placeholder="Brief summary…" rows={2} />
                </Field>
                <Field label="Product URL" hint="Saved to products">
                  <Input value={pf.product_url} onChange={v => setPfField('product_url', v)} placeholder="https://…" type="url" />
                </Field>
              </div>
            </Section>

            {/* Images — go to product_overrides */}
            <Section title="Images" icon={ImagePlus}>
              <ImageManager
                images={ov.images}
                onChange={v => setOvField('images', v)}
              />
            </Section>

            {pf.product_type === 'variation_parent' && (
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

          {/* Right column */}
          <div className="space-y-5">
            <Section title="Pricing & Stock" icon={Tag}>
              <div className="space-y-4">
                <Field label="Price ($)">
                  <Input type="number" value={pf.price} onChange={v => setPfField('price', v)} placeholder="0.00" />
                </Field>
                <Field label="Stock">
                  <Input type="number" value={pf.stock} onChange={v => setPfField('stock', v)} placeholder="0" />
                </Field>
                <div className="pt-1">
                  <StockBadge stock={parseInt(pf.stock) || 0} />
                </div>
              </div>
            </Section>

            <Section title="Organization" icon={Package}>
              <div className="space-y-4">
                <Field label="Category">
                  <select value={pf.category || ''} onChange={e => setPfField('category', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 text-gray-800 bg-white">
                    <option value="">— None —</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Supplier">
                  <select value={pf.supplier_id || ''} onChange={e => setPfField('supplier_id', parseInt(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 text-gray-800 bg-white">
                    <option value="">— None —</option>
                    {Object.values(suppliers).map(s => (
                      <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Product Type">
                  <Input value={pf.product_type || ''} onChange={v => setPfField('product_type', v)} placeholder="e.g. variation_parent" />
                </Field>
              </div>
            </Section>

            {/* Meta */}
            <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 space-y-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Meta</p>
              <div className="space-y-1 text-xs text-gray-400">
                <div className="flex justify-between">
                  <span>Product ID</span>
                  <span className="font-mono text-gray-600">{pf.product_id}</span>
                </div>
                <div className="flex justify-between">
                  <span>SKU</span>
                  <span className="font-mono text-gray-600">{pf.sku}</span>
                </div>
                <div className="flex justify-between">
                  <span>Created</span>
                  <span>{pf.created_at ? new Date(pf.created_at).toLocaleDateString() : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Updated</span>
                  <span>{pf.updated_at ? new Date(pf.updated_at).toLocaleDateString() : '—'}</span>
                </div>
                {variants.length > 0 && (
                  <div className="flex justify-between">
                    <span>Variants</span>
                    <span>{variants.length}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-gray-100 mt-1">
                  <span>Override</span>
                  <span className={hasOverride ? 'text-purple-600 font-medium' : 'text-gray-300'}>
                    {hasOverride ? 'Active' : 'None'}
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}