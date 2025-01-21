/**
 * @fileoverview MongoDB schema for marketplace products with HIPAA compliance and validation
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import { Schema, model, Document } from 'mongoose'; // v7.0.0
import { ProductCategory } from '../../marketplace-service/src/config/marketplace.config';

// Constants for validation and security
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_IMAGES = 10;
const MIN_PRICE = 0;
const MAX_PRICE = 1000000;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Interface for product details with category-specific fields
 */
interface IProductDetails {
  duration?: number;
  format?: string;
  prerequisites?: string[];
  medicalInfo?: string;
  certifications?: string[];
  availability?: {
    startDate: Date;
    endDate?: Date;
    slots?: number;
  };
  compliance: {
    hipaaCompliant: boolean;
    certifications: string[];
    dataProtectionLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  };
}

/**
 * Interface for marketplace product document
 */
export interface IMarketplaceProduct extends Document {
  name: string;
  description: string;
  category: ProductCategory;
  price: number;
  providerId: string;
  images: string[];
  details: IProductDetails;
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING_REVIEW';
  metadata: Record<string, any>;
  searchScore?: number;
  audit: {
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    updatedBy: string;
    version: number;
  };
}

/**
 * Schema definition for marketplace products with comprehensive validation
 */
const ProductSchema = new Schema<IMarketplaceProduct>({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: MAX_NAME_LENGTH,
    index: true
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: MAX_DESCRIPTION_LENGTH
  },
  category: {
    type: String,
    required: true,
    enum: Object.values(ProductCategory),
    index: true
  },
  price: {
    type: Number,
    required: true,
    min: MIN_PRICE,
    max: MAX_PRICE,
    validate: {
      validator: (value: number) => value >= 0 && Number.isFinite(value),
      message: 'Invalid price value'
    }
  },
  providerId: {
    type: String,
    required: true,
    index: true,
    ref: 'Provider'
  },
  images: {
    type: [String],
    validate: [
      {
        validator: (array: string[]) => array.length <= MAX_IMAGES,
        message: `Cannot exceed ${MAX_IMAGES} images`
      },
      {
        validator: (array: string[]) => array.every(url => /^https:\/\//.test(url)),
        message: 'All images must use HTTPS URLs'
      }
    ]
  },
  details: {
    duration: Number,
    format: String,
    prerequisites: [String],
    medicalInfo: {
      type: String,
      encrypted: true // Field-level encryption for sensitive medical information
    },
    certifications: [String],
    availability: {
      startDate: {
        type: Date,
        required: true
      },
      endDate: Date,
      slots: {
        type: Number,
        min: 0
      }
    },
    compliance: {
      hipaaCompliant: {
        type: Boolean,
        required: true,
        default: true
      },
      certifications: [String],
      dataProtectionLevel: {
        type: String,
        enum: ['HIGH', 'MEDIUM', 'LOW'],
        required: true,
        default: 'HIGH'
      }
    }
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'PENDING_REVIEW'],
    default: 'PENDING_REVIEW',
    index: true
  },
  metadata: {
    type: Map,
    of: Schema.Types.Mixed
  },
  searchScore: {
    type: Number,
    select: false
  },
  audit: {
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    createdBy: {
      type: String,
      required: true,
      immutable: true
    },
    updatedBy: {
      type: String,
      required: true
    },
    version: {
      type: Number,
      default: 1
    }
  }
}, {
  timestamps: true,
  collection: 'marketplace_products',
  strict: true,
  validateBeforeSave: true,
  optimisticConcurrency: true
});

// Indexes for efficient querying and searching
ProductSchema.index({ name: 'text', description: 'text' });
ProductSchema.index({ category: 1, status: 1 });
ProductSchema.index({ providerId: 1, status: 1 });
ProductSchema.index({ 'details.availability.startDate': 1 });
ProductSchema.index({ createdAt: 1 });

// Pre-save middleware for validation and sanitization
ProductSchema.pre('save', async function(next) {
  // Increment version number
  if (this.isModified()) {
    this.audit.version += 1;
    this.audit.updatedAt = new Date();
  }

  // Sanitize text fields
  this.name = this.name.trim();
  this.description = this.description.trim();

  // Validate HIPAA compliance
  if (!this.details.compliance.hipaaCompliant) {
    throw new Error('Product must be HIPAA compliant');
  }

  next();
});

// Virtual for full product URL
ProductSchema.virtual('productUrl').get(function() {
  return `/marketplace/products/${this._id}`;
});

// Method to check product availability
ProductSchema.methods.isAvailable = function(): boolean {
  const now = new Date();
  const availability = this.details.availability;
  
  return this.status === 'ACTIVE' &&
         now >= availability.startDate &&
         (!availability.endDate || now <= availability.endDate) &&
         (!availability.slots || availability.slots > 0);
};

// Static method to find active products by category
ProductSchema.statics.findActiveByCategory = function(category: ProductCategory) {
  return this.find({
    category,
    status: 'ACTIVE',
    'details.availability.startDate': { $lte: new Date() },
    $or: [
      { 'details.availability.endDate': { $gt: new Date() } },
      { 'details.availability.endDate': null }
    ]
  });
};

export const MarketplaceProduct = model<IMarketplaceProduct>('MarketplaceProduct', ProductSchema);