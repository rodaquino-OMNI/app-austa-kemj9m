import React from 'react'; // ^18.2.0
import styled from '@emotion/styled'; // ^11.11.0
import { Box, Container, Typography, Link, Grid } from '@mui/material'; // ^5.14.0
import { theme } from '../../styles/theme';

// Helper function to get current year
const getCurrentYear = (): number => new Date().getFullYear();

// Footer links configuration
const FOOTER_LINKS = [
  { title: 'About Us', href: '/about' },
  { title: 'Privacy Policy', href: '/privacy' },
  { title: 'Terms of Service', href: '/terms' },
  { title: 'Contact', href: '/contact' }
] as const;

// Social media links configuration
const SOCIAL_LINKS = [
  { platform: 'LinkedIn', href: 'https://linkedin.com/company/austa-health' },
  { platform: 'Twitter', href: 'https://twitter.com/austahealth' }
] as const;

// Styled footer component with responsive design
const StyledFooter = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  borderTop: `1px solid ${theme.palette.grey[200]}`,
  padding: theme.spacing(3, 2),
  color: theme.palette.text.primary,

  [theme.breakpoints.up('sm')]: {
    padding: theme.spacing(4, 3),
  },

  [theme.breakpoints.up('md')]: {
    padding: theme.spacing(5, 4),
  },

  '& .footer-grid': {
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  '& .footer-links': {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
    [theme.breakpoints.up('sm')]: {
      flexDirection: 'row',
      gap: theme.spacing(4),
    },
  },

  '& .social-links': {
    display: 'flex',
    gap: theme.spacing(3),
    marginTop: theme.spacing(2),
    [theme.breakpoints.up('sm')]: {
      marginTop: 0,
    },
  },
}));

const Footer: React.FC = () => {
  return (
    <StyledFooter component="footer" role="contentinfo">
      <Container maxWidth="lg">
        <Grid container spacing={3} className="footer-grid">
          {/* Company Info & Copyright */}
          <Grid item xs={12} sm={6} md={4}>
            <Typography
              variant="h6"
              component="div"
              sx={{ mb: 2, fontWeight: theme.typography.fontWeightBold }}
            >
              AUSTA SuperApp
            </Typography>
            <Typography variant="body2" color="text.secondary">
              © {getCurrentYear()} AUSTA Health. All rights reserved.
            </Typography>
          </Grid>

          {/* Footer Links */}
          <Grid item xs={12} sm={6} md={4}>
            <nav className="footer-links" aria-label="Footer Navigation">
              {FOOTER_LINKS.map((link) => (
                <Link
                  key={link.title}
                  href={link.href}
                  color="text.secondary"
                  underline="hover"
                  sx={{
                    typography: 'body2',
                    '&:hover': { color: theme.palette.primary.main },
                  }}
                >
                  {link.title}
                </Link>
              ))}
            </nav>
          </Grid>

          {/* Social Links */}
          <Grid item xs={12} sm={12} md={4}>
            <div className="social-links">
              {SOCIAL_LINKS.map((link) => (
                <Link
                  key={link.platform}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  color="text.secondary"
                  underline="hover"
                  aria-label={`Visit AUSTA Health on ${link.platform}`}
                  sx={{
                    typography: 'body2',
                    '&:hover': { color: theme.palette.primary.main },
                  }}
                >
                  {link.platform}
                </Link>
              ))}
            </div>
          </Grid>
        </Grid>

        {/* Additional Info */}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 4, textAlign: 'center' }}
        >
          AUSTA SuperApp is a comprehensive digital healthcare platform. For medical emergencies, please dial emergency services.
        </Typography>
      </Container>
    </StyledFooter>
  );
};

export default Footer;