/**
 * @fileoverview Healthcare-optimized form input component with HIPAA compliance
 * Implements Material Design 3.0 principles and WCAG 2.1 Level AA accessibility
 * @version 1.0.0
 */

import React, { useCallback, useState, useRef, useEffect } from 'react';
import classnames from 'classnames'; // v2.3.2
import { Input as StyledInput } from '../../styles/components';
import { validateForm, sanitizeInput } from '../../lib/utils/validation';

interface InputProps {
  // Core props
  id: string;
  name: string;
  label: string;
  value: string;
  type?: 'text' | 'password' | 'email' | 'tel' | 'number';
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  fullWidth?: boolean;
  
  // Healthcare-specific props
  isPHI?: boolean;
  dataType?: 'mrn' | 'ssn' | 'dob' | 'npi' | 'diagnosis' | 'medication';
  clinicalValidation?: {
    type: 'warning' | 'critical' | 'none';
    message?: string;
  };
  fhirProfile?: string;
  
  // Event handlers
  onChange: (value: string, isValid: boolean) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onPHIAccess?: (accessType: 'view' | 'edit') => void;
}

const Input: React.FC<InputProps> = ({
  id,
  name,
  label,
  value,
  type = 'text',
  placeholder,
  error,
  disabled,
  required,
  fullWidth = false,
  isPHI = false,
  dataType,
  clinicalValidation,
  fhirProfile,
  onChange,
  onBlur,
  onPHIAccess
}) => {
  // State management
  const [isFocused, setIsFocused] = useState(false);
  const [internalError, setInternalError] = useState<string | undefined>(error);
  const [isValidating, setIsValidating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const validationTimeoutRef = useRef<NodeJS.Timeout>();

  // Cleanup validation timeout on unmount
  useEffect(() => {
    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, []);

  // Handle PHI access logging
  useEffect(() => {
    if (isPHI && isFocused) {
      onPHIAccess?.('view');
    }
  }, [isPHI, isFocused, onPHIAccess]);

  // Input change handler with debounced validation
  const handleChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    
    // Clear previous validation timeout
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }

    // Sanitize input for security
    const sanitizedValue = sanitizeInput(newValue, {
      stripHtml: true,
      escapeChars: true,
      trimWhitespace: true,
      enableMetrics: isPHI
    });

    // Immediate feedback for obvious issues
    let quickValidation = true;
    if (required && !sanitizedValue) {
      setInternalError('This field is required');
      quickValidation = false;
    }

    // Update value immediately but mark as validating
    setIsValidating(true);
    onChange(sanitizedValue, quickValidation);

    // Debounced full validation
    validationTimeoutRef.current = setTimeout(async () => {
      try {
        const validationResult = await validateForm(
          { [name]: sanitizedValue },
          {
            context: {
              isPHI,
              dataType,
              fhirProfile
            }
          }
        );

        setInternalError(validationResult.errors[0]);
        setIsValidating(false);
        onChange(sanitizedValue, validationResult.isValid);

      } catch (error) {
        setInternalError('Validation error occurred');
        setIsValidating(false);
        onChange(sanitizedValue, false);
      }
    }, 300);
  }, [name, required, isPHI, dataType, fhirProfile, onChange]);

  // Focus event handlers
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    if (isPHI) {
      onPHIAccess?.('edit');
    }
  }, [isPHI, onPHIAccess]);

  const handleBlur = useCallback((event: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    onBlur?.(event);
  }, [onBlur]);

  // Compute input classes
  const inputClasses = classnames({
    'input--full-width': fullWidth,
    'input--error': !!internalError,
    'input--disabled': disabled,
    'input--phi': isPHI,
    'input--validating': isValidating,
    [`input--clinical-${clinicalValidation?.type}`]: clinicalValidation?.type
  });

  // Compute ARIA attributes
  const ariaAttributes = {
    'aria-invalid': !!internalError,
    'aria-required': required,
    'aria-describedby': internalError ? `${id}-error` : undefined,
    'aria-busy': isValidating,
    'role': 'textbox',
    'aria-label': label
  };

  return (
    <div className="input-container">
      <label 
        htmlFor={id}
        className="input__label"
      >
        {label}
        {required && <span className="input__required-indicator">*</span>}
        {isPHI && <span className="input__phi-indicator">PHI</span>}
      </label>

      <StyledInput
        ref={inputRef}
        id={id}
        name={name}
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        className={inputClasses}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        error={!!internalError}
        fullWidth={fullWidth}
        clinicalValidation={clinicalValidation?.type}
        secureContent={isPHI}
        {...ariaAttributes}
      />

      {internalError && (
        <div 
          id={`${id}-error`}
          className="input__error-message"
          role="alert"
        >
          {internalError}
        </div>
      )}

      {clinicalValidation?.message && (
        <div 
          className={`input__clinical-message input__clinical-message--${clinicalValidation.type}`}
          role="status"
        >
          {clinicalValidation.message}
        </div>
      )}
    </div>
  );
};

export default Input;