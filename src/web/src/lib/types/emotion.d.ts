import '@emotion/react';

declare module '@emotion/react' {
  export interface Theme {
    // Add your theme type definitions here if needed
  }
}

declare module 'react' {
  interface DOMAttributes<T> {
    css?: any;
  }
}