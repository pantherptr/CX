import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageHero } from '../components/marketing';
import { POLICY_INFO } from '../lib/cancellationPolicy';

/**
 * Terms, Privacy and Cancellation pages. Every statement here was written
 * against what the product actually does (Stripe checkout with a refundable
 * deposit hold, host-chosen cancellation policies with automatic refunds in
 * api/cancel-booking.ts, delivery options, account deletion, no analytics/ad
 * trackers). It is a working draft for legal review, not counsel-approved
 * text.
 */

const UPDATED = '19 September 2026';
const COMPANY = 'CX Mobility S.r.l.';

interface Section {
  title: string;
  body: ReactNode;
}

function LegalPage({
  eyebrow,
  title,
  lead,
  sections,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  sections: Section[];
}) {
  return (
    <div>
      <PageHero eyebrow={eyebrow} title={title} lead={lead} />
      <div className="container-page py-12 sm:py-16">
        <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[220px_1fr]">
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-24">
              <p className="text-label font-semibold uppercase tracking-[0.14em] text-faint">On this page</p>
              <ol className="mt-3 space-y-2 border-l border-line pl-4">
                {sections.map((s, i) => (
                  <li key={s.title}>
                    <a href={`#s${i + 1}`} className="text-detail text-muted transition-colors hover:text-ink">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>

          <article>
            <p className="text-detail text-muted">
              Last updated {UPDATED} · {COMPANY}, Milan, Italy
            </p>
            <div className="mt-8 space-y-10">
              {sections.map((s, i) => (
                <section key={s.title} id={`s${i + 1}`} className="scroll-mt-24">
                  <h2 className="font-display text-xl font-semibold text-ink sm:text-2xl">
                    <span className="mr-2 text-faint">{i + 1}.</span>
                    {s.title}
                  </h2>
                  <div className="mt-3 space-y-3 text-body leading-relaxed text-ink-soft [&_a]:font-medium [&_a]:text-accent-700 [&_a]:underline-offset-2 hover:[&_a]:underline [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
                    {s.body}
                  </div>
                </section>
              ))}
            </div>
            <div className="mt-14 rounded-2xl border border-line bg-panel/60 p-5 text-detail text-muted">
              Questions about this page? Reach us through the <Link to="/help" className="font-medium text-accent-700 hover:underline">Help centre</Link> and we will get back to you.
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}

export function Terms() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      lead="The rules for using CX, in plain language. Please read them before you book or list a car."
      sections={[
        {
          title: 'Who we are',
          body: (
            <>
              <p>
                CX is a marketplace run by {COMPANY}, Milan, Italy. We provide the platform, payments and support that
                connect people who want to rent a car (renters) with people who share one (hosts).
              </p>
              <p>By creating an account or using CX you agree to these terms and to our <Link to="/privacy">Privacy Policy</Link>.</p>
            </>
          ),
        },
        {
          title: 'Your account',
          body: (
            <ul>
              <li>You must be at least 18 and able to enter into a binding agreement.</li>
              <li>Give accurate information and keep it up to date. Keep your sign-in details safe; you are responsible for activity on your account.</li>
              <li>You can delete your account at any time from Settings.</li>
            </ul>
          ),
        },
        {
          title: 'Renting a car',
          body: (
            <ul>
              <li>You need a valid driving licence for the country and vehicle type. We ask for your driver details when you book.</li>
              <li>Some hosts or vehicles may set extra requirements, such as a minimum age or driving experience. These are shown on the listing or at booking.</li>
              <li>Use the car only as agreed for your trip, drive safely and lawfully, and return it on time and in the condition you received it, allowing for normal wear.</li>
              <li>Fines, tolls and charges that arise during your trip are your responsibility.</li>
            </ul>
          ),
        },
        {
          title: 'Prices, payment and deposit',
          body: (
            <>
              <p>The price of your trip, including any service fee, delivery fee and extras, is shown before you pay. Payments are processed securely by Stripe.</p>
              <p>
                Some trips also place a refundable security deposit hold on your card. A hold is authorised, not charged,
                and is released after the trip in line with your card issuer&apos;s timing, unless a charge is due under these terms.
              </p>
            </>
          ),
        },
        {
          title: 'Cancellations and refunds',
          body: (
            <p>
              How much you are refunded when you cancel depends on the policy the host chose for the car, which is shown before you pay. The details are in our{' '}
              <Link to="/cancellation-policy">Cancellation Policy</Link>, which forms part of these terms.
            </p>
          ),
        },
        {
          title: 'Hosting a car',
          body: (
            <ul>
              <li>You confirm you are entitled to rent out the car, that it is roadworthy, and that your listing is accurate, with honest photos.</li>
              <li>You set your daily rate. Renters pay the CX service fee on top, so you receive the rate you set.</li>
              <li>You choose whether to offer pickup, delivery, or both, and you set any delivery fee. Delivery details are shown to the renter before they pay.</li>
              <li>You choose a cancellation policy (Flexible, Moderate or Strict) for each car. If you cancel a confirmed trip yourself, the renter is refunded in full.</li>
              <li>We may remove or pause a listing that breaks these terms or puts renters at risk.</li>
            </ul>
          ),
        },
        {
          title: 'Protection and support',
          body: (
            <p>
              Trips booked on CX include damage protection and 24/7 roadside assistance as described at checkout. The
              scope and limits of protection are shown when you book; please read them.
            </p>
          ),
        },
        {
          title: 'SIGNAL and messages',
          body: (
            <>
              <p>
                You own what you post on SIGNAL and in messages, and you give CX permission to store and display it as
                needed to run the service. Post only content you have the right to share.
              </p>
              <p>No unlawful, abusive, misleading or harmful content. We may remove content and limit accounts that break these rules.</p>
            </>
          ),
        },
        {
          title: 'Acceptable use',
          body: (
            <ul>
              <li>No fraud, impersonation or attempts to bypass payments or verification.</li>
              <li>No scraping, disrupting or reverse engineering the service.</li>
              <li>Treat other members with respect.</li>
            </ul>
          ),
        },
        {
          title: 'Liability',
          body: (
            <p>
              Nothing in these terms limits liability that cannot be limited by law, including for death or personal injury
              caused by negligence, or your rights as a consumer. Beyond that, CX is not liable for indirect or
              consequential losses, and our total liability for a claim is limited to the amount you paid for the
              trip concerned.
            </p>
          ),
        },
        {
          title: 'Changes and ending',
          body: (
            <>
              <p>We may update these terms. If a change is significant, we will tell you before it takes effect. Continuing to use CX means you accept the update.</p>
              <p>We may suspend or close an account that breaks these terms. Where mandatory consumer law in your country gives you additional rights, those rights still apply.</p>
            </>
          ),
        },
      ]}
    />
  );
}

export function Privacy() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      lead="What we collect, why we collect it, and the control you have over it."
      sections={[
        {
          title: 'Who is responsible',
          body: (
            <p>
              {COMPANY}, Milan, Italy is the controller of your personal data when you use CX. Contact us through the{' '}
              <Link to="/help">Help centre</Link> for anything privacy-related.
            </p>
          ),
        },
        {
          title: 'What we collect',
          body: (
            <ul>
              <li><strong>Account:</strong> name, email, profile photo and location. If you sign in with Google, we receive your name, email and photo from Google.</li>
              <li><strong>Bookings:</strong> trip details, driver and licence details you provide, pickup or delivery address, and booking history.</li>
              <li><strong>Payments:</strong> handled by Stripe. We receive payment status and the last digits of your card, not your full card number.</li>
              <li><strong>Hosting:</strong> listing details and photos, pricing and availability.</li>
              <li><strong>Messages and SIGNAL:</strong> messages, posts, Stories, comments and reactions you create.</li>
              <li><strong>Device:</strong> notification tokens if you turn on push notifications, and basic technical logs needed to keep the service secure.</li>
            </ul>
          ),
        },
        {
          title: 'Why we use it',
          body: (
            <ul>
              <li>To provide the service: accounts, bookings, payments, messaging and support (performance of our contract with you).</li>
              <li>To keep CX safe: verification, fraud prevention and enforcing our terms (our legitimate interests, and legal obligations).</li>
              <li>To contact you about your trips, receipts and reminders.</li>
              <li>To meet legal, tax and accounting duties.</li>
            </ul>
          ),
        },
        {
          title: 'Who we share it with',
          body: (
            <>
              <p>
                Between renters and hosts, we share what is needed to complete a trip, such as names, trip dates and
                pickup or delivery details. We also use trusted service providers who process data on our behalf:
              </p>
              <ul>
                <li>Supabase, for our database, authentication and file storage.</li>
                <li>Stripe, for payments and refunds.</li>
                <li>Vercel, for hosting the website.</li>
                <li>An email provider, to send booking and account emails.</li>
                <li>Google, if you choose Google sign-in.</li>
              </ul>
              <p>We do not sell your personal data.</p>
            </>
          ),
        },
        {
          title: 'Cookies and similar storage',
          body: (
            <p>
              CX uses your browser&apos;s storage only for things the service needs, such as keeping you signed in and
              remembering saved cars and your comparison list. We do not use advertising or cross-site tracking cookies.
            </p>
          ),
        },
        {
          title: 'How long we keep it',
          body: (
            <p>
              We keep data for as long as your account is active and as needed to meet legal, tax and dispute
              requirements. When you delete your account, we remove or anonymise your personal data, except what we
              must keep by law.
            </p>
          ),
        },
        {
          title: 'Your rights',
          body: (
            <>
              <p>Under the GDPR you can ask to access, correct, delete or export your data, to restrict or object to certain uses, and to withdraw consent where we rely on it.</p>
              <p>
                You can delete your account yourself in Settings, or contact us through the <Link to="/help">Help centre</Link>.
                You also have the right to complain to your data protection authority, in Italy the Garante per la protezione dei dati personali.
              </p>
            </>
          ),
        },
        {
          title: 'Security and transfers',
          body: (
            <p>
              We protect data with access controls and encrypted connections. Some providers may process data outside
              the European Economic Area; where they do, we rely on recognised safeguards such as standard contractual clauses.
            </p>
          ),
        },
        {
          title: 'Changes',
          body: <p>If we make significant changes to this policy, we will tell you before they take effect.</p>,
        },
      ]}
    />
  );
}

export function Cancellation() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Cancellation Policy"
      lead="Every host chooses how flexible their car is. You always see the policy before you pay, and refunds are automatic."
      sections={[
        {
          title: 'How policies work',
          body: (
            <>
              <p>
                Each host picks one cancellation policy for their car: Flexible, Moderate or Strict. It is shown on the
                car page and again at checkout, so you know the rules before you pay.
              </p>
              <p>
                The policy you saw when you booked is locked in for your trip. If the host later changes their policy,
                it only affects future bookings.
              </p>
            </>
          ),
        },
        {
          title: 'The three policies',
          body: (
            <div className="space-y-4">
              {(['flexible', 'moderate', 'strict'] as const).map((p) => (
                <div key={p} className="rounded-xl border border-line bg-surface p-4">
                  <p className="font-display text-lg font-semibold text-ink">{POLICY_INFO[p].label}</p>
                  <ul className="mt-2">
                    {POLICY_INFO[p].rules.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              ))}
              <p>Time is counted to 00:00 on the day of pick-up.</p>
            </div>
          ),
        },
        {
          title: 'What gets refunded',
          body: (
            <>
              <p>
                The refund percentage applies to the total you paid for the trip, including the rental, the CX service
                fee, protection, any delivery fee and extras. If you used a discount, the refund is based on what you
                actually paid.
              </p>
              <p>A security deposit hold, if there is one, is released and is never charged when you cancel.</p>
            </>
          ),
        },
        {
          title: 'How to cancel',
          body: (
            <p>
              Open your trip and choose Cancel trip. Before you confirm, we show exactly how much you will be refunded.
              The refund goes back to the card you paid with automatically. Your bank or card issuer decides how long it
              takes to appear. The dates are released straight away so another renter can book the car.
            </p>
          ),
        },
        {
          title: 'If your host cancels',
          body: (
            <p>
              If a host cancels your trip, you always receive a full refund, whatever the policy says. We will also help
              you find another car through the <Link to="/help">Help centre</Link>.
            </p>
          ),
        },
        {
          title: 'After the trip has started',
          body: (
            <p>
              Once a trip has started it can no longer be cancelled online. If something has gone wrong, contact us
              through the <Link to="/help">Help centre</Link> and we will look at your situation with you and the host.
            </p>
          ),
        },
        {
          title: 'If a payment is not completed',
          body: (
            <p>
              A car is held for you while you check out. If you leave checkout or the payment is not completed, the hold
              expires automatically and the car becomes available again. You are not charged.
            </p>
          ),
        },
      ]}
    />
  );
}
