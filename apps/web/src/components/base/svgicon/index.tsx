import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { ReactSVG } from 'react-svg';

interface SvgIconProps {
  src: string;
  width?: number | string;
  height?: number | string;
  strokeColor?: string;
  fillColor?: string;
  hoverStrokeColor?: string;
  hoverFillColor?: string;
}

/**
 * Inline SVG via `react-svg`; optional default and hover stroke/fill.
 *
 * @param props - Size and color props
 * @returns Wrapped span around the injected SVG
 */
export const SvgIcon: React.FC<SvgIconProps> = ({
  src,
  width,
  height,
  strokeColor,
  fillColor,
  hoverStrokeColor,
  hoverFillColor,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const svgElementRef = useRef<SVGElement | null>(null);

  const updateSvgColor = useCallback(
    (svg: SVGElement, hover: boolean) => {
      const currentStrokeColor = hover && hoverStrokeColor ? hoverStrokeColor : strokeColor;
      const currentFillColor = hover && hoverFillColor ? hoverFillColor : fillColor;

      const paths = svg.querySelectorAll('path');
      paths.forEach((path) => {
        if (currentFillColor) {
          path.setAttribute('fill', currentFillColor);
        }
        if (currentStrokeColor) {
          path.setAttribute('stroke', currentStrokeColor);
        }
      });

      const styles: string[] = [];
      if (currentStrokeColor) {
        styles.push(`stroke: ${currentStrokeColor}`);
      }
      if (currentFillColor) {
        styles.push(`fill: ${currentFillColor}`);
      }
      if (styles.length > 0) {
        svg.setAttribute('style', styles.join('; '));
      }
    },
    [strokeColor, fillColor, hoverStrokeColor, hoverFillColor]
  );

  const handleBeforeInjection = useCallback(
    (svg: SVGElement) => {
      svgElementRef.current = svg;

      if (width !== undefined) {
        svg.setAttribute('width', typeof width === 'number' ? `${width}` : width);
      }
      if (height !== undefined) {
        svg.setAttribute('height', typeof height === 'number' ? `${height}` : height);
      }

      updateSvgColor(svg, false);
    },
    [width, height, updateSvgColor]
  );

  useEffect(() => {
    if (svgElementRef.current) {
      updateSvgColor(svgElementRef.current, isHovered);
    }
  }, [isHovered, updateSvgColor]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  const svgComponent = useMemo(
    () => (
      <span
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'inline-block', lineHeight: 0 }}
      >
        <ReactSVG src={src} beforeInjection={handleBeforeInjection} wrapper='span' />
      </span>
    ),
    [src, handleBeforeInjection, handleMouseEnter, handleMouseLeave]
  );

  return svgComponent;
};