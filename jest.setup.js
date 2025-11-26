// jest.setup.js - Jest 初始化文件

// Polyfill for structuredClone if not available
if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = (obj) => JSON.parse(JSON.stringify(obj))
}

// Mock HTMLCanvasElement
HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
  drawImage: jest.fn(),
  fillRect: jest.fn(),
  clearRect: jest.fn(),
  getImageData: jest.fn(),
  putImageData: jest.fn(),
  createImageData: jest.fn(),
  setTransform: jest.fn(),
  transform: jest.fn(),
  resetTransform: jest.fn(),
  rotate: jest.fn(),
  scale: jest.fn(),
  translate: jest.fn(),
  fillText: jest.fn(),
  strokeText: jest.fn(),
  measureText: jest.fn(() => ({ width: 0 })),
}))

HTMLCanvasElement.prototype.toDataURL = jest.fn(() => 'data:image/jpeg;base64,fake')

// Mock HTMLVideoElement 属性
Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
  get: jest.fn(() => 640),
})

Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
  get: jest.fn(() => 480),
})

Object.defineProperty(HTMLVideoElement.prototype, 'readyState', {
  get: jest.fn(() => 2), // HAVE_CURRENT_DATA
})

// Mock getUserMedia
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: jest.fn(() =>
      Promise.resolve({
        getTracks: jest.fn(() => [
          {
            stop: jest.fn(),
            getSettings: jest.fn(() => ({
              width: 640,
              height: 480,
            })),
          },
        ]),
        getVideoTracks: jest.fn(() => [
          {
            getSettings: jest.fn(() => ({
              width: 640,
              height: 480,
            })),
          },
        ]),
      })
    ),
  },
  writable: true,
})

// Mock setTimeout/requestAnimationFrame
jest.useFakeTimers()
