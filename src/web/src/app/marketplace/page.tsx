'use client';

import React, { useCallback, useState, Suspense } from 'react';
import styled from '@emotion/styled';
import { useRouter } from 'next/navigation';
import ProductGrid from '../../components/marketplace/ProductGrid';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { useMarketplace } from '../../../hooks/useMarketplace';
import { useAnalytics } from '../../../hooks/useAnalytics';
import { Product } from '../../lib/types/product';
import { Analytics, PrivacyLevel, AnalyticsCategory } from '../../lib/utils/analytics';

// Styled components with accessibility and responsive design
const PageContainer = styled.div`
  padding: clamp(16px, 5vw, 24px);
  max-width: 1440px;
  margin: 0 auto;
  min-height: 100vh;
  position: relative;
`;

const HeaderContainer = styled.header`
  margin-bottom: 32px;
  color: var(--high-contrast);
`;

const Title = styled.h1`
  font-size: clamp(2rem, 5vw, 2.5rem);
  font-weight: 700;
  margin-bottom: 16px;
  color: ${({ theme }) => theme.palette?.text?.primary || '#1A1A1A'};
`;

const Description = styled.p`
  font-size: 1.125rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.palette?.text?.secondary || '#616161'};
  max-width: 800px;
`;

const ClinicalModeToggle = styled.button`
  position: fixed;
  top: 16px;
  right: 16px;
  padding: 8px 16px;
  background-color: ${({ theme }) => theme.palette?.clinical?.main || '#2C88D9'};
  color: ${({ theme }) => theme.palette?.clinical?.contrastText || '#FFFFFF'};
  border: none;
  border-radius: 4px;
  cursor: pointer;
  z-index: 100;
  
  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.palette?.primary?.main || '#0B4F6C'};
    outline-offset: 2px;
  }
`;

const LoadingFallback = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  width: 100%;
`;

const MarketplacePage: React.FC = () => {
  // Initialize hooks with security context
  const router = useRouter();
  const { state, actions } = useMarketplace();
  const { logEvent } = useAnalytics();
  const [clinicalMode, setClinicalMode] = useState(false);

  // Secure product click handler with analytics
  const handleProductClick = useCallback((product: Product) => {
    logEvent({
      name: 'marketplace_product_selected',
      category: AnalyticsCategory.USER_INTERACTION,
      properties: {
        productId: product.id,
        category: product.category,
        clinicalMode
      },
      timestamp: Date.now(),
      userConsent: true,
      privacyLevel: PrivacyLevel.PUBLIC,
      auditInfo: {
        eventId: `product_click_${Date.now()}`,
        timestamp: Date.now(),
        userId: 'system',
        ipAddress: 'internal',
        actionType: 'product_selection'
      }
    });

    router.push(`/marketplace/products/${product.id}`);
  }, [router, logEvent, clinicalMode]);

  // Clinical mode toggle with analytics
  const toggleClinicalMode = useCallback(() => {
    setClinicalMode(prev => !prev);
    
    logEvent({
      name: 'marketplace_clinical_mode_toggle',
      category: AnalyticsCategory.USER_INTERACTION,
      properties: {
        enabled: !clinicalMode
      },
      timestamp: Date.now(),
      userConsent: true,
      privacyLevel: PrivacyLevel.INTERNAL,
      auditInfo: {
        eventId: `clinical_mode_${Date.now()}`,
        timestamp: Date.now(),
        userId: 'system',
        ipAddress: 'internal',
        actionType: 'clinical_mode_toggle'
      }
    });
  }, [clinicalMode, logEvent]);

  return (
    <ErrorBoundary>
      <PageContainer>
        <HeaderContainer>
          <Title>Digital Health Marketplace</Title>
          <Description>
            Discover curated digital therapeutic programs, wellness resources, and healthcare provider services.
          </Description>
        </HeaderContainer>

        <ClinicalModeToggle
          onClick={toggleClinicalMode}
          aria-pressed={clinicalMode}
          aria-label={`${clinicalMode ? 'Disable' : 'Enable'} clinical mode`}
        >
          {clinicalMode ? 'Disable Clinical Mode' : 'Enable Clinical Mode'}
        </ClinicalModeToggle>

        <Suspense fallback={
          <LoadingFallback role="alert" aria-busy="true">
            Loading marketplace products...
          </LoadingFallback>
        }>
          <ProductGrid
            products={state.products}
            onProductClick={handleProductClick}
            loading={state.loading}
            clinicalMode={clinicalMode}
            emergencyMode={false}
          />
        </Suspense>
      </PageContainer>
    </ErrorBoundary>
  );
};

export default MarketplacePage;

// Metadata for Next.js page configuration
export const metadata = {
  title: 'Digital Health Marketplace - AUSTA SuperApp',
  description: 'Discover and access digital therapeutic programs, wellness resources, and healthcare provider services.',
  openGraph: {
    title: 'Digital Health Marketplace - AUSTA SuperApp',
    description: 'Access curated digital health solutions and provider services.',
    type: 'website'
  }
};