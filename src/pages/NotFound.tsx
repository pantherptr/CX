import { Link } from 'react-router-dom';
import { CxFlagC } from '../components/CxFlag';

export default function NotFound() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <CxFlagC className="h-44 w-auto text-ink" />
      <p className="mt-6 font-display text-6xl font-semibold text-ink">404</p>
      <h1 className="mt-2 font-display text-2xl font-semibold text-ink">This road leads nowhere</h1>
      <p className="mt-2 max-w-sm text-copy text-muted">
        The page you’re looking for doesn’t exist or may have moved. Let’s get you back on track.
      </p>
      <div className="mt-7 flex gap-3">
        <Link to="/" className="btn btn-primary btn-lg">Back home</Link>
        <Link to="/browse" className="btn btn-secondary btn-lg">Browse cars</Link>
      </div>
    </div>
  );
}
