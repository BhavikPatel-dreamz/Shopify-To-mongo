/**
 * Extract product attributes from options and metafields
 */
function extractAttributes(product) {
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

  // Extract from options
  if (product.options) {
    product.options.forEach(option => {
      const optionName = option.name.toLowerCase();
      if (optionName.includes('color') || optionName.includes('colour')) {
        attributes.color = option.values[0];
      } else if (optionName.includes('size')) {
        attributes.size = option.values[0];
      } 
    
    });
  }

  // Extract from metafields
  if (product.metafields && product.metafields.edges) {
    product.metafields.edges.forEach(({ node }) => {
      const { namespace, key, value } = node;
      if (namespace === 'product' || namespace === 'custom') {
        const metaKey = key.toLowerCase();
        // ... attribute extractions from metafields
      }
    });
  }

  // Extract from tags
  if (product.tags) {
    const tagsList = Array.isArray(product.tags) ? product.tags : product.tags.split(',').map(tag => tag.trim());
    tagsList.forEach(tag => {
      // ... attribute extractions from tags
    });
  }

  attributes.brand = (product.vendor) ? product.vendor :'';
  

  return attributes;
}

/**
 * Transform Shopify product to match our Product model schema
 */
function transformProduct(shopifyProduct) {
  const attributes = extractAttributes(shopifyProduct);
  
  // Construct the product URL using the handle
  const productUrl = `https://${process.env.SHOPIFY_STORE_NAME}.myshopify.com/products/${shopifyProduct.handle}`;

  // Transform variants
  const variants = shopifyProduct.variants.edges.map(({ node }) => ({
    variantId: node.id,
    title: node.title,
    price: parseFloat(node.price),
    sku: node.sku || '',
    inventory: node.inventoryQuantity || 0,
    attributes: node.selectedOptions.reduce((acc, opt) => {
      acc[opt.name.toLowerCase()] = opt.value;
      return acc;
    }, {})
  }));

  // Extract structured tags
  const structuredTags = new Map();
  if (Array.isArray(shopifyProduct.tags)) {
    shopifyProduct.tags.forEach(tag => {
      let [category, value] = tag.split(':');
      if (!value) {
        [category, value] = tag.split('-');
      }
        if (value) {
      const key = category.toLowerCase().replace(/\./g, '[dot]');
      structuredTags[key] = value.toLowerCase();
    }
    });
  }

  // Add new tag categories to attributes
  structuredTags.forEach((value, key) => {
    if (!attributes.hasOwnProperty(key)) {
      attributes[key] = value;
    }
  });

  // Extract collection names
  const collections = shopifyProduct.collections.edges.map(({ node }) => node.title);
  const collection_handle = shopifyProduct.collections.edges.map(({ node }) => node.handle);
 

  // Combine attributes, tags, and structured tags
  const combinedAttributes = {
    ...attributes,
    ...Object.fromEntries(structuredTags)
  };


  console.log('Extracted Attributes:', shopifyProduct.status);

  // Transform to match our Product schema
  const transformedProduct = {
    productId: shopifyProduct.id.replace('gid://shopify/Product/', ''),
    shopifyId: shopifyProduct.id,
    handle: shopifyProduct.handle,
    name: shopifyProduct.title,
    description: shopifyProduct.description || '',
    price: parseFloat(shopifyProduct.variants.edges[0]?.node.price) || 0,
    compareAtPrice: parseFloat(shopifyProduct.variants.edges[0]?.node.compareAtPrice) || null,
    categories: shopifyProduct.productType ? [shopifyProduct.productType] : [],
    tags: Array.isArray(shopifyProduct.tags) ? shopifyProduct.tags : [],
    structuredTags: structuredTags,
    brand: shopifyProduct.vendor || '',
    productGroup: structuredTags.get('collection') || '',
    vendor: shopifyProduct.vendor || '',
    productType: shopifyProduct.productType || '',
    collections: collections,  // Include collections in the product schema
    collection_handle: collection_handle, // Include collection handles
    
    attributes: {
      color: attributes.color || null,
      size: attributes.size || null,
      material: attributes.material || null,
      season: attributes.season || null,
      gender: attributes.gender || null,
      style: attributes.style || null,
      pattern: attributes.pattern || null,
      fit: attributes.fit || null,
      ...attributes,
      ...combinedAttributes // Include any new attributes
    },
    
    variants: variants,
    
    images: shopifyProduct.images.edges.map(({ node }) => ({
      url: node.url,
      alt: node.altText || ''
    })),
    
    imageUrl: shopifyProduct.images.edges[0]?.node.url || '',
    
    productUrl: productUrl,
    
    isAvailable: shopifyProduct.status == 'ACTIVE' ? true : false,
    hasEmbedding: false,
    vectorId: null,
    createdAt: new Date(shopifyProduct.createdAt),
    updatedAt: new Date(shopifyProduct.updatedAt)
  };

  // console.log('Transformed Product Structure:', {
  //   id: transformedProduct.productId,
  //   shopifyId: transformedProduct.shopifyId,
  //   name: transformedProduct.name,
  //   hasRequiredFields: {
  //     name: !!transformedProduct.name,
  //     description: !!transformedProduct.description,
  //     price: typeof transformedProduct.price === 'number'
  //   }
  // });

  return transformedProduct;
}

export {
  transformProduct,
  extractAttributes
}; 