/**
 * @fileoverview Marketplace search and filter component with healthcare-specific optimizations
 * Implements Material Design 3.0 principles and WCAG 2.1 Level AA accessibility
 * @version 1.0.0
 */

import React, { useCallback, useState, useEffect, useRef } from 'react';
import styled from '@emotion/styled';
import debounce from 'lodash/debounce';
import Select from '../common/Select';
import Input from '../common/Input';
import { ProductCategory, ProductSortOption } from '../../lib/types/product';
import { sanitizeInput } from '../../lib/utils/validation';
import { theme } from '../../styles/theme';

// Styled Components
const FilterContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing(2)}px;
  padding: ${theme.spacing(3)}px;
  background-color: ${theme.palette.background.paper};
  border-radius: ${theme.shape.borderRadius}px;
  box-shadow: ${theme.shadows[1]};

  @media (max-width: ${theme.breakpoints.values.sm}px) {
    padding: ${theme.spacing(1)}px;
  }
`;

const FilterRow = styled.div`
  display: flex;
  gap: ${theme.spacing(2)}px;
  align-items: center;
  flex-wrap: wrap;
  min-height: 48px;

  @media (max-width: ${theme.breakpoints.values.sm}px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const PriceRangeContainer = styled.div`
  display: flex;
  gap: ${theme.spacing(1)}px;
  align-items: center;

  @media (max-width: ${theme.breakpoints.values.sm}px) {
    flex-direction: column;
  }
`;

// Interfaces
export interface SearchFiltersProps {
  onFilterChange: (filters: FilterState) => void;
  initialFilters?: FilterState;
  className?: string;
}

export interface FilterState {
  search?: string;
  categories?: ProductCategory[];
  priceRange?: {
    min: number | undefined;
    max: number | undefined;
  };
  sortBy?: ProductSortOption;
}

// Category options for select component
const categoryOptions = Object.values(ProductCategory).map(category => ({
  value: category,
  label: category.replace(/_/g, ' '),
  clinicalCode: `CAT_${category}`,
}));

// Sort options for select component
const sortOptions = Object.values(ProductSortOption).map(option => ({
  value: option,
  label: option.replace(/_/g, ' '),
}));

const SearchFilters: React.FC<SearchFiltersProps> = ({
  onFilterChange,
  initialFilters,
  className,
}) => {
  // State management
  const [filters, setFilters] = useState<FilterState>(initialFilters || {});
  const [searchError, setSearchError] = useState<string>();
  const announceRef = useRef<HTMLDivElement>(null);

  // Initialize filters
  useEffect(() => {
    if (initialFilters) {
      setFilters(initialFilters);
    }
  }, [initialFilters]);

  // Debounced search handler
  const handleSearchChange = useCallback(
    debounce((value: string, isValid: boolean) => {
      if (!isValid) {
        setSearchError('Invalid search input');
        return;
      }

      const sanitizedValue = sanitizeInput(value, {
        stripHtml: true,
        escapeChars: true,
        trimWhitespace: true,
        enableMetrics: false,
      });

      setFilters(prev => {
        const newFilters = { ...prev, search: sanitizedValue };
        onFilterChange(newFilters);
        return newFilters;
      });

      // Announce filter change to screen readers
      if (announceRef.current) {
        announceRef.current.textContent = `Search updated to ${sanitizedValue}`;
      }
    }, 300),
    [onFilterChange]
  );

  // Category selection handler
  const handleCategoryChange = useCallback(
    (value: string | string[], validationResult: { isValid: boolean }) => {
      if (!validationResult.isValid) return;

      const categories = (Array.isArray(value) ? value : [value]) as ProductCategory[];
      setFilters(prev => {
        const newFilters = { ...prev, categories };
        onFilterChange(newFilters);
        return newFilters;
      });

      // Announce filter change to screen readers
      if (announceRef.current) {
        announceRef.current.textContent = `Categories updated to ${categories.join(', ')}`;
      }
    },
    [onFilterChange]
  );

  // Price range handler
  const handlePriceRangeChange = useCallback(
    (field: 'min' | 'max', value: string, isValid: boolean) => {
      if (!isValid) return;

      const numValue = Number(value);
      if (isNaN(numValue) || numValue < 0) return;

      setFilters(prev => {
        const newPriceRange = {
          ...prev.priceRange,
          [field]: numValue,
        };
        const newFilters = { ...prev, priceRange: newPriceRange };
        onFilterChange(newFilters);
        return newFilters;
      });

      // Announce price change to screen readers
      if (announceRef.current) {
        announceRef.current.textContent = `Price ${field} updated to ${value}`;
      }
    },
    [onFilterChange]
  );

  // Sort option handler
  const handleSortChange = useCallback(
    (value: string | string[], validationResult: { isValid: boolean }) => {
      if (!validationResult.isValid) return;

      const sortBy = value as ProductSortOption;
      setFilters(prev => {
        const newFilters = { ...prev, sortBy };
        onFilterChange(newFilters);
        return newFilters;
      });

      // Announce sort change to screen readers
      if (announceRef.current) {
        announceRef.current.textContent = `Sort option updated to ${sortBy.replace(/_/g, ' ')}`;
      }
    },
    [onFilterChange]
  );

  return (
    <FilterContainer className={className} role="search" aria-label="Product filters">
      <FilterRow>
        <Input
          id="product-search"
          name="search"
          label="Search Products"
          value={filters.search || ''}
          onChange={(value, isValid) => handleSearchChange(value, isValid)}
          error={searchError}
          fullWidth
          placeholder="Search for products..."
          aria-label="Search products"
        />
      </FilterRow>

      <FilterRow>
        <Select
          id="product-categories"
          name="categories"
          label="Categories"
          options={categoryOptions}
          value={filters.categories || []}
          onChange={handleCategoryChange}
          multiple
          fullWidth
          aria-label="Filter by categories"
        />

        <Select
          id="product-sort"
          name="sort"
          label="Sort By"
          options={sortOptions}
          value={filters.sortBy || ''}
          onChange={handleSortChange}
          fullWidth
          aria-label="Sort products"
        />
      </FilterRow>

      <FilterRow>
        <PriceRangeContainer>
          <Input
            id="price-min"
            name="priceMin"
            label="Min Price"
            type="number"
            value={filters.priceRange?.min?.toString() || ''}
            onChange={(value, isValid) => handlePriceRangeChange('min', value, isValid)}
            fullWidth
            aria-label="Minimum price"
          />
          <Input
            id="price-max"
            name="priceMax"
            label="Max Price"
            type="number"
            value={filters.priceRange?.max?.toString() || ''}
            onChange={(value, isValid) => handlePriceRangeChange('max', value, isValid)}
            fullWidth
            aria-label="Maximum price"
          />
        </PriceRangeContainer>
      </FilterRow>

      {/* Hidden element for screen reader announcements */}
      <div
        ref={announceRef}
        role="status"
        aria-live="polite"
        className="visually-hidden"
      />
    </FilterContainer>
  );
};

export default SearchFilters;