# AWS Provider configuration
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables
locals {
  cdn_domain = "${var.environment}-cdn.austa-superapp.com"
  origin_id  = "${var.environment}-app-assets-origin"
  tags = {
    Environment         = var.environment
    Service            = "AUSTA SuperApp"
    ManagedBy          = "Terraform"
    SecurityCompliance = "HIPAA"
    DataClassification = "PHI"
  }
}

# CloudFront Origin Access Identity
resource "aws_cloudfront_origin_access_identity" "app_assets" {
  comment = "Origin Access Identity for AUSTA SuperApp ${var.environment} assets - HIPAA Compliant"
}

# CloudFront Response Headers Policy
resource "aws_cloudfront_response_headers_policy" "security_headers" {
  name = "security-headers-${var.environment}"

  security_headers_config {
    strict_transport_security {
      override                   = true
      include_subdomains        = true
      preload                   = true
      access_control_max_age_sec = 31536000
    }
    content_security_policy {
      override                 = true
      content_security_policy = "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
    }
    content_type_options {
      override = true
    }
    frame_options {
      override      = true
      frame_option = "DENY"
    }
    referrer_policy {
      override         = true
      referrer_policy = "strict-origin-when-cross-origin"
    }
  }
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "media_distribution" {
  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  price_class         = "PriceClass_All"
  comment             = "AUSTA SuperApp CDN distribution for ${var.environment} - HIPAA Compliant"
  aliases             = [local.cdn_domain]

  origin {
    domain_name = aws_s3_bucket.app_assets.bucket_regional_domain_name
    origin_id   = local.origin_id

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.app_assets.cloudfront_access_identity_path
    }

    origin_shield {
      enabled              = true
      origin_shield_region = var.aws_region
    }
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = local.origin_id
    compress         = true

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400

    forwarded_values {
      query_string = false
      headers      = ["Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers"]
      cookies {
        forward = "none"
      }
    }

    response_headers_policy_id = aws_cloudfront_response_headers_policy.security_headers.id

    function_association {
      event_type   = "viewer-response"
      function_arn = aws_cloudfront_function.security_headers.arn
    }
  }

  web_acl_id = aws_wafv2_web_acl.cloudfront_waf.arn

  logging_config {
    include_cookies = false
    bucket         = aws_s3_bucket.cdn_logs.bucket_domain_name
    prefix         = "cdn-logs/"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.cdn.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 10
  }

  tags = local.tags
}

# Outputs
output "cloudfront_distribution_id" {
  value       = aws_cloudfront_distribution.media_distribution.id
  description = "CloudFront distribution ID for DNS and cache invalidation"
}

output "cloudfront_domain_name" {
  value       = aws_cloudfront_distribution.media_distribution.domain_name
  description = "CloudFront domain name for application configuration"
}

output "cloudfront_origin_access_identity" {
  value       = aws_cloudfront_origin_access_identity.app_assets.iam_arn
  description = "Origin Access Identity ARN for S3 bucket policy"
}