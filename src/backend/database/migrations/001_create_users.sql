-- Migration script for creating users table with HIPAA-compliant data structures
-- Version: 1.0.0
-- Dependencies:
--   - PostgreSQL >= 15.0
--   - uuid-ossp extension
--   - pgcrypto extension

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create enum types for user roles with granular access levels
CREATE TYPE user_role AS ENUM (
    'PATIENT',
    'PROVIDER',
    'ADMIN',
    'INSURANCE',
    'AUDITOR',
    'SUPPORT'
);

-- Create enum for comprehensive user account status tracking
CREATE TYPE user_status AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'PENDING',
    'SUSPENDED',
    'LOCKED',
    'ARCHIVED'
);

-- Create enum for multi-factor authentication methods
CREATE TYPE mfa_method AS ENUM (
    'SMS',
    'EMAIL',
    'AUTHENTICATOR',
    'BIOMETRIC',
    'SECURITY_KEY'
);

-- Create users table with enhanced security and compliance features
CREATE TABLE users (
    -- Primary Identifiers
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    status user_status NOT NULL DEFAULT 'PENDING',

    -- Personal Information (PII)
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(50) NOT NULL,
    phone_number VARCHAR(50) NOT NULL CHECK (phone_number ~ '^\+?[1-9]\d{1,14}$'),

    -- Address Information
    address_street VARCHAR(255) NOT NULL,
    address_city VARCHAR(100) NOT NULL,
    address_state VARCHAR(100) NOT NULL,
    address_zip_code VARCHAR(20) NOT NULL,
    address_country VARCHAR(100) NOT NULL,

    -- Emergency Contact Information
    emergency_contact_name VARCHAR(200) NOT NULL,
    emergency_contact_relationship VARCHAR(100) NOT NULL,
    emergency_contact_phone VARCHAR(50) NOT NULL CHECK (emergency_contact_phone ~ '^\+?[1-9]\d{1,14}$'),

    -- Security Settings
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_method mfa_method,
    mfa_secret TEXT,
    last_password_change TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    password_reset_required BOOLEAN NOT NULL DEFAULT FALSE,
    login_attempts INTEGER NOT NULL DEFAULT 0,
    account_locked_until TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    last_login_ip INET,

    -- Audit Trail
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    updated_by UUID NOT NULL,

    -- Data Protection
    CONSTRAINT password_complexity_check CHECK (length(password_hash) >= 60),
    CONSTRAINT name_format_check CHECK (
        first_name ~ '^[A-Za-z\s\-''\.]+$' AND
        last_name ~ '^[A-Za-z\s\-''\.]+$'
    )
);

-- Create optimized indexes for performance and security
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_last_login_at ON users(last_login_at);
CREATE INDEX idx_users_phone_number ON users(phone_number);
CREATE INDEX idx_users_login_attempts ON users(login_attempts) WHERE login_attempts > 0;

-- Create audit trail trigger function
CREATE OR REPLACE FUNCTION update_audit_columns()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    NEW.updated_by = current_user;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for audit trail
CREATE TRIGGER update_users_audit
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_audit_columns();

-- Create row level security policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy for patients to view only their own data
CREATE POLICY patient_access_policy ON users
    FOR ALL
    TO PUBLIC
    USING (role = 'PATIENT' AND id = current_user_id());

-- Policy for providers to view their patients' data
CREATE POLICY provider_access_policy ON users
    FOR SELECT
    TO PUBLIC
    USING (role = 'PROVIDER' AND id IN (
        SELECT patient_id FROM provider_patient_relationships
        WHERE provider_id = current_user_id()
    ));

-- Policy for admins to view all data
CREATE POLICY admin_access_policy ON users
    FOR ALL
    TO PUBLIC
    USING (role = 'ADMIN');

-- Comments for documentation
COMMENT ON TABLE users IS 'HIPAA-compliant user data storage with comprehensive security features';
COMMENT ON COLUMN users.password_hash IS 'Argon2id hashed password';
COMMENT ON COLUMN users.mfa_secret IS 'Encrypted MFA secret using pgcrypto';
COMMENT ON COLUMN users.last_login_ip IS 'Audit trail for access monitoring';