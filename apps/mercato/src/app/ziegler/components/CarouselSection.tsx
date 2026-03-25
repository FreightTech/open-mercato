'use client'

import { useState, useEffect, useCallback } from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { translateWithFallback } from '@open-mercato/shared/lib/i18n/translate'

const ZIEGLER_CDN = 'https://www.zieglergroup.com/wp-content/uploads'

const slides = [
  {
    id: 'aboutUs',
    image: `${ZIEGLER_CDN}/2021/09/HighlightAbout_us.jpg`,
  },
  {
    id: 'career',
    image: `${ZIEGLER_CDN}/2021/10/Highlight-Career.jpg`,
  },
  {
    id: 'ethics',
    image: `${ZIEGLER_CDN}/2021/09/Highlight-Code_of_Ethics.jpg`,
  },
]

export function CarouselSection() {
  const t = useT()
  const translate = (key: string, fallback: string) => translateWithFallback(t, key, fallback)
  const [activeIndex, setActiveIndex] = useState(0)

  const next = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % slides.length)
  }, [])

  const prev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length)
  }, [])

  useEffect(() => {
    const timer = setInterval(next, 6000)
    return () => clearInterval(timer)
  }, [next])

  const activeSlide = slides[activeIndex]

  return (
    <section className="bg-[#EDF2F7] pb-[56px]">
      <div className="mx-auto max-w-[1280px] px-6 lg:px-[116px]">
        <div className="relative">
          {/* Slide image - horizontal slide animation */}
          <div className="relative h-[280px] overflow-hidden lg:h-[440px]">
            <div
              className="flex h-full transition-transform duration-500 ease-in-out"
              style={{ width: `${slides.length * 100}%`, transform: `translateX(-${activeIndex * (100 / slides.length)}%)` }}
            >
              {slides.map((slide) => (
                <div key={slide.id} className="h-full shrink-0" style={{ width: `${100 / slides.length}%` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slide.image}
                    alt={translate(`carousel.${slide.id}.title`, slide.id)}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Content row below image */}
          <div className="relative mt-[56px] flex flex-col gap-6 lg:flex-row lg:gap-0">
            {/* Title */}
            <h2 className="shrink-0 text-[18px] font-bold leading-[32px] tracking-[0.2px] text-[#066A5D] lg:w-[268px] lg:text-[20px]">
              {translate(`carousel.${activeSlide.id}.title`, activeSlide.id)}
            </h2>

            {/* Description */}
            <p className="text-[16px] leading-[28px] tracking-[0.18px] text-[#718096] lg:ml-[16px] lg:mr-auto lg:max-w-[447px] lg:text-[18px]">
              {translate(`carousel.${activeSlide.id}.description`, '')}
            </p>

            {/* Navigation switcher - positioned at top right on desktop */}
            <div className="flex h-[32px] w-[168px] shrink-0 items-center self-start overflow-hidden rounded-[4px] border border-[#066A5D] lg:absolute lg:right-0 lg:top-0">
              <button
                onClick={prev}
                className="flex h-full w-[37px] items-center justify-center border-r border-[#066A5D] text-[#066A5D] transition-colors hover:bg-[#066A5D]/10"
                aria-label="Previous slide"
              >
                <svg width="18" height="19" viewBox="0 0 18 19" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M11.25 3.5L5.625 9.125L11.25 14.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div className="flex flex-1 items-center justify-center text-[14px] font-bold leading-[20px] text-[#066A5D]">
                {activeIndex + 1} / {slides.length}
              </div>
              <button
                onClick={next}
                className="flex h-full w-[37px] items-center justify-center border-l border-[#066A5D] text-[#066A5D] transition-colors hover:bg-[#066A5D]/10"
                aria-label="Next slide"
              >
                <svg width="18" height="19" viewBox="0 0 18 19" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6.75 14.75L12.375 9.125L6.75 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
