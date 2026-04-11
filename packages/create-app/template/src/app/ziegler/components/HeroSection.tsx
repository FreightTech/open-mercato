'use client'

import { useT } from '@open-mercato/shared/lib/i18n/context'
import { translateWithFallback } from '@open-mercato/shared/lib/i18n/translate'

const VIDEO_SRC = 'https://www.zieglergroup.com/wp-content/themes/zieglergroup/corporate_video_short.mp4'
const VIDEO_POSTER = 'https://www.zieglergroup.com/wp-content/uploads/2021/07/YT-thumbnail.jpg'

export function HeroSection() {
  const t = useT()
  const translate = (key: string, fallback: string) => translateWithFallback(t, key, fallback)

  return (
    <section className="relative w-full overflow-hidden" style={{ height: '466px' }}>
      {/* Video background */}
      <video
        autoPlay
        loop
        muted
        playsInline
        poster={VIDEO_POSTER}
        className="absolute inset-0 h-full w-full object-cover"
      >
        <source src={VIDEO_SRC} type="video/mp4" />
      </video>

      {/* Diagonal teal overlay (left shape) - polygon matching original */}
      <div
        className="absolute inset-0 z-[98] hidden md:block"
        style={{
          right: 'calc(100% - 62%)',
          clipPath: 'polygon(0% 0%, 100% 0px, 100% 0px, 54.3% 100%, 0% 100%)',
          background: 'linear-gradient(rgb(6, 106, 93) 0%, rgba(6, 106, 93, 0.72) 25%, rgba(6, 106, 93, 0.72) 100%)',
          width: '62%',
        }}
      />

      {/* Small triangle overlay (bottom-right) */}
      <div
        className="absolute bottom-0 right-0 z-[98] hidden md:block"
        style={{
          clipPath: 'polygon(100% 0px, 0px 100%, 100% 100%)',
          backgroundColor: 'rgba(6, 106, 93, 0.72)',
          width: '14.5%',
          height: '58%',
        }}
      />

      {/* Mobile: full teal bg */}
      <div className="absolute inset-0 bg-[#066A5D] md:hidden" />

      {/* Content - positioned over the teal overlay, aligned to top */}
      <div className="relative z-[100] mx-auto h-full max-w-[1280px] px-6 lg:px-[104px]">
        <div className="max-w-[500px] pt-[44px] text-white">
          <div className="text-[12px] font-bold leading-[20px] tracking-[0.12px]">
            {translate('hero.subtitle', 'ZIEGLER GROUP \u2014 Est. 1908 in Belgium')}
          </div>
          <h1 className="mb-[16px] mt-0 text-[28px] font-bold leading-[36px] tracking-[0.18px] lg:text-[36px] lg:leading-[48px]">
            {translate('hero.title', 'Logistics beyond limits')}
          </h1>
          <p className="text-[16px] font-normal leading-[26px] tracking-[0.2px] lg:text-[20px] lg:leading-[30px]">
            {translate('hero.description', 'We offer international logistics services and multimodal transport by road, sea, air, rail and inland waterway under Ziegler Group.')}
          </p>
        </div>
      </div>
    </section>
  )
}
