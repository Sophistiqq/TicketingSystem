import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import '@fontsource-variable/inter'
import '@fontsource-variable/plus-jakarta-sans'

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
