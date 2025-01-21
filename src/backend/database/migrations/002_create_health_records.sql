-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "ltree";

-- Create comprehensive enums for health record types and statuses
CREATE TYPE health_record_type AS ENUM (
    'CONSULTATION', 'LAB_RESULT', 'PRESCRIPTION', 'IMAGING', 
    'VITAL_SIGNS', 'IMMUNIZATION', 'ALLERGY', 'CONDITION', 
    'PROCEDURE', 'DIAGNOSTIC_REPORT', 'CARE_PLAN', 'OBSERVATION'
);

CREATE TYPE health_record_status AS ENUM (
    'ACTIVE', 'INACTIVE', 'PENDING', 'ARCHIVED', 
    'DEPRECATED', 'DRAFT', 'ENTERED_IN_ERROR'
);

CREATE TYPE data_sensitivity AS ENUM (
    'NORMAL', 'RESTRICTED', 'VERY_RESTRICTED', 'PHI'
);

CREATE TYPE encryption_status AS ENUM (
    'UNENCRYPTED', 'ENCRYPTED', 'PENDING', 'FAILED'
);

-- Create health records table with FHIR R4 compliance and HIPAA security
CREATE TABLE health_records (
    -- Primary identifiers
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES users(id),
    provider_id UUID NOT NULL REFERENCES users(id),
    facility_id UUID NOT NULL,
    department_id UUID NOT NULL,

    -- Record classification
    record_type health_record_type NOT NULL,
    status health_record_status NOT NULL DEFAULT 'DRAFT',
    sensitivity data_sensitivity NOT NULL DEFAULT 'PHI',
    
    -- FHIR R4 content with encryption
    fhir_content JSONB NOT NULL CHECK (jsonb_typeof(fhir_content) = 'object'),
    encrypted_content BYTEA,
    encryption_metadata JSONB,
    
    -- Versioning and timestamps
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID NOT NULL REFERENCES users(id),
    
    -- Security and compliance
    security_labels TEXT[] NOT NULL DEFAULT '{}',
    access_restrictions TEXT[] NOT NULL DEFAULT '{}',
    retention_policy TEXT NOT NULL DEFAULT '20 years',
    
    -- Attachments and documents
    attachments JSONB DEFAULT '[]',
    attachment_metadata JSONB,
    
    -- Audit and compliance tracking
    access_history JSONB DEFAULT '[]',
    compliance_flags JSONB DEFAULT '{}',
    audit_trail JSONB DEFAULT '[]',

    -- Validation and constraints
    CONSTRAINT valid_fhir_content CHECK (
        (fhir_content ? 'resourceType') AND 
        (fhir_content ? 'id') AND 
        (fhir_content ? 'meta')
    ),
    CONSTRAINT valid_security_labels CHECK (
        array_length(security_labels, 1) > 0
    ),
    CONSTRAINT valid_attachments CHECK (
        jsonb_typeof(attachments) = 'array'
    )
);

-- Create required indexes for performance and security
CREATE INDEX idx_health_records_patient ON health_records(patient_id);
CREATE INDEX idx_health_records_provider ON health_records(provider_id);
CREATE INDEX idx_health_records_type ON health_records(record_type);
CREATE INDEX idx_health_records_status ON health_records(status);
CREATE INDEX idx_health_records_created ON health_records(created_at DESC);
CREATE INDEX idx_health_records_security ON health_records USING GIN (security_labels);
CREATE INDEX idx_health_records_fhir_content ON health_records USING GIN (fhir_content jsonb_path_ops);

-- Create partial indexes for common queries
CREATE INDEX idx_health_records_active ON health_records(patient_id) 
WHERE status = 'ACTIVE';

CREATE INDEX idx_health_records_phi ON health_records(patient_id) 
WHERE sensitivity = 'PHI';

-- Create triggers for automated timestamp management
CREATE OR REPLACE FUNCTION update_health_record_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER health_record_timestamp
    BEFORE UPDATE ON health_records
    FOR EACH ROW
    EXECUTE FUNCTION update_health_record_timestamp();

-- Create trigger for audit trail management
CREATE OR REPLACE FUNCTION log_health_record_changes()
RETURNS TRIGGER AS $$
BEGIN
    NEW.audit_trail = NEW.audit_trail || jsonb_build_object(
        'timestamp', CURRENT_TIMESTAMP,
        'action', TG_OP,
        'user_id', NEW.updated_by,
        'changes', jsonb_build_object(
            'before', row_to_json(OLD),
            'after', row_to_json(NEW)
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER health_record_audit
    BEFORE UPDATE ON health_records
    FOR EACH ROW
    EXECUTE FUNCTION log_health_record_changes();

-- Create function for encryption key rotation
CREATE OR REPLACE FUNCTION rotate_health_record_encryption(
    record_id UUID,
    new_key_id TEXT,
    new_encryption_algorithm TEXT
)
RETURNS VOID AS $$
BEGIN
    UPDATE health_records
    SET encryption_metadata = jsonb_build_object(
        'key_id', new_key_id,
        'algorithm', new_encryption_algorithm,
        'rotated_at', CURRENT_TIMESTAMP,
        'rotated_by', current_user
    )
    WHERE id = record_id;
END;
$$ LANGUAGE plpgsql;

-- Add table comments for documentation
COMMENT ON TABLE health_records IS 'FHIR R4 compliant health records with HIPAA security features';
COMMENT ON COLUMN health_records.fhir_content IS 'FHIR R4 resource content in JSONB format';
COMMENT ON COLUMN health_records.encrypted_content IS 'AES-256 encrypted sensitive health data';
COMMENT ON COLUMN health_records.security_labels IS 'HIPAA-mandated security classification labels';
COMMENT ON COLUMN health_records.retention_policy IS 'Data retention period as per compliance requirements';