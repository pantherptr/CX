import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { SectionHead } from '../components/primitives';
import { FaqItem } from '../components/FaqItem';
import { CATEGORIES, faqs, type Category } from '../data/faqs';

export default function Help() {
  const [category, setCategory] = useState<Category | 'All'>('All');
  const visible = useMemo(
    () => (category === 'All' ? faqs : faqs.filter((f) => f.category === category)),
    [category],
  );

  return (
    <div>
      <section className="container-page pt-14">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow mb-3">Help & Support</p>
          <h1 className="font-display text-4xl font-semibold leading-[1.04] text-ink text-balance sm:text-5xl">
            How can we help?
          </h1>
          <p className="mt-5 text-lead leading-relaxed text-muted text-pretty">
            Answers organised by where you are in your trip — before booking, during, and after.
          </p>
        </div>
      </section>

      <section className="container-page mt-16">
        <div className="mx-auto max-w-2xl card p-6 sm:p-8">
          <SectionHead title="Frequently asked questions" />
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => setCategory('All')} data-active={category === 'All'} className="chip">
              All
            </button>
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => setCategory(c)} data-active={category === c} className="chip">
                {c}
              </button>
            ))}
          </div>
          <div className="mt-2">
            {visible.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      <section className="container-page mt-16 mb-24">
        <div className="mx-auto max-w-2xl rounded-[1.75rem] border border-line bg-panel px-6 py-12 text-center sm:px-12">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent/10 text-accent-700">
            <Icon name="headset" size={22} />
          </span>
          <h2 className="mt-5 font-display text-2xl font-semibold">Still need help?</h2>
          <p className="mx-auto mt-2 max-w-sm text-body leading-relaxed text-muted">
            Start a conversation and we'll pick it up from there — same place you talk to hosts and
            renters, so nothing gets lost.
          </p>
          <Link to="/messages" className="btn btn-accent btn-lg mt-6">
            Message us <Icon name="arrowRight" size={17} />
          </Link>
        </div>
      </section>
    </div>
  );
}
