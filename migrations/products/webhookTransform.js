/**
 * Transform Shopify webhook product data to match our Product model schema
 */
export function transformWebhookProduct(webhookProduct) {
  // Extract tags and structure them
  const tags = webhookProduct.tags ? webhookProduct.tags.split(', ') : [];
  const structuredTags = new Map();
  tags.forEach(tag => {
    const [category, value] = tag.split('-');
    if (value) {
      structuredTags.set(category.trim(), value.trim());
    }
  });

  // Transform variants
  const variants = webhookProduct.variants.map(variant => ({
    variantId: variant.admin_graphql_api_id,
    title: variant.title,
    price: parseFloat(variant.price),
    sku: variant.sku || '',
    inventory: variant.inventory_quantity || 0,
    attributes: {
      size: variant.option1,
      color: variant.option2,
    }
  }));

  // Extract attributes from tags and product data
  const attributes = {
    color: null,
    size: null,
    material: null,
    season: null,
    gender: null,
    style: null,
    pattern: null,
    fit: null,
    brand: null
  };

  // Extract from tags
  tags.forEach(tag => {
    if (tag.startsWith('COLOR-')) attributes.color = tag.replace('COLOR-', '');
    if (tag.startsWith('GENDER-')) attributes.gender = tag.replace('GENDER-', '');
    if (tag.startsWith('BRAND-')) attributes.brand = tag.replace('BRAND-', '');
  });

  // Extract from options
  webhookProduct.options.forEach(option => {
    const optionName = option.name.toLowerCase();
    if (optionName === 'color') {
      attributes.color = option.values[0];
    } else if (optionName === 'size') {
      attributes.size = option.values[0];
    }
  });

  // Transform images
  const images = webhookProduct.images.map(image => ({
    url: image.src,
    alt: image.alt || ''
  }));

  // Construct the product URL
  const productUrl = `https://${process.env.SHOPIFY_STORE_NAME}.myshopify.com/products/${webhookProduct.handle}`;

  // Transform to match our Product schema
  const transformedProduct = {
    productId: webhookProduct.id.toString(),
    handle: webhookProduct.handle,
    shopifyId: webhookProduct.admin_graphql_api_id,
    name: webhookProduct.title,
    description: webhookProduct.body_html || '',
    price: parseFloat(webhookProduct.variants[0]?.price) || 0,
    compareAtPrice: parseFloat(webhookProduct.variants[0]?.compare_at_price) || null,
    categories: webhookProduct.product_type ? [webhookProduct.product_type] : [],
    tags: tags,
    structuredTags: Object.fromEntries(structuredTags),
    brand: webhookProduct.vendor || '',
    productGroup: structuredTags.get('GROUP') || '',
    vendor: webhookProduct.vendor || '',
    productType: webhookProduct.product_type || '',
    
    attributes: {
      color: attributes.color,
      size: attributes.size,
      material: attributes.material,
      season: attributes.season,
      gender: attributes.gender,
      style: attributes.style,
      pattern: attributes.pattern,
      fit: attributes.fit,
      brand: attributes.brand
    },
    
    variants: variants,
    images: images,
    imageUrl: webhookProduct.image?.src || '',
    productUrl: productUrl,

    isAvailable: webhookProduct.status == 'active' ? true : false,
    hasEmbedding: false,
    vectorId: null,
    createdAt: new Date(webhookProduct.created_at),
    updatedAt: new Date(webhookProduct.updated_at)
  };

  return transformedProduct;
} 