const assert = require('node:assert/strict')
const { test } = require('node:test')
const React = require('react')
const { create, act } = require('react-test-renderer')
const { StorageDownloader, StorageUtils } = require('@bsv/sdk')

const storage = new Map()
Object.defineProperty(globalThis, 'sessionStorage', {
  value: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  }
})
const { Img, Source } = require('..')
const { useStore } = require('../dist/store.js')
const resolve = url => useStore.getState().setResolvedURL(url)

test('passes plain image and media URLs through and preserves their attributes', async () => {
  const src = 'https://cdn.example/picture.png'
  await resolve(src)
  const image = create(React.createElement(Img, { src, alt: 'Wallet badge' }))
  const source = create(React.createElement(Source, { src, type: 'image/png' }))
  assert.deepEqual(image.toJSON().props, { src, alt: 'Wallet badge' })
  assert.deepEqual(source.toJSON().props, { src, type: 'image/png' })
  image.unmount()
  source.unmount()
})

test('shows fallbacks, retries unavailable UHRP content and shares each lookup', async t => {
  const src = StorageUtils.getURLForHash(new Array(32).fill(3))
  const resolved = 'https://cdn.example/content'
  const fallback = React.createElement('span', null, 'Loading media')
  let attempts = 0
  const lookup = t.mock.method(StorageDownloader.prototype, 'resolve', async url => {
    assert.equal(url, src)
    attempts++
    if (attempts === 1) throw new Error('provider unavailable')
    if (attempts === 2) return []
    return [resolved]
  })
  t.mock.method(console, 'error', () => {})
  let image
  let source
  await act(async () => {
    image = create(React.createElement(Img, { src, fallback }))
    source = create(React.createElement(Source, { src, loading: fallback }))
  })
  assert.equal(attempts, 1)
  assert.deepEqual(image.toJSON().children, ['Loading media'])
  assert.deepEqual(source.toJSON().children, ['Loading media'])
  await act(async () => resolve(src))
  assert.deepEqual(image.toJSON().children, ['Loading media'])
  await act(async () => Promise.all([resolve(src), resolve(src)]))
  await resolve(src)
  assert.equal(lookup.mock.callCount(), 3)
  assert.equal(image.toJSON().props.src, resolved)
  assert.equal(source.toJSON().props.src, resolved)
  assert.equal(JSON.parse(storage.get('uhrp-react-session')).state.urls[src], resolved)
  image.unmount()
  source.unmount()
})
