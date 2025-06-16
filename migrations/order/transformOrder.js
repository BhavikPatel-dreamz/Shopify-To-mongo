export function transformWebhookOrder(webhookOrder) {
  // Transform line items from the order
 let transformedOrders = []; 

transformedOrders = webhookOrder.line_items.map(item => ({
  order_id: webhookOrder.id,
  shopifyId: webhookOrder.admin_graphql_api_id,
  orderNumber: webhookOrder.order_number,
  product_id: item.product_id ? item.product_id.toString() : null,
  quantity: item.quantity,
  createdAt: new Date(webhookOrder.created_at),
  updatedAt: new Date(webhookOrder.updated_at),
}));

return transformedOrders;
}