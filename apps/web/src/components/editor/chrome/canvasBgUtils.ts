import type { FillPanelValue } from '@/components/editor/panels/FillPanel';
import {
  DEFAULT_FILL_IMAGE_ADJUST,
  parseFillImageFit,
  parseFillType,
  type FillType,
} from '@/store/scene/sceneFill';

export function documentToCanvasFill(document: any, themeFallback: string): FillPanelValue {
  const raw = String(document?.backgroundColor || '').trim();
  const fillType = parseFillType(document?.backgroundFillType);
  const panelType = (
    fillType === 'linear' ||
    fillType === 'radial' ||
    fillType === 'angular' ||
    fillType === 'diffuse' ||
    fillType === 'image'
      ? fillType
      : 'solid'
  ) as FillType;

  return {
    fillType: panelType,
    fillColor: raw || themeFallback,
    fillOpacity: Number(document?.backgroundOpacity ?? 100),
    fillGradient: document?.backgroundGradient,
    fillImageSrc: document?.backgroundImageSrc,
    fillImageFit: parseFillImageFit(document?.backgroundImageFit),
    fillImageRotate: document?.backgroundImageRotate,
    fillImageAdjust: document?.backgroundImageAdjust || DEFAULT_FILL_IMAGE_ADJUST,
  };
}

export function canvasFillToDocumentMeta(next: FillPanelValue, followTheme: boolean) {
  return {
    backgroundColor: followTheme ? '' : next.fillColor,
    backgroundFillType: next.fillType,
    backgroundOpacity: next.fillOpacity,
    backgroundGradient: next.fillGradient,
    backgroundImageSrc: next.fillImageSrc,
    backgroundImageFit: next.fillImageFit,
    backgroundImageRotate: next.fillImageRotate,
    backgroundImageAdjust: next.fillImageAdjust,
  };
}
