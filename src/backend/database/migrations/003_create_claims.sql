-- Migration script for creating claims table with enhanced security and compliance features
-- Version: 1.0.0
-- Dependencies:
--   - PostgreSQL >= 15.0
--   - uuid-ossp extension
--   - pgcrypto extension

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create enum types for claim status tracking
CREATE TYPE claim_status AS ENUM (
    'SUBMITTED',
    'PROCESSING',
    'PENDING_REVIEW',
    'APPROVED',
    'REJECTED',
    'APPEALED',
    'CANCELLED',
    'COMPLETED'
);

-- Create enum for security classification
CREATE TYPE security_classification AS ENUM (
    'RESTRICTED',
    'CONFIDENTIAL',
    'HIGHLY_CONFIDENTIAL',
    'PHI'
);

-- Create function for generating secure claim numbers
CREATE OR REPLACE FUNCTION generate_claim_number()
RETURNS varchar AS $$
DECLARE
    random_component varchar;
    timestamp_component varchar;
    sequence_number integer;
BEGIN
    -- Generate cryptographically secure random component
    random_component := encode(gen_random_bytes(4), 'hex');
    
    -- Get timestamp component with millisecond precision
    timestamp_component := to_char(current_timestamp, 'YYYYMMDD-HH24MISS-US');
    
    -- Get sequence number from sequence
    sequence_number := nextval('claim_number_seq');
    
    -- Return formatted claim number
    RETURN 'CLM-' || timestamp_component || '-' || random_component || '-' || sequence_number::varchar;
END;
$$ LANGUAGE plpgsql VOLATILE LEAKPROOF;

-- Create sequence for claim numbers
CREATE SEQUENCE claim_number_seq
    START WITH 1000
    INCREMENT BY 1
    NO MAXVALUE
    NO CYCLE;

-- Create claims table with enhanced security features
CREATE TABLE claims (
    -- Primary identifiers
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_number VARCHAR(50) UNIQUE NOT NULL DEFAULT generate_claim_number(),
    
    -- Security and classification
    security_classification security_classification NOT NULL DEFAULT 'RESTRICTED',
    encryption_key_id UUID NOT NULL,
    
    -- Relationships
    patient_id UUID NOT NULL REFERENCES users(id),
    provider_id UUID NOT NULL REFERENCES users(id),
    health_record_id UUID REFERENCES health_records(id),
    
    -- Claim details
    service_date TIMESTAMP WITH TIME ZONE NOT NULL,
    submission_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status claim_status NOT NULL DEFAULT 'SUBMITTED',
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    
    -- Encrypted sensitive data
    encrypted_description BYTEA NOT NULL,
    diagnosis_codes JSONB NOT NULL CHECK (jsonb_typeof(diagnosis_codes) = 'array'),
    procedure_codes JSONB NOT NULL CHECK (jsonb_typeof(procedure_codes) = 'array'),
    
    -- Supporting documents
    attachments JSONB DEFAULT '[]' CHECK (jsonb_typeof(attachments) = 'array'),
    document_references JSONB DEFAULT '[]',
    
    -- Processing metadata
    processing_history JSONB DEFAULT '[]',
    review_notes BYTEA,
    decision_reason TEXT,
    
    -- Audit and compliance
    audit_trail JSONB NOT NULL DEFAULT '{}',
    compliance_flags JSONB DEFAULT '[]',
    access_history JSONB DEFAULT '[]',
    
    -- Timestamps and versioning
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL REFERENCES users(id),
    updated_by UUID NOT NULL REFERENCES users(id),
    
    -- Validation constraints
    CONSTRAINT valid_diagnosis_codes CHECK (
        jsonb_array_length(diagnosis_codes) > 0
    ),
    CONSTRAINT valid_procedure_codes CHECK (
        jsonb_array_length(procedure_codes) > 0
    ),
    CONSTRAINT valid_amount CHECK (
        amount > 0 AND amount <= 999999999.99
    )
);

-- Create optimized indexes
CREATE INDEX idx_claims_claim_number ON claims(claim_number);
CREATE INDEX idx_claims_patient_provider ON claims(patient_id, provider_id);
CREATE INDEX idx_claims_status_partial ON claims(status) WHERE status IN ('SUBMITTED', 'PROCESSING');
CREATE INDEX idx_claims_service_date ON claims USING BRIN (service_date);
CREATE INDEX idx_claims_submission_date ON claims(submission_date DESC);
CREATE INDEX idx_claims_amount ON claims(amount) WHERE status != 'CANCELLED';
CREATE INDEX idx_claims_security ON claims(security_classification);

-- Create GiST index for faster JSON searches
CREATE INDEX idx_claims_diagnosis ON claims USING GIN (diagnosis_codes jsonb_path_ops);
CREATE INDEX idx_claims_procedures ON claims USING GIN (procedure_codes jsonb_path_ops);

-- Create trigger for updating timestamps
CREATE OR REPLACE FUNCTION update_claims_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_claims_timestamp
    BEFORE UPDATE ON claims
    FOR EACH ROW
    EXECUTE FUNCTION update_claims_timestamp();

-- Create trigger for audit trail
CREATE OR REPLACE FUNCTION update_claims_audit_trail()
RETURNS TRIGGER AS $$
BEGIN
    NEW.audit_trail = NEW.audit_trail || jsonb_build_object(
        'timestamp', CURRENT_TIMESTAMP,
        'user_id', NEW.updated_by,
        'action', TG_OP,
        'old_values', row_to_json(OLD),
        'new_values', row_to_json(NEW),
        'ip_address', current_setting('app.client_ip', TRUE),
        'user_agent', current_setting('app.user_agent', TRUE)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER claims_audit_trail
    BEFORE UPDATE ON claims
    FOR EACH ROW
    EXECUTE FUNCTION update_claims_audit_trail();

-- Create trigger for security classification enforcement
CREATE OR REPLACE FUNCTION enforce_claims_security()
RETURNS TRIGGER AS $$
BEGIN
    -- Ensure security classification cannot be downgraded
    IF TG_OP = 'UPDATE' AND 
       OLD.security_classification > NEW.security_classification THEN
        RAISE EXCEPTION 'Security classification cannot be downgraded';
    END IF;
    
    -- Enforce encryption for sensitive data
    IF NEW.security_classification IN ('HIGHLY_CONFIDENTIAL', 'PHI') AND 
       NEW.encryption_key_id IS NULL THEN
        RAISE EXCEPTION 'Encryption required for highly confidential data';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_claims_security
    BEFORE INSERT OR UPDATE ON claims
    FOR EACH ROW
    EXECUTE FUNCTION enforce_claims_security();

-- Add row level security policies
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;

-- Policy for patients to view only their claims
CREATE POLICY patient_claims_policy ON claims
    FOR ALL
    TO PUBLIC
    USING (patient_id = current_user_id());

-- Policy for providers to view their submitted claims
CREATE POLICY provider_claims_policy ON claims
    FOR ALL
    TO PUBLIC
    USING (provider_id = current_user_id());

-- Policy for insurance administrators
CREATE POLICY admin_claims_policy ON claims
    FOR ALL
    TO insurance_admin
    USING (TRUE);

-- Add table comments
COMMENT ON TABLE claims IS 'HIPAA-compliant insurance claims with enhanced security features';
COMMENT ON COLUMN claims.encrypted_description IS 'AES-256-GCM encrypted claim description';
COMMENT ON COLUMN claims.security_classification IS 'Security level classification for access control';
COMMENT ON COLUMN claims.audit_trail IS 'Comprehensive audit history for compliance tracking';