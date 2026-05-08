async function exportProductsCsv(supabase, {
  supplierId, category, stock, search, minQty, minPrice, maxPrice
} = {}) {
  let allProducts = [], from = 0
  const BATCH = 1000

  // 1. Fetch all matching products (batched)
  while (true) {
    let q = supabase
      .from('products')
      .select('*')
      .range(from, from + BATCH - 1)

    if (supplierId) q = q.eq('supplier_id', supplierId)
    if (category)   q = q.eq('category', category)
    if (stock === 'in')  q = q.gt('stock', 0)
    if (stock === 'out') q = q.eq('stock', 0)
    if (stock === 'low') q = q.gt('stock', 0).lt('stock', 50)
    if (search) q = q.or(`title.ilike.%${search}%,sku.ilike.%${search}%,brand.ilike.%${search}%`)
    if (minQty   != null && minQty   !== '') q = q.gte('stock', parseInt(minQty))
    if (minPrice != null && minPrice !== '') q = q.gte('price', parseFloat(minPrice))
    if (maxPrice != null && maxPrice !== '') q = q.lte('price', parseFloat(maxPrice))

    q = q.order('created_at', { ascending: false })

    const { data, error } = await q
    if (error || !data?.length) break
    allProducts = [...allProducts, ...data]
    if (data.length < BATCH) break
    from += BATCH
  }

  if (!allProducts.length) return

  // 2. Fetch all product_overrides in one shot and key by SKU.
  //    These override title, description, and images — same as the edit page.
  const allSkus = allProducts.map(p => p.sku)
  let overridesBySku = {}
  {
    let oFrom = 0
    while (true) {
      const { data: ovData, error: ovErr } = await supabase
        .from('product_overrides')
        .select('sku, title, description, images')
        .in('sku', allSkus)
        .range(oFrom, oFrom + BATCH - 1)

      if (ovErr || !ovData?.length) break
      ovData.forEach(ov => { overridesBySku[ov.sku] = ov })
      if (ovData.length < BATCH) break
      oFrom += BATCH
    }
  }

  // 3. Fetch all variants for variation_parent products (batched)
  const parentIds = allProducts
    .filter(p => p.product_type === 'variation_parent')
    .map(p => p.product_id)

  let variantsByParent = {}
  if (parentIds.length) {
    let vFrom = 0
    while (true) {
      const { data: vData, error: vErr } = await supabase
        .from('variants')
        .select('*')
        .in('product_id', parentIds)
        .range(vFrom, vFrom + BATCH - 1)

      if (vErr || !vData?.length) break
      vData.forEach(v => {
        if (!variantsByParent[v.product_id]) variantsByParent[v.product_id] = []
        variantsByParent[v.product_id].push(v)
      })
      if (vData.length < BATCH) break
      vFrom += BATCH
    }
  }

  // 4. Helper: safely parse images from either a jsonb array or a JSON string
  const safeParseImages = raw => {
    if (Array.isArray(raw)) return raw
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) } catch { return [] }
    }
    return []
  }

  // 5. Merge overrides into each product — exactly the same logic as ProductEditPage:
  //    if an override row exists, prefer its title/description/images;
  //    otherwise fall back to the products table values.
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
  const productHeaders = Object.keys(allProducts[0])
  const variantOnlyFields = [
    'variant_id', 'variant_sku', 'variant_name',
    'option1_name', 'option1_value',
    'option2_name', 'option2_value',
    'option3_name', 'option3_value',
  ]
  const extraHeaders = variantOnlyFields.filter(f => !productHeaders.includes(f))
  // Add has_override so it's visible in the export
  const allHeaders = [...productHeaders, ...extraHeaders, 'has_override', 'row_type', 'parent_product_id']

  // 7. CSV escape helper
  const esc = v => {
    if (Array.isArray(v)) v = v.join(' | ')
    else if (typeof v === 'object' && v !== null) v = JSON.stringify(v)
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s
  }

  // 8. Build flattened rows: parent row + child variant rows interleaved
  const rows = []

  for (const product of mergedProducts) {
    const isParent    = product.product_type === 'variation_parent'
    const hasOverride = !!overridesBySku[product.sku]

    // Parent / standalone row — uses merged (override-aware) values
    const parentRow = allHeaders.map(h => {
      if (h === 'row_type')          return esc(isParent ? 'variation_parent' : 'standalone')
      if (h === 'parent_product_id') return ''
      if (h === 'has_override')      return esc(hasOverride ? 'yes' : 'no')
      if (h === 'images')            return esc(safeParseImages(product.images))
      if (extraHeaders.includes(h))  return '' // variant-only cols blank for parent row
      return esc(product[h])
    })
    rows.push(parentRow)

    // Child variant rows — inherit parent's merged title/description/images as fallback
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
          if (h === 'images') {
            const vImgs = safeParseImages(v.images)
            // If variant has no own images, inherit the merged parent images
            return esc(vImgs.length ? vImgs : safeParseImages(product.images))
          }
          if (h === 'description')       return esc(product.description) // from merged product
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
          // Inherit parent merged values for category, brand, supplier, etc.
          return esc(product[h] ?? '')
        })
        rows.push(childRow)
      }
    }
  }

  // 9. Build and trigger download
  const csv = [allHeaders.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `products_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}