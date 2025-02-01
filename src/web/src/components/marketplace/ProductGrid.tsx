/**
 * @fileoverview Responsive product grid component for AUSTA SuperApp marketplace
 * Implements Material Design 3.0 with healthcare-specific optimizations
 * @version 1.0.0
 */

import React, { useCallback, useState, useEffect, useRef } from 'react';
import styled from '@emotion/styled';
import { useMediaQuery } from '@mui/material';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Product } from '../../lib/types/product';
import ProductCard from './ProductCard';
import SearchFilters from './SearchFilters';
import ErrorBoundary from '../common/ErrorBoundary';
import { Analytics } from '../../lib/utils/analytics';
import { theme } from '../../styles/theme';

// Constants for grid layout
const GRID_BREAKPOINTS = {
  mobile: 320,
  tablet: 768,
  desktop: 1024,
  wide: 1440,
};

const GRID_COLUMNS = {
  mobile: 1,
  tablet: 2,
  desktop: 3,
  wide: 4,
  clinical: {
    mobile: 1,
    tablet: 1,
    desktop: 2,
    wide: 2,
  },
};

// Styled Components
const GridContainer = styled.div<{ clinicalMode?: boolean }>`
  display: grid;
  gap: ${theme.spacing.lg}px;
  padding: ${theme.spacing.lg}px;
  width: 100%;
  max-width: ${GRID_BREAKPOINTS.wide}px;
  margin: 0 auto;
  grid-template-columns: repeat(var(--grid-columns), minmax(280px, 1fr));
  
  ${({ clinicalMode }) => clinicalMode && `
    gap: ${theme.spacing.xl}px;
    padding: ${theme.spacing.xl}px;
    background-color: ${theme.palette.background.clinical};
  `}

  @media (max-width: ${GRID_BREAKPOINTS.tablet}px) {
    padding: ${theme.spacing.md}px;
    gap: ${theme.spacing.md}px;
  }
`;

const FiltersContainer = styled.div`
  margin-bottom: ${theme.spacing.lg}px;
  padding: 0 ${theme.spacing.lg}px;

  @media (max-width: ${GRID_BREAKPOINTS.tablet}px) {
    padding: 0 ${theme.spacing.md}px;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
  width: 100%;
`;

const VirtualScrollContainer = styled.div`
  height: 100%;
  width: 100%;
  overflow: auto;
`;

// Component Props Interface
interface ProductGridProps {
  products: Product[];
  onProductClick: (product: Product) => void;
  loading?: boolean;
  className?: string;
  clinicalMode?: boolean;
  emergencyMode?: boolean;
}

const ProductGrid: React.FC<ProductGridProps> = ({
  products,
  onProductClick,
  loading = false,
  className,
  clinicalMode = false,
  emergencyMode = false,
}) => {
  // State management
  const [filteredProducts, setFilteredProducts] = useState<Product[]>(products);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Responsive layout handling
  const isMobile = useMediaQuery(`(max-width: ${GRID_BREAKPOINTS.tablet}px)`);
  const isTablet = useMediaQuery(`(max-width: ${GRID_BREAKPOINTS.desktop}px)`);
  const isDesktop = useMediaQuery(`(max-width: ${GRID_BREAKPOINTS.wide}px)`);

  // Calculate grid columns based on screen size and mode
  const getGridColumns = useCallback(() => {
    if (clinicalMode) {
      if (isMobile) return GRID_COLUMNS.clinical.mobile;
      if (isTablet) return GRID_COLUMNS.clinical.tablet;
      if (isDesktop) return GRID_COLUMNS.clinical.desktop;
      return GRID_COLUMNS.clinical.wide;
    }

    if (isMobile) return GRID_COLUMNS.mobile;
    if (isTablet) return GRID_COLUMNS.tablet;
    if (isDesktop) return GRID_COLUMNS.desktop;
    return GRID_COLUMNS.wide;
  }, [isMobile, isTablet, isDesktop, clinicalMode]);

  // Virtual scrolling setup
  const virtualizer = useVirtualizer({
    count: filteredProducts.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 350, // Estimated height of product card
    overscan: 5,
  });

  // Filter handling
  const handleFilterChange = useCallback((filters: any) => {
    const filtered = products.filter(product => {
      // Apply search filter
      if (filters.search && !product.name.toLowerCase().includes(filters.search.toLowerCase())) {
        return false;
      }

      // Apply category filter
      if (filters.categories?.length && !filters.categories.includes(product.category)) {
        return false;
      }

      // Apply price range filter
      if (filters.priceRange) {
        const { min, max } = filters.priceRange;
        if ((min && product.price < min) || (max && product.price > max)) {
          return false;
        }
      }

      return true;
    });

    setFilteredProducts(filtered);

    // Track filter usage
    Analytics.trackEvent({
      name: 'marketplace_filter_applied',
      category: Analytics.AnalyticsCategory.USER_INTERACTION,
      properties: {
        filterCount: Object.keys(filters).length,
        resultCount: filtered.length,
        clinicalMode,
      },
      timestamp: Date.now(),
      userConsent: true,
      privacyLevel: Analytics.PrivacyLevel.INTERNAL,
      auditInfo: {
        eventId: `filter_${Date.now()}`,
        timestamp: Date.now(),
        userId: 'system',
        ipAddress: 'internal',
        actionType: 'filter_products',
      },
    }).catch(console.error);
  }, [products, clinicalMode]);

  // Update grid columns on resize
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.setProperty('--grid-columns', getGridColumns().toString());
    }
  }, [getGridColumns]);

  // Update filtered products when source products change
  useEffect(() => {
    setFilteredProducts(products);
  }, [products]);

  return (
    <ErrorBoundary>
      <div className={className}>
        <FiltersContainer>
          <SearchFilters
            onFilterChange={handleFilterChange}
            clinicalMode={clinicalMode}
          />
        </FiltersContainer>

        {loading ? (
          <LoadingContainer role="alert" aria-busy="true">
            Loading products...
          </LoadingContainer>
        ) : (
          <VirtualScrollContainer ref={containerRef}>
            <GridContainer
              style={{ height: `${virtualizer.getTotalSize()}px` }}
              clinicalMode={clinicalMode}
              role="grid"
              aria-label="Product grid"
            >
              {virtualizer.getVirtualItems().map(virtualRow => {
                const product = filteredProducts[virtualRow.index];
                return (
                  <div
                    key={product.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <ProductCard
                      product={product}
                      onClick={onProductClick}
                      clinicalMode={clinicalMode}
                    />
                  </div>
                );
              })}
            </GridContainer>
          </VirtualScrollContainer>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default ProductGrid;