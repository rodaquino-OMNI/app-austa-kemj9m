-- Migration script for creating marketplace tables with enhanced security features
-- Version: 1.0.0
-- Dependencies:
--   - PostgreSQL >= 15.0
--   - uuid-ossp extension
--   - pgcrypto extension
--   - users table (001_create_users.sql)

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create enum types for marketplace entities
CREATE TYPE product_category AS ENUM (
    'DIGITAL_THERAPY',
    'WELLNESS_PROGRAM',
    'PROVIDER_SERVICE',
    'MENTAL_HEALTH',
    'CHRONIC_CARE'
);

CREATE TYPE product_status AS ENUM (
    'DRAFT',
    'PENDING_REVIEW',
    'ACTIVE',
    'INACTIVE',
    'ARCHIVED',
    'SUSPENDED'
);

CREATE TYPE pricing_model AS ENUM (
    'ONE_TIME',
    'SUBSCRIPTION',
    'PAY_PER_USE',
    'INSURANCE_COVERED'
);

-- Create products table with enhanced security features
CREATE TABLE marketplace_products (
    -- Primary Identifiers
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category product_category NOT NULL,
    status product_status NOT NULL DEFAULT 'DRAFT',
    
    -- Security and Compliance
    security_label TEXT NOT NULL DEFAULT 'CONFIDENTIAL',
    encryption_key_id UUID NOT NULL,
    hipaa_compliant BOOLEAN NOT NULL DEFAULT false,
    data_classification TEXT NOT NULL DEFAULT 'SENSITIVE',
    
    -- Product Details
    provider_id UUID NOT NULL REFERENCES users(id),
    pricing_model pricing_model NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    duration_days INTEGER,
    max_participants INTEGER,
    
    -- Content and Resources
    content_url TEXT,
    thumbnail_url TEXT,
    resources JSONB,
    
    -- Metadata
    tags TEXT[],
    search_vector tsvector,
    
    -- Audit Trail
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL REFERENCES users(id),
    updated_by UUID NOT NULL REFERENCES users(id),
    last_accessed_at TIMESTAMP WITH TIME ZONE,
    version INTEGER NOT NULL DEFAULT 1,
    
    -- Validation and constraints
    CONSTRAINT valid_price CHECK (price >= 0),
    CONSTRAINT valid_duration CHECK (duration_days > 0),
    CONSTRAINT valid_participants CHECK (max_participants > 0)
);

-- Create reviews table for product feedback
CREATE TABLE marketplace_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES marketplace_products(id),
    reviewer_id UUID NOT NULL REFERENCES users(id),
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review_text TEXT,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    
    -- Audit Trail
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_product_reviewer UNIQUE (product_id, reviewer_id)
);

-- Create subscriptions table for tracking product enrollments
CREATE TABLE marketplace_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES marketplace_products(id),
    user_id UUID NOT NULL REFERENCES users(id),
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    start_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP WITH TIME ZONE,
    payment_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    
    -- Audit Trail
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL REFERENCES users(id),
    updated_by UUID NOT NULL REFERENCES users(id),
    
    CONSTRAINT valid_subscription_dates CHECK (end_date > start_date)
);

-- Create audit log table for marketplace activities
CREATE TABLE marketplace_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    actor_id UUID NOT NULL REFERENCES users(id),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    details JSONB,
    ip_address INET,
    user_agent TEXT
);

-- Create indexes for performance optimization
CREATE INDEX idx_products_category ON marketplace_products(category);
CREATE INDEX idx_products_status ON marketplace_products(status);
CREATE INDEX idx_products_provider ON marketplace_products(provider_id);
CREATE INDEX idx_products_search ON marketplace_products USING gin(search_vector);
CREATE INDEX idx_products_created ON marketplace_products(created_at);
CREATE INDEX idx_subscriptions_user ON marketplace_subscriptions(user_id);
CREATE INDEX idx_subscriptions_product ON marketplace_subscriptions(product_id);
CREATE INDEX idx_reviews_product ON marketplace_reviews(product_id);

-- Create function to update search vector
CREATE OR REPLACE FUNCTION update_product_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for search vector updates
CREATE TRIGGER update_product_search
    BEFORE INSERT OR UPDATE ON marketplace_products
    FOR EACH ROW
    EXECUTE FUNCTION update_product_search_vector();

-- Create function for audit logging
CREATE OR REPLACE FUNCTION log_marketplace_audit()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO marketplace_audit_log (
        entity_type,
        entity_id,
        action,
        actor_id,
        details
    ) VALUES (
        TG_TABLE_NAME,
        NEW.id,
        TG_OP,
        COALESCE(NEW.updated_by, NEW.created_by),
        jsonb_build_object(
            'old_value', to_jsonb(OLD),
            'new_value', to_jsonb(NEW)
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for audit logging
CREATE TRIGGER audit_marketplace_products
    AFTER INSERT OR UPDATE OR DELETE ON marketplace_products
    FOR EACH ROW
    EXECUTE FUNCTION log_marketplace_audit();

CREATE TRIGGER audit_marketplace_subscriptions
    AFTER INSERT OR UPDATE OR DELETE ON marketplace_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION log_marketplace_audit();

-- Add row level security policies
ALTER TABLE marketplace_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_subscriptions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY product_access_policy ON marketplace_products
    FOR ALL
    TO PUBLIC
    USING (
        status = 'ACTIVE'
        OR provider_id = current_user_id()
        OR EXISTS (
            SELECT 1 FROM users
            WHERE id = current_user_id()
            AND role = 'ADMIN'
        )
    );

CREATE POLICY review_access_policy ON marketplace_reviews
    FOR SELECT
    TO PUBLIC
    USING (true);

CREATE POLICY subscription_access_policy ON marketplace_subscriptions
    FOR ALL
    TO PUBLIC
    USING (
        user_id = current_user_id()
        OR EXISTS (
            SELECT 1 FROM users
            WHERE id = current_user_id()
            AND role IN ('ADMIN', 'PROVIDER')
        )
    );

-- Add comments for documentation
COMMENT ON TABLE marketplace_products IS 'Stores digital therapeutic programs and wellness resources with enhanced security';
COMMENT ON TABLE marketplace_reviews IS 'Product reviews and ratings with verification status';
COMMENT ON TABLE marketplace_subscriptions IS 'User subscriptions and enrollments in marketplace products';
COMMENT ON TABLE marketplace_audit_log IS 'Audit trail for all marketplace activities';