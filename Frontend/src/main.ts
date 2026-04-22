import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import '@fontsource/teko'
import '@fontsource/ubuntu'
import '@fontsource/aleo'
import '@fontsource-variable/dm-sans'

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
