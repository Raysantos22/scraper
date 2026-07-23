// src/lib/exportCsv.js
import { api } from './api'

export async function exportProductsCsv({
  filterSupplier: supplierId, filterCategory: category, filterStock: stock,
  search, filterMinQty: minQty, filterMinPrice: minPrice, filterMaxPrice: maxPrice,
  filterOverride,
} = {}, onProgress = () => {}) {
  let allProducts = [], page = 0
  const LIMIT = 1000

  // 1. Fetch all matching products (paginated)
  onProgress({ stage: 'products', done: 0, total: null })
  while (true) {
    const params = new URLSearchParams({
      page, limit: LIMIT,
      sort: 'created_at', dir: 'desc',
      ...(filterOverride  ? { override: 'true' }          : {}),
      ...(search          ? { search }                    : {}),
      ...(category        ? { category }                  : {}),
      ...(stock           ? { stock }                     : {}),
      ...(supplierId      ? { supplier_id: supplierId }   : {}),
      ...(minQty   != null && minQty   !== '' ? { minQty }   : {}),
      ...(minPrice != null && minPrice !== '' ? { minPrice } : {}),
      ...(maxPrice != null && maxPrice !== '' ? { maxPrice } : {}),
    })

    const res = await api.get(`/api/products?${params}`)
    if (!res?.data?.length) break
    allProducts = [...allProducts, ...res.data]
    onProgress({ stage: 'products', done: allProducts.length, total: res.count || null })
    if (allProducts.length >= res.count) break
    page++
  }

  if (!allProducts.length) return

  // 2. Fetch all override SKUs
  onProgress({ stage: 'overrides', done: 0, total: null })
  const allSkus = allProducts.map(p => p.sku)
  let overridesBySku = {}
  try {
    const result = await api.post('/api/product-overrides/bulk-get', { skus: allSkus })
    if (result && !result.error) overridesBySku = result
  } catch {}

  // 3. Fetch variants for variation_parent products — one bulk call instead
  // of one request per parent. On large exports (thousands of variation
  // parents) this is the difference between ~40 requests and ~40,000, and
  // avoids net::ERR_INSUFFICIENT_RESOURCES from opening too many sockets
  // at once.
  const parentIds = allProducts.filter(p => p.product_type === 'variation_parent').map(p => p.product_id)
  let variantsByParent = {}
  const BULK_VARIANTS_CHUNK = 5000
  onProgress({ stage: 'variants', done: 0, total: parentIds.length })
  for (let i = 0; i < parentIds.length; i += BULK_VARIANTS_CHUNK) {
    const slice = parentIds.slice(i, i + BULK_VARIANTS_CHUNK)
    try {
      const grouped = await api.post('/api/variants/bulk', { product_ids: slice })
      Object.assign(variantsByParent, grouped)
    } catch {}
    onProgress({ stage: 'variants', done: Math.min(i + BULK_VARIANTS_CHUNK, parentIds.length), total: parentIds.length })
  }

  onProgress({ stage: 'building', done: 0, total: allProducts.length })

  // 4. Helper: safely parse images
  const safeParseImages = raw => {
    if (Array.isArray(raw)) return raw
    if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return [] } }
    return []
  }

  // 5. Merge overrides
  const mergedProducts = allProducts.map(p => {
    const ov = overridesBySku[p.sku]
    if (!ov) return p
    return {
      ...p,
      title:       ov.title       ?? p.title,
      description: ov.description ?? p.description,
      images:      safeParseImages(ov.images ?? p.images),
    }
  })

  // 6. Build headers
  const productHeaders = Object.keys(allProducts[0]).filter(h => h !== 'metadata')
  const variantOnlyFields = [
    'variant_id', 'variant_sku', 'variant_name',
    'option1_name', 'option1_value', 'option2_name', 'option2_value',
    'option3_name', 'option3_value',
  ]
  const metadataFields = ['ean', 'upc', 'isbn', 'condition', 'merchant_name', 'item_length', 'item_width', 'item_height', 'item_length_unit']
  const extraHeaders = variantOnlyFields.filter(f => !productHeaders.includes(f))
  const allHeaders = [...productHeaders, ...metadataFields, ...extraHeaders, 'has_override', 'row_type', 'parent_product_id']

  // Safely parse metadata JSON (string from DB, or already-object)
  const safeParseMetadata = raw => {
    if (raw && typeof raw === 'object') return raw
    if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return {} } }
    return {}
  }

  // 7. CSV escape helper
  const esc = v => {
    if (Array.isArray(v)) v = v.join(' | ')
    else if (typeof v === 'object' && v !== null) v = JSON.stringify(v)
    let s = v == null ? '' : String(v)
    s = s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }

  // 8. Build rows
  const rows = []
  let builtCount = 0
  const BUILD_PROGRESS_EVERY = 2000
  for (const product of mergedProducts) {
    const isParent    = product.product_type === 'variation_parent'
    const hasOverride = !!overridesBySku[product.sku]

    const parentRow = allHeaders.map(h => {
      if (h === 'row_type')          return esc(isParent ? 'variation_parent' : 'standalone')
      if (h === 'parent_product_id') return ''
      if (h === 'has_override')      return esc(hasOverride ? 'yes' : 'no')
      if (h === 'images')            return esc(safeParseImages(product.images))
      if (metadataFields.includes(h)) {
        const meta = safeParseMetadata(product.metadata)
        return esc(meta[h] ?? (meta.dimensions ? meta.dimensions[h.replace('item_', '').replace('_unit', 'unit')] : '') ?? '')
      }
      if (extraHeaders.includes(h))  return ''
      return esc(product[h])
    })
    rows.push(parentRow)

    if (isParent && variantsByParent[product.product_id]) {
      for (const v of variantsByParent[product.product_id]) {
        const childRow = allHeaders.map(h => {
          if (h === 'row_type')          return 'variant'
          if (h === 'parent_product_id') return esc(product.product_id)
          if (h === 'has_override')      return esc(hasOverride ? 'yes' : 'no')
          if (h === 'product_id')        return esc(v.variant_id)
          if (h === 'sku')               return esc(v.variant_sku)
          if (h === 'title')             return esc(v.variant_name)
          if (h === 'price')             return esc(v.price)
          if (h === 'stock')             return esc(v.stock)
          if (h === 'images')            return esc(safeParseImages(v.images).length ? safeParseImages(v.images) : safeParseImages(product.images))
          if (h === 'description')       return esc(product.description)
          if (h === 'created_at')        return esc(v.created_at)
          if (h === 'updated_at')        return esc(v.updated_at)
          if (h === 'metadata')          return esc(v.metadata)
          if (h === 'variant_id')        return esc(v.variant_id)
          if (h === 'variant_sku')       return esc(v.variant_sku)
          if (h === 'variant_name')      return esc(v.variant_name)
          if (h === 'option1_name')      return esc(v.option1_name)
          if (h === 'option1_value')     return esc(v.option1_value)
          if (h === 'option2_name')      return esc(v.option2_name)
          if (h === 'option2_value')     return esc(v.option2_value)
          if (h === 'option3_name')      return esc(v.option3_name)
          if (h === 'option3_value')     return esc(v.option3_value)
          if (metadataFields.includes(h)) {
            const meta = safeParseMetadata(v.metadata ?? product.metadata)
            return esc(meta[h] ?? (meta.dimensions ? meta.dimensions[h.replace('item_', '').replace('_unit', 'unit')] : '') ?? '')
          }
          return esc(product[h] ?? '')
        })
        rows.push(childRow)
      }
    }

    builtCount++
    if (builtCount % BUILD_PROGRESS_EVERY === 0) {
      onProgress({ stage: 'building', done: builtCount, total: mergedProducts.length })
    }
  }
  onProgress({ stage: 'building', done: mergedProducts.length, total: mergedProducts.length })

  // 9. Download
  onProgress({ stage: 'downloading', done: rows.length, total: rows.length })
  const csv  = [allHeaders.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `products_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}