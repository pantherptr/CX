import { useState, type ImgHTMLAttributes } from 'react';
import Zoom from 'react-medium-image-zoom';
import 'react-medium-image-zoom/dist/styles.css';

/* Adapted from 21st.dev "Zoomable Image" (inference-sh): tap a photo and it grows from where it is into a
 * full-screen view (medium.com-style); tap again, scroll or press Esc to put it back. Restyled to the CX
 * surfaces (see .rmiz in index.css), keeps the image's own fade-in/retry out of the way. */
export function ZoomableImage({
  src,
  alt = '',
  className = '',
  zoomSrc,
  zoomMargin = 12,
  disabled = false,
  ...rest
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
  zoomSrc?: string;
  zoomMargin?: number;
  disabled?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const img = <img src={src} alt={alt} className={className} onError={() => setFailed(true)} draggable={false} {...rest} />;
  if (disabled) return img;
  return (
    <Zoom classDialog="cx-zoom-dialog" zoomMargin={zoomMargin} zoomImg={zoomSrc ? { src: zoomSrc } : undefined}>
      {img}
    </Zoom>
  );
}
