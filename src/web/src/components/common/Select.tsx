import React, { useCallback, useMemo, useState } from 'react'; // ^18.0.0
import styled from '@emotion/styled'; // ^11.11.0
import { css } from '@emotion/react'; // ^11.11.0
import { theme } from '../../styles/theme';
import { COMPONENT_SIZES, CLINICAL_STATES } from '../../styles/components';

// Interfaces
interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  clinicalCode?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  requiresVerification?: boolean;
}

interface ValidationResult {
  isValid: boolean;
  message?: string;
  severity: 'none' | 'warning' | 'critical';
}

interface SelectProps {
  name: string;
  id: string;
  value: string | string[];
  options: SelectOption[];
  onChange: (value: string | string[], validationResult: ValidationResult) => void;
  multiple?: boolean;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  fullWidth?: boolean;
  size?: 'small' | 'medium' | 'large';
  clinicalMode?: 'standard' | 'critical' | 'monitoring';
  validationLevel?: 'none' | 'warning' | 'critical';
  secureContent?: boolean;
  medicalDataType?: 'diagnosis' | 'medication' | 'procedure' | 'general';
}

// Styled Components
const StyledSelectContainer = styled.div<{
  fullWidth?: boolean;
  clinicalMode?: string;
  validationLevel?: string;
}>`
  position: relative;
  width: ${props => props.fullWidth ? '100%' : 'auto'};
  font-family: ${theme.typography.fontFamily};
  
  ${props => props.clinicalMode === 'critical' && css`
    &::before {
      content: '';
      position: absolute;
      left: -4px;
      top: 0;
      height: 100%;
      width: 4px;
      background-color: ${theme.palette.error.main};
    }
  `}
`;

const StyledSelect = styled.select<{
  size?: string;
  error?: boolean;
  clinicalMode?: string;
  validationLevel?: string;
  secureContent?: boolean;
}>`
  width: 100%;
  padding: ${props => COMPONENT_SIZES[props.size || 'medium'].padding};
  height: ${props => COMPONENT_SIZES[props.size || 'medium'].height};
  font-size: ${props => COMPONENT_SIZES[props.size || 'medium'].fontSize};
  color: ${theme.palette.text.primary};
  background-color: ${theme.palette.background.paper};
  border: 1px solid ${props => 
    props.error ? theme.palette.error.main : 
    props.validationLevel === 'warning' ? theme.palette.warning.main :
    props.validationLevel === 'critical' ? theme.palette.error.main :
    theme.palette.text.disabled
  };
  border-radius: ${theme.shape.borderRadius}px;
  cursor: pointer;
  appearance: none;
  transition: all 0.2s ease-in-out;

  ${props => props.secureContent && css`
    -webkit-text-security: disc;
    font-family: text-security-disc;
  `}

  &:focus {
    outline: none;
    border-color: ${theme.palette.primary.main};
    box-shadow: 0 0 0 ${({ clinicalMode = 'standard' }) => CLINICAL_STATES[clinicalMode].focus} ${theme.palette.primary.light}30;
  }

  &:disabled {
    background-color: ${theme.palette.background.default};
    cursor: not-allowed;
    opacity: 0.7;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const HelperText = styled.span<{ error?: boolean }>`
  display: block;
  margin-top: 4px;
  font-size: ${theme.typography.caption.fontSize};
  color: ${props => props.error ? theme.palette.error.main : theme.palette.text.secondary};
`;

// Validation Functions
const validateMedicalData = (
  value: string | string[],
  medicalDataType?: string,
  options: SelectOption[]
): ValidationResult => {
  if (!medicalDataType) return { isValid: true, severity: 'none' };

  const selectedOptions = Array.isArray(value) 
    ? options.filter(opt => value.includes(opt.value))
    : options.filter(opt => opt.value === value);

  // Validation for high-risk selections
  const hasHighRisk = selectedOptions.some(opt => opt.riskLevel === 'high');
  if (hasHighRisk) {
    return {
      isValid: false,
      message: 'High-risk selection requires additional verification',
      severity: 'critical'
    };
  }

  // Clinical code validation
  const hasMissingClinicalCodes = selectedOptions.some(opt => 
    medicalDataType !== 'general' && !opt.clinicalCode
  );
  if (hasMissingClinicalCodes) {
    return {
      isValid: false,
      message: 'Missing required clinical codes',
      severity: 'warning'
    };
  }

  // Verification requirements
  const needsVerification = selectedOptions.some(opt => opt.requiresVerification);
  if (needsVerification) {
    return {
      isValid: true,
      message: 'Selection requires clinical verification',
      severity: 'warning'
    };
  }

  return { isValid: true, severity: 'none' };
};

// Main Component
export const Select: React.FC<SelectProps> = ({
  name,
  id,
  options,
  value,
  onChange,
  multiple = false,
  disabled = false,
  error = false,
  helperText,
  fullWidth = false,
  size = 'medium',
  clinicalMode = 'standard',
  validationLevel = 'none',
  secureContent = false,
  medicalDataType
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const handleChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = multiple 
      ? Array.from(event.target.selectedOptions, option => option.value)
      : event.target.value;

    const validationResult = validateMedicalData(newValue, medicalDataType, options);
    onChange(newValue, validationResult);
  }, [multiple, medicalDataType, options, onChange]);

  const selectedOptions = useMemo(() => 
    Array.isArray(value) ? value : [value]
  , [value]);

  return (
    <StyledSelectContainer
      fullWidth={fullWidth}
      clinicalMode={clinicalMode}
      validationLevel={validationLevel}
    >
      <StyledSelect
        name={name}
        id={id}
        multiple={multiple}
        disabled={disabled}
        value={value}
        onChange={handleChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        size={size}
        error={error}
        clinicalMode={clinicalMode}
        validationLevel={validationLevel}
        secureContent={secureContent}
        aria-invalid={error}
        aria-describedby={helperText ? `${id}-helper-text` : undefined}
      >
        {options.map(option => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            data-clinical-code={option.clinicalCode}
            data-risk-level={option.riskLevel}
          >
            {option.label}
          </option>
        ))}
      </StyledSelect>
      {helperText && (
        <HelperText
          id={`${id}-helper-text`}
          error={error}
        >
          {helperText}
        </HelperText>
      )}
    </StyledSelectContainer>
  );
};

export type { SelectProps, SelectOption, ValidationResult };
export default Select;