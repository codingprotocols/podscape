import React, { useEffect } from 'react'
import { useAppStore } from './store'
import Layout from './components/core/Layout'
import SectionRouter from './components/core/SectionRouter'
import OverlayManager from './components/core/OverlayManager'
import { prefetchPanels } from './utils/prefetch'

export default function App(): JSX.Element {
  const init = useAppStore(s => s.init)

  useEffect(() => {
    init()
    prefetchPanels()
  }, [init])

  return (
    <Layout>
      <SectionRouter />
      <OverlayManager />
    </Layout>
  )
}
