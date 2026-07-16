import { createContext } from 'react';

/**
 * PreviewGroup Context
 */
export interface PreviewGroupContextType {
  registerImage: (src: string, index: number) => number;
  unregisterImage: (src: string) => void;
  openPreview: (src: string) => void;
  currentIndex: number;
  images: string[];
}

export const PreviewGroupContext = createContext<PreviewGroupContextType | null>(null);

