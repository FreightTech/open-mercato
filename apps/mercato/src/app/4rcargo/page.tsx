import Link from 'next/link'
import Image from 'next/image'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'

export default async function FRCargoHome() {
  const { t } = await resolveTranslations()

  return (
    <main className="min-h-svh w-full">
      {/* Header - Dark Navy */}
      <header className="sticky top-0 z-50 bg-[#00002a]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
          <Link href="/" className="flex items-center">
            <Image
              src="/fms/4rcargo-logo-white.png"
              alt="4R Cargo"
              width={140}
              height={32}
              priority
            />
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            <a href="#values" className="text-sm font-medium text-white/80 transition-colors hover:text-white">
              About
            </a>
            <Link
              href="/login"
              className="rounded-full bg-[#9565f5] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#8050e0]"
            >
              {t('app.landing.signIn', 'Sign in')}
            </Link>
          </nav>

          {/* Mobile menu button */}
          <Link
            href="/login"
            className="rounded-full bg-[#9565f5] px-4 py-2 text-sm font-medium text-white md:hidden"
          >
            {t('app.landing.signIn', 'Sign in')}
          </Link>
        </div>
      </header>

      {/* Hero Section - Gradient */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#00002a] via-[#1a1a4a] to-[#2d1f5c]">
        {/* Abstract gradient blobs */}
        <div
          className="pointer-events-none absolute right-[10%] top-[20%] h-[500px] w-[500px] rounded-full opacity-30"
          style={{
            background: 'radial-gradient(circle, rgba(149, 101, 245, 0.6) 0%, rgba(149, 101, 245, 0.2) 40%, transparent 70%)',
            filter: 'blur(60px)',
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute left-[5%] bottom-[10%] h-[400px] w-[400px] rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle, rgba(149, 101, 245, 0.5) 0%, transparent 60%)',
            filter: 'blur(80px)',
          }}
          aria-hidden="true"
        />

        <div className="relative z-10 mx-auto max-w-7xl px-6 py-24 lg:px-8 lg:py-32">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              {t('app.landing.hero.title', 'Air Freight Solutions')}
            </h1>
            <p className="mt-4 text-xl font-medium text-[#9565f5]">
              {t('app.landing.hero.subtitle', 'Connecting Airlines & Freight Forwarders')}
            </p>
            <p className="mt-6 text-lg leading-relaxed text-white/70">
              {t('app.landing.hero.description', 'We help logistics teams streamline their air cargo operations with a focused, customer-centric approach to GSSA services.')}
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                href="/onboarding"
                className="inline-flex items-center rounded-full border-2 border-[#9565f5] bg-[#9565f5] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[#8050e0] hover:border-[#8050e0]"
              >
                {t('app.landing.getStarted', 'Get Started')}
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center rounded-full border-2 border-white/30 bg-transparent px-6 py-3 text-base font-semibold text-white transition-colors hover:border-white hover:bg-white/10"
              >
                {t('app.landing.signIn', 'Sign in')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* WE ARE 4R - Values Section */}
      <section id="values" className="bg-[#fbfbfd] py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
            {t('app.landing.values.title', 'WE ARE')}{' '}
            <span className="text-[#9565f5]">{t('app.landing.values.titleAccent', '4R')}</span>
          </h2>

          <div className="mt-16 grid gap-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-16">
            {/* Responsible */}
            <div className="group flex min-h-[240px] flex-col justify-between">
              <div>
                <div className="text-6xl font-bold text-[#c4b5fd] lg:text-7xl">
                  01.
                </div>
                <h3 className="mt-6 text-sm font-bold uppercase tracking-widest text-gray-800">
                  {t('app.landing.values.responsible.title', 'RESPONSIBLE')}
                </h3>
                <p className="mt-4 text-xs uppercase tracking-wider leading-relaxed text-gray-500">
                  {t('app.landing.values.responsible.description', 'We approach every customer with greatest care, attention and professionalism. Our aim is to deliver seamless service to all parties in supply chain.')}
                </p>
              </div>
              <div className="mt-8 h-0.5 w-4/5 bg-[#c4b5fd]" />
            </div>

            {/* Reliable */}
            <div className="group flex min-h-[240px] flex-col justify-between">
              <div>
                <div className="text-6xl font-bold text-[#c4b5fd] lg:text-7xl">
                  02.
                </div>
                <h3 className="mt-6 text-sm font-bold uppercase tracking-widest text-gray-800">
                  {t('app.landing.values.reliable.title', 'RELIABLE')}
                </h3>
                <p className="mt-4 text-xs uppercase tracking-wider leading-relaxed text-gray-500">
                  {t('app.landing.values.reliable.description', 'Always there whenever needed - supporting our customers throughout the entire process.')}
                </p>
              </div>
              <div className="mt-8 h-0.5 w-4/5 bg-[#c4b5fd]" />
            </div>

            {/* Resilient */}
            <div className="group flex min-h-[240px] flex-col justify-between">
              <div>
                <div className="text-6xl font-bold text-[#c4b5fd] lg:text-7xl">
                  03.
                </div>
                <h3 className="mt-6 text-sm font-bold uppercase tracking-widest text-gray-800">
                  {t('app.landing.values.resilient.title', 'RESILIENT')}
                </h3>
                <p className="mt-4 text-xs uppercase tracking-wider leading-relaxed text-gray-500">
                  {t('app.landing.values.resilient.description', 'We thrive under pressure. Every challenge is opportunity to grow.')}
                </p>
              </div>
              <div className="mt-8 h-0.5 w-4/5 bg-[#c4b5fd]" />
            </div>

            {/* Remarkable */}
            <div className="group flex min-h-[240px] flex-col justify-between">
              <div>
                <div className="text-6xl font-bold text-[#c4b5fd] lg:text-7xl">
                  04.
                </div>
                <h3 className="mt-6 text-sm font-bold uppercase tracking-widest text-gray-800">
                  {t('app.landing.values.remarkable.title', 'REMARKABLE')}
                </h3>
                <p className="mt-4 text-xs uppercase tracking-wider leading-relaxed text-gray-500">
                  {t('app.landing.values.remarkable.description', 'We truly believe we can make difference for our customers by adding value in supply chain.')}
                </p>
              </div>
              <div className="mt-8 h-0.5 w-4/5 bg-[#c4b5fd]" />
            </div>
          </div>
        </div>
      </section>

      {/* Footer - Dark Navy */}
      <footer className="bg-[#00002a] py-8">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-white/60">
            <Link href="/login" className="transition-colors hover:text-white hover:underline">
              {t('app.landing.footer.login', 'Login')}
            </Link>
          </div>
          <div className="mt-6 text-center text-xs text-white/40">
            Powered by Open Mercato
          </div>
        </div>
      </footer>
    </main>
  )
}
