import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { startTranslator } from './i18n/runtime.js'
import { installDatePicker } from './flow1/datePicker.js'
// Giao diện điện thoại: nạp sau cùng để ghi đè các file CSS khác
import './mobile.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
void startTranslator()
installDatePicker()
