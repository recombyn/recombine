import Image from './Image';
import PreviewGroup from './PreviewGroup';
import type { ImageProps } from './Image';
import type { PreviewGroupProps } from './PreviewGroup';

(Image as React.FC<ImageProps> & { PreviewGroup: typeof PreviewGroup }).PreviewGroup = PreviewGroup;

type ImageComponent = React.FC<ImageProps> & {
  PreviewGroup: typeof PreviewGroup;
};

const ImageWithPreviewGroup = Image as ImageComponent;

export { ImageWithPreviewGroup as Image };
export default ImageWithPreviewGroup;
export type { ImageProps, PreviewGroupProps };
