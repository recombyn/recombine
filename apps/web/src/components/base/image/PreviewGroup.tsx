import React from 'react';

/**
 * PreviewGroup Props
 */
export interface PreviewGroupProps {
  children: React.ReactNode;
  /** Legacy preview props (ignored) */
  preview?: boolean | {
    current?: number;
    onChange?: (current: number) => void;
  };
}

/** Pass-through wrapper for grouped images */
const PreviewGroup: React.FC<PreviewGroupProps> = ({ children }) => {
  return <>{children}</>;
};

export default PreviewGroup;

