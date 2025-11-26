/**
 * Event Emitter tests
 */

import { SimpleEventEmitter } from '../event-emitter'

describe('SimpleEventEmitter', () => {
  let emitter: SimpleEventEmitter

  beforeEach(() => {
    emitter = new SimpleEventEmitter()
  })

  describe('on', () => {
    it('should register event listener', () => {
      const listener = jest.fn()
      emitter.on('detector-loaded' as any, listener)
      expect(emitter.listenerCount('detector-loaded' as any)).toBe(1)
    })

    it('should allow multiple listeners for same event', () => {
      const listener1 = jest.fn()
      const listener2 = jest.fn()
      emitter.on('detector-loaded' as any, listener1)
      emitter.on('detector-loaded' as any, listener2)
      expect(emitter.listenerCount('detector-loaded' as any)).toBe(2)
    })

    it('should call listener when event is emitted', () => {
      const listener = jest.fn()
      emitter.on('detector-loaded' as any, listener)
      emitter.emit('detector-loaded' as any, { success: true })
      expect(listener).toHaveBeenCalledWith({ success: true })
    })

    it('should pass data to listener', () => {
      const listener = jest.fn()
      const data = { success: true, message: 'test' }
      emitter.on('detector-loaded' as any, listener)
      emitter.emit('detector-loaded' as any, data)
      expect(listener).toHaveBeenCalledWith(data)
    })
  })

  describe('off', () => {
    it('should remove event listener', () => {
      const listener = jest.fn()
      emitter.on('detector-loaded' as any, listener)
      emitter.off('detector-loaded' as any, listener)
      expect(emitter.listenerCount('detector-loaded' as any)).toBe(0)
    })

    it('should remove specific listener', () => {
      const listener1 = jest.fn()
      const listener2 = jest.fn()
      emitter.on('detector-loaded' as any, listener1)
      emitter.on('detector-loaded' as any, listener2)
      emitter.off('detector-loaded' as any, listener1)
      expect(emitter.listenerCount('detector-loaded' as any)).toBe(1)
      emitter.emit('detector-loaded' as any, {})
      expect(listener1).not.toHaveBeenCalled()
      expect(listener2).toHaveBeenCalled()
    })
  })

  describe('once', () => {
    it('should register listener that fires once', () => {
      const listener = jest.fn()
      emitter.once('detector-loaded' as any, listener)
      emitter.emit('detector-loaded' as any, {})
      emitter.emit('detector-loaded' as any, {})
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('should auto-remove after first emit', () => {
      const listener = jest.fn()
      emitter.once('detector-loaded' as any, listener)
      expect(emitter.listenerCount('detector-loaded' as any)).toBe(1)
      emitter.emit('detector-loaded' as any, {})
      expect(emitter.listenerCount('detector-loaded' as any)).toBe(0)
    })
  })

  describe('emit', () => {
    it('should emit event to all listeners', () => {
      const listener1 = jest.fn()
      const listener2 = jest.fn()
      emitter.on('detector-loaded' as any, listener1)
      emitter.on('detector-loaded' as any, listener2)
      emitter.emit('detector-loaded' as any, {})
      expect(listener1).toHaveBeenCalled()
      expect(listener2).toHaveBeenCalled()
    })

    it('should handle listener errors gracefully', () => {
      const errorListener = jest.fn(() => {
        throw new Error('test error')
      })
      const normalListener = jest.fn()
      emitter.on('detector-loaded' as any, errorListener)
      emitter.on('detector-loaded' as any, normalListener)

      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      // Should not throw
      expect(() => {
        emitter.emit('detector-loaded' as any, {})
      }).not.toThrow()

      consoleSpy.mockRestore()

      expect(errorListener).toHaveBeenCalled()
      expect(normalListener).toHaveBeenCalled()
    })
  })

  describe('removeAllListeners', () => {
    it('should remove all listeners for specific event', () => {
      const listener1 = jest.fn()
      const listener2 = jest.fn()
      emitter.on('detector-loaded' as any, listener1)
      emitter.on('detector-loaded' as any, listener2)
      emitter.removeAllListeners('detector-loaded' as any)
      expect(emitter.listenerCount('detector-loaded' as any)).toBe(0)
    })

    it('should remove all listeners for all events', () => {
      emitter.on('detector-loaded' as any, jest.fn())
      emitter.on('face-detected' as any, jest.fn())
      emitter.removeAllListeners()
      expect(emitter.listenerCount('detector-loaded' as any)).toBe(0)
      expect(emitter.listenerCount('face-detected' as any)).toBe(0)
    })
  })

  describe('listenerCount', () => {
    it('should return correct listener count', () => {
      expect(emitter.listenerCount('detector-loaded' as any)).toBe(0)
      emitter.on('detector-loaded' as any, jest.fn())
      expect(emitter.listenerCount('detector-loaded' as any)).toBe(1)
      emitter.on('detector-loaded' as any, jest.fn())
      expect(emitter.listenerCount('detector-loaded' as any)).toBe(2)
    })
  })
})
