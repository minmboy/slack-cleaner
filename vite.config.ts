import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * The security policy for the built page, defined once here so the two ways it
 * gets applied can never drift apart:
 *
 *  - as a `<meta http-equiv>` tag in index.html, which works on any static host
 *    including GitHub Pages, where response headers cannot be set at all
 *  - as a `_headers` file, which Cloudflare Pages and Netlify turn into real
 *    response headers
 *
 * `connect-src` is the directive that matters: this page receives a Slack user
 * token, and pinning the only allowed destination means a tampered build could
 * not send it anywhere else.
 *
 * It is injected at build time only. In dev, `connect-src` would block Vite's
 * HMR websocket.
 */
const CSP_DIRECTIVES = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  'connect-src https://slack.com',
  "base-uri 'none'",
  "form-action 'none'",
]

/** Ignored inside a meta tag, so it is header-only. */
const HEADER_ONLY_DIRECTIVES = ["frame-ancestors 'none'"]

const EXTRA_HEADERS = [
  'Referrer-Policy: no-referrer',
  'X-Content-Type-Options: nosniff',
  'Cross-Origin-Opener-Policy: same-origin',
  'Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=(), usb=()',
]

function securityPolicy(): Plugin {
  return {
    name: 'security-policy',
    apply: 'build',

    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: CSP_DIRECTIVES.join('; '),
          },
          // Must precede the script and stylesheet it governs.
          injectTo: 'head-prepend',
        },
      ]
    },

    generateBundle() {
      const csp = [...CSP_DIRECTIVES, ...HEADER_ONLY_DIRECTIVES].join('; ')
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: ['/*', `  Content-Security-Policy: ${csp}`, ...EXTRA_HEADERS.map((line) => `  ${line}`), ''].join('\n'),
      })
    },
  }
}

export default defineConfig({
  // GitHub Pages serves from /<repo>/; set BASE_PATH in that workflow.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), securityPolicy()],
})
