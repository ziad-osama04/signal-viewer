import { Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import Medical from './pages/Medical'
import Acoustic from './pages/Acoustic'
import Finance from './pages/Finance'
import Microbiome from './pages/Microbiome'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/medical" element={<Medical />} />
      <Route path="/acoustic" element={<Acoustic />} />
      <Route path="/finance" element={<Finance />} />
      <Route path="/microbiome" element={<Microbiome />} />
    </Routes>
  )
}
