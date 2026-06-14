import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app/App.tsx'
import type { Configuration } from '@cesdk/cesdk-js';

const editorConfig: Configuration = {
  userId: 'starterkit-start-with-video-user',
  theme: 'dark',
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App config={editorConfig} />
  </StrictMode>,
)
