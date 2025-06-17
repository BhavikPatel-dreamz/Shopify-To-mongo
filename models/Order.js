import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
    product_id: {
        type: String,
        required: true,
        ref: 'Product',
    },
    order_id: {
        type: Number,
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

// Update the updatedAt timestamp before saving
orderSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

const Order = mongoose.model('Order', orderSchema);

export default Order; 