import React, { useCallback, useRef, useState, memo } from 'react';
import styled from '@emotion/styled';
import Image from 'next/image';
import { Product, ProductCategory } from '../../lib/types/product';
import { Card } from '../../styles/components';
import { Theme } from '@mui/material';

// Constants
const MAX_DESCRIPTION_LENGTH = 150;
const IMAGE_PLACEHOLDER = '/images/product-placeholder.png';
const CLINICAL_MODE_CONTRAST_RATIO = 7.0;
const MIN_TOUCH_TARGET_SIZE = 44;

// Types
interface ProductCardProps {
  product: Product;
  onClick?: (product: Product) => void;
  clinicalMode?: boolean;
}

// Styled Components
const StyledCard = styled(Card)<{ isHovered: boolean; clinicalMode: boolean }>`
  position: relative;
  width: 100%;
  max-width: 360px;
  cursor: pointer;
  transition: transform 0.2s ease-in-out;
  transform: ${({ isHovered }) => isHovered ? 'translateY(-4px)' : 'none'};
  
  ${({ clinicalMode, theme }) => clinicalMode && `
    border-left: 4px solid ${(theme as Theme).palette.primary.main};
    background-color: ${(theme as Theme).palette.background.paper};
  `}

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const ImageContainer = styled.div`
  position: relative;
  width: 100%;
  height: 200px;
  border-radius: 8px 8px 0 0;
  overflow: hidden;
`;

const ContentContainer = styled.div`
  padding: 16px;
`;

const Title = styled.h3`
  margin: 0 0 8px 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: ${({ theme }) => (theme as Theme).palette.text.primary};
  min-height: 44px;
`;

const Description = styled.p`
  margin: 0 0 16px 0;
  font-size: 0.875rem;
  color: ${({ theme }) => (theme as Theme).palette.text.secondary};
  line-height: 1.5;
`;

const PriceContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: ${MIN_TOUCH_TARGET_SIZE}px;
`;

const Price = styled.span<{ isDiscounted: boolean }>`
  font-size: 1.25rem;
  font-weight: 600;
  color: ${({ theme, isDiscounted }) => 
    isDiscounted ? (theme as Theme).palette.success.main : (theme as Theme).palette.text.primary};
`;

const BadgeContainer = styled.div`
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  z-index: 1;
`;

const Badge = styled.span`
  padding: 4px 8px;
  border-radius: 4px;
  background-color: ${({ theme }) => (theme as Theme).palette.primary.main};
  color: ${({ theme }) => (theme as Theme).palette.primary.contrastText};
  font-size: 0.75rem;
  font-weight: 500;
`;

// Helper Functions
const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(price / 100);
};

const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength - 3)}...`;
};

// Main Component
const ProductCard: React.FC<ProductCardProps> = memo(({ 
  product, 
  onClick, 
  clinicalMode = false 
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  const handleClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    onClick?.(product);
  }, [onClick, product]);

  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  const getCategoryBadgeColor = useCallback((category: ProductCategory) => {
    switch (category) {
      case ProductCategory.DIGITAL_THERAPY:
        return 'primary';
      case ProductCategory.WELLNESS_PROGRAM:
        return 'secondary';
      case ProductCategory.PROVIDER_SERVICE:
        return 'clinical';
      default:
        return 'primary';
    }
  }, []);

  return (
    <StyledCard
      elevation="clinical"
      clinicalMode={clinicalMode}
      isHovered={isHovered}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      role="article"
      aria-label={`${product.name} - ${formatPrice(product.price)}`}
    >
      <ImageContainer>
        <Image
          ref={imageRef}
          src={imageError ? IMAGE_PLACEHOLDER : product.images[0]}
          alt={product.name}
          layout="fill"
          objectFit="cover"
          onError={handleImageError}
          loading="lazy"
          sizes="(max-width: 768px) 100vw, 360px"
        />
        <BadgeContainer>
          {product.tags?.map((tag: string) => (
            <Badge key={tag} role="status">
              {tag}
            </Badge>
          ))}
        </BadgeContainer>
      </ImageContainer>

      <ContentContainer>
        <Title>
          {product.name}
        </Title>
        <Description aria-label={product.description}>
          {truncateText(product.description, MAX_DESCRIPTION_LENGTH)}
        </Description>
        <PriceContainer>
          <Price 
            isDiscounted={false}
            aria-label={`Price: ${formatPrice(product.price)}`}
          >
            {formatPrice(product.price)}
          </Price>
        </PriceContainer>
      </ContentContainer>
    </StyledCard>
  );
});

ProductCard.displayName = 'ProductCard';

export default ProductCard;