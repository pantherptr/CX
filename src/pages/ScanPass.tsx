import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import jsQR from 'jsqr';
import { Icon } from '../components/Icon';
import { useAuth } from '../lib/auth';
import { useLocale } from '../lib/i18n';
import { profileIdFromPassUrl, releasePayoutAfterHandover, verifyHandover } from '../lib/data/handovers';

/** Scan someone's CX Pass. With `?booking=` it confirms the handover of that booking; without, it just
 *  opens their profile. Camera first, a photo of the pass as the fallback. */
export default function ScanPass() {
  const { session, loading } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const bookingId = params.get('booking');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handledRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraOff, setCameraOff] = useState(false);
  const [done, setDone] = useState<{ profileId: string } | null>(null);

  const onCode = useCallback(
    async (text: string) => {
      if (handledRef.current) return;
      const id = profileIdFromPassUrl(text);
      if (!id) {
        setError(t('This is not a CX Pass.'));
        return;
      }
      handledRef.current = true;
      if (!bookingId) {
        navigate(`/signal/profile/${id}`, { replace: true });
        return;
      }
      const { error: err } = await verifyHandover(bookingId, id);
      if (err) {
        handledRef.current = false;
        setError(err);
        return;
      }
      void releasePayoutAfterHandover(bookingId);
      setDone({ profileId: id });
    },
    [bookingId, navigate, t],
  );

  useEffect(() => {
    if (!session || done) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const tick = () => {
      const v = videoRef.current;
      const c = canvasRef.current;
      if (stopped) return;
      if (v && c && v.readyState >= 2 && v.videoWidth > 0) {
        const w = Math.min(640, v.videoWidth);
        const h = Math.round((w / v.videoWidth) * v.videoHeight);
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(v, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
          if (code?.data) void onCode(code.data);
        }
      }
      raf = window.setTimeout(tick, 140) as unknown as number;
    };
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((s) => {
        if (stopped) { s.getTracks().forEach((x) => x.stop()); return; }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play().catch(() => {});
        }
        tick();
      })
      .catch(() => setCameraOff(true));
    if (!navigator.mediaDevices?.getUserMedia) setCameraOff(true);
    return () => {
      stopped = true;
      window.clearTimeout(raf);
      stream?.getTracks().forEach((x) => x.stop());
    };
  }, [session, done, onCode]);

  const fromPhoto = (file: File | undefined) => {
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      const code = jsQR(data.data, c.width, c.height);
      if (code?.data) void onCode(code.data);
      else setError(t('No QR code found in that photo.'));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  };

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;

  return (
    <div className="fixed inset-0 z-[300] bg-[#0a0b0a] text-white">
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label={t('Close')}
        className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] z-20 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-white/10 backdrop-blur-md"
      >
        <Icon name="chevronLeft" size={20} />
      </button>

      {done ? (
        <div className="grid h-full place-items-center px-8 text-center">
          <div className="animate-scale-in">
            <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-white text-[#0a0b0a]">
              <Icon name="check" size={36} strokeWidth={2.6} />
            </span>
            <h1 className="mt-6 font-display text-2xl font-semibold">{t('Handover verified')}</h1>
            <p className="mx-auto mt-2 max-w-[18rem] text-detail text-white/70">{t('You both scanned your CX Pass. This handover now carries the verified seal.')}</p>
            <div className="mt-8 flex flex-col gap-2.5">
              <Link to={`/signal/profile/${done.profileId}`} className="inline-flex h-14 items-center justify-center rounded-2xl bg-white text-[15px] font-bold text-[#0a0b0a]">
                {t('Open profile')}
              </Link>
              {bookingId && (
                <Link to={`/trips/${bookingId}`} className="inline-flex h-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-[15px] font-semibold">
                  {t('Back to the trip')}
                </Link>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-black/45" />
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="relative h-64 w-64 rounded-[28px] border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
          </div>
          <div className="absolute inset-x-0 top-[max(1.1rem,calc(env(safe-area-inset-top)+0.35rem))] text-center">
            <p className="text-detail font-semibold uppercase tracking-[0.2em]">{t('Scan CX Pass')}</p>
          </div>
          <div className="absolute inset-x-0 bottom-0 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
            {error && <p className="mb-3 rounded-2xl bg-white/10 px-4 py-2.5 text-detail font-semibold text-white backdrop-blur-md">{error}</p>}
            <p className="text-detail text-white/75">
              {bookingId ? t('Point the camera at the other person’s CX Pass to confirm the handover.') : t('Point the camera at a CX Pass to open the profile.')}
            </p>
            <label className="mt-4 inline-flex h-12 cursor-pointer items-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 text-detail font-semibold backdrop-blur-md">
              <Icon name="image" size={17} /> {cameraOff ? t('Take or choose a photo of the pass') : t('Use a photo instead')}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { fromPhoto(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>
        </>
      )}
    </div>
  );
}
