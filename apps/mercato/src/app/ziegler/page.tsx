import { Header } from './components/Header'
import { HeroSection } from './components/HeroSection'
import { SupplyChainSection } from './components/SupplyChainSection'
import { StatsSection } from './components/StatsSection'
import { CarouselSection } from './components/CarouselSection'
import { Footer } from './components/Footer'

export default function ZieglerHome() {
  return (
    <main className="min-h-svh w-full bg-white">
      <Header />
      <HeroSection />
      <SupplyChainSection />
      <StatsSection />
      <CarouselSection />
      <Footer />
    </main>
  )
}
