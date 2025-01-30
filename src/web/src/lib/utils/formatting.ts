/**
 * @fileoverview Utility functions for formatting data in AUSTA SuperApp
 * Implements WCAG 2.1 Level AA compliant formatting with i18n support
 * @version 1.0.0
 */

// External imports
import { format, parse, isValid } from 'date-fns'; // v2.30.0
import { enUS, ptBR } from 'date-fns/locale'; // v2.30.0

// Internal imports
import { IHealthRecord, HealthRecordType } from '../types/healthRecord';
import { IClaim, ClaimStatus } from '../types/claim';
import { ErrorCode } from '../constants/errorCodes';

// Locale mapping for date-fns
const LOCALE_MAP: { [key: string]: Locale } = {
  'en-US': enUS,
  'pt-BR': ptBR
};

/**
 * Cache for expensive formatting operations
 */
const formatCache = new Map<string, string>();

/**
 * Formats a date with localization and accessibility support
 * @throws {Error} If date is invalid
 */
export function formatDate(
  date: Date | string,
  formatStr: string = 'PPP',
  locale: string = 'en-US'
): string {
  try {
    const dateObj = typeof date === 'string' ? parse(date, 'yyyy-MM-dd', new Date()) : date;
    
    if (!isValid(dateObj)) {
      throw new Error(ErrorCode.INVALID_INPUT);
    }

    const formattedDate = format(dateObj, formatStr, {
      locale: LOCALE_MAP[locale] || enUS
    });

    // Add ARIA attributes for screen readers
    return `<time datetime="${dateObj.toISOString()}" aria-label="${formattedDate}">${formattedDate}</time>`;
  } catch (error) {
    console.error('Date formatting error:', error);
    return 'Invalid Date';
  }
}

/**
 * Formats currency with proper locale and accessibility support
 * @throws {Error} If amount is invalid
 */
export function formatCurrency(
  amount: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  try {
    const cacheKey = `${amount}-${currency}-${locale}`;
    if (formatCache.has(cacheKey)) {
      return formatCache.get(cacheKey)!;
    }

    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    const formatted = formatter.format(amount);
    const ariaLabel = `${amount} ${currency}`;
    
    const result = `<span aria-label="${ariaLabel}">${formatted}</span>`;
    formatCache.set(cacheKey, result);
    
    return result;
  } catch (error) {
    console.error('Currency formatting error:', error);
    return `${amount} ${currency}`;
  }
}

/**
 * Formats health record type with localization
 */
export function formatHealthRecordType(
  type: HealthRecordType,
  locale: string = 'en-US'
): string {
  const typeMap: { [key: string]: { [key: string]: string } } = {
    'en-US': {
      [HealthRecordType.CONSULTATION]: 'Medical Consultation',
      [HealthRecordType.LAB_RESULT]: 'Laboratory Results',
      [HealthRecordType.PRESCRIPTION]: 'Prescription',
      [HealthRecordType.IMAGING]: 'Medical Imaging',
      [HealthRecordType.VITAL_SIGNS]: 'Vital Signs',
      [HealthRecordType.WEARABLE_DATA]: 'Wearable Device Data'
    },
    'pt-BR': {
      [HealthRecordType.CONSULTATION]: 'Consulta Médica',
      [HealthRecordType.LAB_RESULT]: 'Resultados Laboratoriais',
      [HealthRecordType.PRESCRIPTION]: 'Prescrição',
      [HealthRecordType.IMAGING]: 'Exames de Imagem',
      [HealthRecordType.VITAL_SIGNS]: 'Sinais Vitais',
      [HealthRecordType.WEARABLE_DATA]: 'Dados de Dispositivo Vestível'
    }
  };

  return typeMap[locale]?.[type] || typeMap['en-US'][type];
}

/**
 * Formats claim status with proper styling and accessibility
 */
export function formatClaimStatus(
  status: ClaimStatus,
  locale: string = 'en-US'
): { text: string; className: string; ariaLabel: string } {
  const statusConfig: { [key: string]: { [key: string]: any } } = {
    'en-US': {
      [ClaimStatus.DRAFT]: {
        text: 'Draft',
        className: 'status-draft',
        ariaLabel: 'Claim in draft status'
      },
      [ClaimStatus.SUBMITTED]: {
        text: 'Submitted',
        className: 'status-submitted',
        ariaLabel: 'Claim submitted for processing'
      },
      [ClaimStatus.UNDER_REVIEW]: {
        text: 'Under Review',
        className: 'status-review',
        ariaLabel: 'Claim is under review'
      },
      [ClaimStatus.APPROVED]: {
        text: 'Approved',
        className: 'status-approved',
        ariaLabel: 'Claim has been approved'
      },
      [ClaimStatus.REJECTED]: {
        text: 'Rejected',
        className: 'status-rejected',
        ariaLabel: 'Claim has been rejected'
      },
      [ClaimStatus.PENDING_INFO]: {
        text: 'Pending Information',
        className: 'status-pending',
        ariaLabel: 'Additional information needed for claim'
      },
      [ClaimStatus.APPEALED]: {
        text: 'Under Appeal',
        className: 'status-appealed',
        ariaLabel: 'Claim is under appeal'
      }
    }
  };

  return statusConfig[locale]?.[status] || statusConfig['en-US'][status];
}

/**
 * Formats file size with proper units and localization
 */
export function formatFileSize(
  bytes: number,
  locale: string = 'en-US'
): string {
  try {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    const formatter = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2
    });

    const formattedSize = formatter.format(size);
    const unit = units[unitIndex];
    
    return `<span aria-label="${formattedSize} ${unit}">${formattedSize} ${unit}</span>`;
  } catch (error) {
    console.error('File size formatting error:', error);
    return `${bytes} B`;
  }
}