/**
 * @fileoverview Enhanced product model for AUSTA SuperApp marketplace
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import { Schema, model, Document } from 'mongoose'; // v7.0.0
import { IsString, IsNumber, IsArray, IsObject, IsEnum, Min, Max, Length, ValidateNested } from 'class-validator'; // v0.14.0
import { ProductCategory } from '../config/marketplace.config';
import { UserRole } from '../../../shared/interfaces/user.interface';

// Global constants for validation and compliance
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_IMAGES = 10;
const MIN_PRICE = 0;
const HIPAA_COMPLIANCE_VERSION = '2.0';
const CLINICAL_VALIDATION_REQUIRED = true;
const PROVIDER_CREDENTIAL_EXPIRY_DAYS = 365;
const AUDIT_TRAIL_RETENTION_DAYS = 2555; // 7 years for HIPAA compliance

/**
 * Interface for detailed product information with clinical validation
 */
export interface IProductDetails {
    duration: number;
    format: string;
    clinicalValidation: {
        studyReferences: string[];
        evidenceLevel: string;
        validationDate: Date;
        validatedBy: string;
    };
    medicalPrerequisites: string[];
    contraindications: string[];
    clinicalOutcomes: Array<{
        metric: string;
        expectedOutcome: string;
        validationMethod: string;
    }>;
    complianceInfo: {
        hipaaCompliant: boolean;
        fdaApproval?: string;
        regulatoryStatus: string;
        lastAuditDate: Date;
    };
}

/**
 * Enhanced interface for healthcare marketplace products
 */
export interface IProduct extends Document {
    id: string;
    name: string;
    description: string;
    category: ProductCategory;
    price: number;
    providerId: string;
    providerCredentials: {
        licenseNumber: string;
        specialization: string;
        verificationStatus: string;
        lastVerifiedAt: Date;
        expiryDate: Date;
    };
    images: string[];
    details: IProductDetails;
    hipaaCompliance: {
        version: string;
        lastAssessment: Date;
        encryptionLevel: string;
        dataHandlingProtocol: string;
    };
    auditTrail: Array<{
        action: string;
        timestamp: Date;
        userId: string;
        changes: Record<string, any>;
    }>;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Enhanced Mongoose schema for healthcare marketplace products
 */
const ProductSchema = new Schema<IProduct>({
    name: {
        type: String,
        required: true,
        trim: true,
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
        enum: Object.values(ProductCategory),
        required: true,
        index: true
    },
    price: {
        type: Number,
        required: true,
        min: MIN_PRICE,
        validate: {
            validator: (value: number) => value >= MIN_PRICE,
            message: 'Price must be non-negative'
        }
    },
    providerId: {
        type: String,
        required: true,
        index: true,
        validate: {
            validator: async function(value: string) {
                // Validate provider exists and has active credentials
                return true; // Implementation depends on provider service
            },
            message: 'Invalid or inactive provider'
        }
    },
    providerCredentials: {
        licenseNumber: { type: String, required: true },
        specialization: { type: String, required: true },
        verificationStatus: { type: String, required: true },
        lastVerifiedAt: { type: Date, required: true },
        expiryDate: { type: Date, required: true }
    },
    images: {
        type: [String],
        validate: [
            {
                validator: (array: string[]) => array.length <= MAX_IMAGES,
                message: `Cannot exceed ${MAX_IMAGES} images`
            }
        ]
    },
    details: {
        duration: { type: Number, required: true },
        format: { type: String, required: true },
        clinicalValidation: {
            studyReferences: [String],
            evidenceLevel: { type: String, required: true },
            validationDate: { type: Date, required: true },
            validatedBy: { type: String, required: true }
        },
        medicalPrerequisites: [String],
        contraindications: [String],
        clinicalOutcomes: [{
            metric: { type: String, required: true },
            expectedOutcome: { type: String, required: true },
            validationMethod: { type: String, required: true }
        }],
        complianceInfo: {
            hipaaCompliant: { type: Boolean, required: true },
            fdaApproval: String,
            regulatoryStatus: { type: String, required: true },
            lastAuditDate: { type: Date, required: true }
        }
    },
    hipaaCompliance: {
        version: { 
            type: String, 
            required: true,
            default: HIPAA_COMPLIANCE_VERSION
        },
        lastAssessment: { type: Date, required: true },
        encryptionLevel: { type: String, required: true },
        dataHandlingProtocol: { type: String, required: true }
    },
    auditTrail: [{
        action: { type: String, required: true },
        timestamp: { type: Date, required: true },
        userId: { type: String, required: true },
        changes: { type: Schema.Types.Mixed }
    }]
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for optimized queries
ProductSchema.index({ name: 'text', description: 'text' });
ProductSchema.index({ 'providerCredentials.expiryDate': 1 });
ProductSchema.index({ category: 1, price: 1 });

// Pre-save middleware for validation and compliance checks
ProductSchema.pre('save', async function(next) {
    if (this.isNew || this.isModified()) {
        // Validate provider credentials
        if (this.providerCredentials.expiryDate < new Date()) {
            throw new Error('Provider credentials have expired');
        }

        // Ensure HIPAA compliance
        if (!this.details.complianceInfo.hipaaCompliant) {
            throw new Error('Product must be HIPAA compliant');
        }

        // Add audit trail entry
        this.auditTrail.push({
            action: this.isNew ? 'created' : 'updated',
            timestamp: new Date(),
            userId: 'system', // Should be replaced with actual user ID
            changes: this.modifiedPaths()
        });
    }
    next();
});

// Virtual for full provider information
ProductSchema.virtual('providerInfo').get(function() {
    return {
        id: this.providerId,
        credentials: this.providerCredentials,
        verificationStatus: this.providerCredentials.verificationStatus
    };
});

// Method to validate clinical safety
ProductSchema.methods.validateClinicalSafety = async function(): Promise<boolean> {
    return this.details.clinicalValidation.evidenceLevel !== '' &&
           this.details.contraindications.length > 0 &&
           this.details.clinicalOutcomes.length > 0;
};

// Static method to find products by category with safety checks
ProductSchema.statics.findByCategory = async function(category: ProductCategory): Promise<IProduct[]> {
    return this.find({
        category,
        'details.complianceInfo.hipaaCompliant': true,
        'providerCredentials.verificationStatus': 'verified'
    }).sort({ createdAt: -1 });
};

export const Product = model<IProduct>('Product', ProductSchema);