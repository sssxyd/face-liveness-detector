/**
 * Face Detection Engine - Event Emitter
 * Generic event emitter implementation
 */

import type { EventListener, EventMap } from './types'

/**
 * Generic event emitter implementation
 * Provides on, off, once, and emit methods for event-driven architecture
 */
export class SimpleEventEmitter {
  private listeners: Map<string, Set<Function>> = new Map()

  /**
   * Register an event listener
   * @param event - Event name
   * @param listener - Listener callback
   */
  on<K extends keyof EventMap>(event: K, listener: EventListener<EventMap[K]>): void {
    if (!this.listeners.has(String(event))) {
      this.listeners.set(String(event), new Set())
    }
    this.listeners.get(String(event))!.add(listener as Function)
  }

  /**
   * Remove an event listener
   * @param event - Event name
   * @param listener - Listener callback to remove
   */
  off<K extends keyof EventMap>(event: K, listener: EventListener<EventMap[K]>): void {
    const set = this.listeners.get(String(event))
    if (set) {
      set.delete(listener as Function)
    }
  }

  /**
   * Register a one-time event listener
   * @param event - Event name
   * @param listener - Listener callback (will be called once)
   */
  once<K extends keyof EventMap>(event: K, listener: EventListener<EventMap[K]>): void {
    const wrappedListener = (data: EventMap[K]) => {
      listener(data)
      this.off(event, wrappedListener as any)
    }
    this.on(event, wrappedListener as any)
  }

  /**
   * Emit an event
   * @param event - Event name
   * @param data - Event data
   */
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const set = this.listeners.get(String(event))
    if (set) {
      set.forEach(listener => {
        try {
          ;(listener as Function)(data)
        } catch (error) {
          console.error(`Error in event listener for ${String(event)}:`, error)
        }
      })
    }
  }

  /**
   * Remove all listeners for an event or all events
   * @param event - Event name (optional, if not provided, clears all)
   */
  removeAllListeners(event?: keyof EventMap): void {
    if (event === undefined) {
      this.listeners.clear()
    } else {
      this.listeners.delete(String(event))
    }
  }

  /**
   * Get count of listeners for an event
   * @param event - Event name
   * @returns Number of listeners
   */
  listenerCount<K extends keyof EventMap>(event: K): number {
    return this.listeners.get(String(event))?.size ?? 0
  }
}
