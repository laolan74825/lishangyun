import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'

Object.defineProperty(window, 'scrollTo', {
  value: () => {},
  writable: true,
})

if (typeof URL.createObjectURL === 'undefined') {
  Object.defineProperty(URL, 'createObjectURL', {
    value: () => 'blob:mock-url',
    writable: true,
  })
}

if (typeof URL.revokeObjectURL === 'undefined') {
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: () => {},
    writable: true,
  })
}
