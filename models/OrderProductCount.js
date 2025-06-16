import mongoose from 'mongoose';

const OrderProductSchema = new mongoose.Schema({
    product_id: {
        type: String,
        required: true,
        ref: 'Product',
    },
    order_id: {
        type: Number,
        required: true,
    },
    shopifyId: {
        type: String,
        required: true,
    },
    orderNumber: {
        type: Number,
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});


export default mongoose.model("OrderProduct", OrderProductSchema, "order_product");