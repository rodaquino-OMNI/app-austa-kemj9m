'use client';

import React from 'react';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import Analytics from '@vercel/analytics';
import { ErrorBoundary } from 'react-error-boundary';
import type { Metadata } from 'next';

import { Product } from '../../../lib/types/product';
import { getProductById } from '../../../lib/api/marketplace';

// Constants for image optimization
const IMAGE_QUALITY = 90;
const MAX_IMAGE_WIDTH = 1200;
const MAX_IMAGE_HEIGHT = 800;
const ERROR_BOUNDARY_FALLBACK = "We're unable to display this product at the moment. Please try again later.";

/**
 * Generates dynamic metadata for product page including SEO optimization
 */
export async function generateMetadata({ 
  params: { productId } 
}: { 
  params: { productId: string } 
}): Promise<Metadata> {
  try {
    const product = await getProductById(productId);

    return {
      title: `${product.name} | AUSTA SuperApp Marketplace`,
      description: product.description,
      openGraph: {
        title: product.name,
        description: product.description,
        images: product.images.map(url => ({
          url,
          width: MAX_IMAGE_WIDTH,
          height: MAX_IMAGE_HEIGHT,
          alt: product.name
        }))
      },
      twitter: {
        card: 'summary_large_image',
        title: product.name,
        description: product.description,
        images: product.images[0]
      },
      other: {
        'price': product.price.toString(),
        'rating': product.rating.toString(),
        'reviewCount': product.reviewCount.toString()
      }
    };
  } catch (error) {
    return {
      title: 'Product Not Found | AUSTA SuperApp Marketplace',
      description: 'The requested product could not be found.'
    };
  }
}

/**
 * Error fallback component with HIPAA-compliant error display
 */
const ErrorFallback: React.FC<{ error: Error }> = ({ error }) => (
  <div className="flex flex-col items-center justify-center min-h-screen p-4" role="alert">
    <h1 className="text-xl font-semibold text-gray-800 mb-4">
      {ERROR_BOUNDARY_FALLBACK}
    </h1>
    <button 
      onClick={() => window.location.reload()}
      className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark"
      aria-label="Retry loading the product"
    >
      Try Again
    </button>
  </div>
);

/**
 * Product details page component with server-side rendering and accessibility
 */
const ProductPage: React.FC<{ params: { productId: string } }> = async ({ params }) => {
  let product: Product;

  try {
    product = await getProductById(params.productId);
  } catch (error) {
    notFound();
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Analytics />
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Product Images */}
          <div className="relative">
            <div className="aspect-w-1 aspect-h-1 rounded-lg overflow-hidden">
              {product.images.map((image, index) => (
                <Image
                  key={index}
                  src={image}
                  alt={`${product.name} - Image ${index + 1}`}
                  width={MAX_IMAGE_WIDTH}
                  height={MAX_IMAGE_HEIGHT}
                  quality={IMAGE_QUALITY}
                  priority={index === 0}
                  className={`object-cover ${index === 0 ? 'block' : 'hidden'}`}
                />
              ))}
            </div>
          </div>

          {/* Product Details */}
          <div className="flex flex-col">
            <h1 className="text-3xl font-bold text-gray-900 mb-4" id="product-title">
              {product.name}
            </h1>

            <div className="flex items-center mb-4" aria-label={`Rating: ${product.rating} out of 5`}>
              {[...Array(5)].map((_, i) => (
                <span
                  key={i}
                  className={`h-5 w-5 ${
                    i < product.rating ? 'text-yellow-400' : 'text-gray-300'
                  }`}
                  aria-hidden="true"
                >
                  ★
                </span>
              ))}
              <span className="ml-2 text-sm text-gray-600">
                ({product.reviewCount} reviews)
              </span>
            </div>

            <p className="text-2xl font-semibold text-gray-900 mb-6">
              ${(product.price / 100).toFixed(2)}
            </p>

            <div className="prose prose-lg mb-6">
              <p>{product.description}</p>
            </div>

            {/* Product Details */}
            <div className="border-t border-gray-200 py-6">
              <h2 className="text-lg font-semibold mb-4">Program Details</h2>
              <dl className="grid grid-cols-1 gap-4">
                <div>
                  <dt className="font-medium text-gray-700">Duration</dt>
                  <dd>{product.details.duration} minutes</dd>
                </div>
                <div>
                  <dt className="font-medium text-gray-700">Format</dt>
                  <dd>{product.details.format}</dd>
                </div>
                <div>
                  <dt className="font-medium text-gray-700">Sessions</dt>
                  <dd>{product.details.sessionCount} sessions</dd>
                </div>
                <div>
                  <dt className="font-medium text-gray-700">Languages</dt>
                  <dd>{product.details.languages.join(', ')}</dd>
                </div>
              </dl>
            </div>

            {/* Purchase Button */}
            <button
              type="button"
              className="w-full bg-primary text-white py-3 px-8 rounded-md font-semibold 
                         hover:bg-primary-dark focus:outline-none focus:ring-2 
                         focus:ring-offset-2 focus:ring-primary mt-6"
              aria-describedby="product-title"
            >
              Purchase Program
            </button>
          </div>
        </div>
      </main>
    </ErrorBoundary>
  );
};

export default ProductPage;