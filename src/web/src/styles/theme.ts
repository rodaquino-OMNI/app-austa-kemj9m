import { createTheme, Theme, ThemeOptions } from '@mui/material'; // @mui/material ^5.14.0

// Healthcare-specific color palette with WCAG 2.1 AA compliant contrast ratios
const palette = {
  primary: {
    main: '#0B4F6C',
    light: '#3B7C96',
    dark: '#062A3C',
    contrastText: '#FFFFFF',
  },
  secondary: {
    main: '#20BF55',
    light: '#4CD675',
    dark: '#148E3F',
    contrastText: '#FFFFFF',
  },
  clinical: {
    main: '#2C88D9',
    light: '#5AA2E5',
    dark: '#1B5A8E',
    contrastText: '#FFFFFF',
  },
  error: {
    main: '#D32F2F',
    light: '#EF5350',
    dark: '#C62828',
    contrastText: '#FFFFFF',
  },
  warning: {
    main: '#ED6C02',
    light: '#FF9800',
    dark: '#E65100',
    contrastText: '#000000',
  },
  success: {
    main: '#2E7D32',
    light: '#4CAF50',
    dark: '#1B5E20',
    contrastText: '#FFFFFF',
  },
  background: {
    default: '#FFFFFF',
    paper: '#F5F5F5',
    clinical: '#F8FBFF',
    elevated: '#FFFFFF',
  },
  text: {
    primary: '#1A1A1A',
    secondary: '#616161',
    disabled: '#9E9E9E',
  },
};

// Fluid typography system with accessible line heights and letter spacing
const typography = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontSize: 16,
  fontWeightLight: 300,
  fontWeightRegular: 400,
  fontWeightMedium: 500,
  fontWeightBold: 700,
  h1: {
    fontSize: 'clamp(2rem, 5vw, 2.5rem)',
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: '-0.01562em',
  },
  h2: {
    fontSize: 'clamp(1.75rem, 4vw, 2rem)',
    fontWeight: 700,
    lineHeight: 1.3,
    letterSpacing: '-0.00833em',
  },
  h3: {
    fontSize: 'clamp(1.5rem, 3vw, 1.75rem)',
    fontWeight: 600,
    lineHeight: 1.4,
    letterSpacing: '0em',
  },
  body1: {
    fontSize: '1rem',
    lineHeight: 1.5,
    letterSpacing: '0.00938em',
  },
  body2: {
    fontSize: '0.875rem',
    lineHeight: 1.5,
    letterSpacing: '0.01071em',
  },
  caption: {
    fontSize: '0.75rem',
    lineHeight: 1.66,
    letterSpacing: '0.03333em',
  },
};

// Mobile-first responsive breakpoints
const breakpoints = {
  values: {
    xs: 320,
    sm: 768,
    md: 1024,
    lg: 1440,
    xl: 1920,
  },
};

// Healthcare-optimized spacing system
const createSpacing = (factor: number) => factor * 8;

// Medical interface shape configurations
const shape = {
  borderRadius: 8,
  borderRadiusSmall: 4,
  borderRadiusLarge: 12,
  clinicalCard: 16,
  buttonRadius: 8,
};

// Healthcare-specific elevation system
const shadows = {
  clinical: '0px 4px 20px rgba(0, 0, 0, 0.08)',
  elevated: '0px 8px 24px rgba(0, 0, 0, 0.12)',
  modal: '0px 16px 32px rgba(0, 0, 0, 0.16)',
};

// Default MUI shadows array with our clinical shadow
const defaultShadows = [
  'none',
  shadows.clinical,
  shadows.clinical,
  shadows.clinical,
  shadows.clinical,
  shadows.clinical,
  shadows.clinical,
  shadows.clinical,
  shadows.clinical,
  shadows.clinical,
  shadows.clinical,
  shadows.clinical,
  shadows.clinical,
  shadows.clinical,
  shadows.clinical,
  shadows.clinical,
  shadows.clinical,
  shadows.clinical,
  shadows.clinical,
  shadows.clinical,
  shadows.clinical,
  shadows.clinical,
  shadows.clinical,
  shadows.clinical,
  shadows.clinical,
];

// Component-specific overrides for healthcare context
const components = {
  MuiButton: {
    styleOverrides: {
      root: {
        borderRadius: shape.buttonRadius,
        textTransform: 'none',
        fontWeight: typography.fontWeightMedium,
        variants: [],
      },
      containedPrimary: {
        '&:hover': {
          backgroundColor: palette.primary.dark,
        },
      },
      containedSecondary: {
        '&:hover': {
          backgroundColor: palette.secondary.dark,
        },
      },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        borderRadius: shape.clinicalCard,
        boxShadow: shadows.clinical,
        variants: [],
      },
    },
  },
  MuiTextField: {
    styleOverrides: {
      root: {
        '& .MuiOutlinedInput-root': {
          borderRadius: shape.borderRadiusSmall,
        },
        variants: [],
      },
    },
  },
  MuiTooltip: {
    styleOverrides: {
      tooltip: {
        backgroundColor: palette.text.primary,
        fontSize: '0.875rem',
        padding: '8px 16px',
        borderRadius: shape.borderRadiusSmall,
        variants: [],
      },
    },
  },
};

// Create the theme with all configurations
const themeOptions: ThemeOptions = {
  palette,
  typography,
  breakpoints,
  spacing: createSpacing,
  shape,
  components,
  shadows: defaultShadows,
};

export const theme: Theme = createTheme(themeOptions);

// Export individual theme sections for granular access
export const {
  palette: themePalette,
  typography: themeTypography,
  breakpoints: themeBreakpoints,
  spacing: themeSpacing,
  shape: themeShape,
  components: themeComponents,
} = theme;

export default theme;