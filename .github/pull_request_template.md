# Pull Request Description
## Title
<!-- Provide a clear title following conventional commit format (e.g., feat: add biometric auth to iOS app) -->

## Description
<!-- Provide a detailed description of the changes -->

## Related Issues
<!-- Link related issues/tickets -->
- Issue #
- Security Requirement #
- Compliance Requirement #

## Compliance Impact
<!-- Describe impact on HIPAA/LGPD compliance -->
- HIPAA Impact:
- LGPD Impact:
- Other Regulatory Impact:

# Change Type
## Type of Change
<!-- Check all that apply -->
- [ ] Feature Implementation
- [ ] Bug Fix
- [ ] Performance Improvement 
- [ ] Code Refactoring
- [ ] Documentation Update
- [ ] Security Fix
- [ ] Dependencies Update
- [ ] Compliance Update

## Affected Components
<!-- Check all that apply -->
- [ ] iOS App
- [ ] Android App
- [ ] Web App
- [ ] Backend Services
- [ ] Infrastructure
- [ ] Documentation
- [ ] Security Components
- [ ] Data Storage
- [ ] API Gateway
- [ ] Authentication Services

# Implementation Details
## Technical Changes
<!-- List technical implementation details with security considerations -->
1. 
2.
3.

## Test Coverage
<!-- List added/modified test cases including security tests -->
1. Unit Tests:
2. Integration Tests:
3. Security Tests:

## Database Changes
<!-- List any database schema or data changes with privacy impact -->
1. Schema Changes:
2. Data Migration:
3. Privacy Impact:

## Security Impact Analysis
<!-- Provide security impact analysis -->
- Attack Surface Changes:
- Security Controls Added/Modified:
- Sensitive Data Handling:
- Security Testing Results:

# Review Checklist
## Quality Assurance
<!-- Verify all items -->
- [ ] Code follows style guidelines
- [ ] Documentation is updated
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] No security vulnerabilities introduced
- [ ] Performance impact assessed
- [ ] Error handling implemented
- [ ] Logging implemented
- [ ] Metrics collection added

## Security & Compliance
<!-- Verify all items -->
- [ ] HIPAA compliance maintained
- [ ] LGPD requirements met
- [ ] Sensitive data properly handled
- [ ] Security best practices followed
- [ ] Authentication/Authorization verified
- [ ] Data encryption implemented
- [ ] Audit logging configured
- [ ] Security scanning completed

# Deployment Impact
## Deployment Steps
<!-- List required deployment steps including security measures -->
1.
2.
3.

## Rollback Plan
<!-- Provide detailed rollback procedure -->
```
Steps to rollback:
1.
2.
3.

Data integrity preservation:
1.
2.
```

## Monitoring Requirements
<!-- List metrics and alerts to monitor -->
1. Application Metrics:
2. Infrastructure Metrics:
3. Business Metrics:

## Security Monitoring
<!-- Specify security monitoring requirements -->
1. Security Metrics:
2. Compliance Alerts:
3. Audit Requirements:

---
<!-- Do not modify below this line -->
/label ~"status::needs-review" ~"change-type" ~"component" ~"security-impact"