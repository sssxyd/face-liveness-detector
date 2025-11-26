/**
 * Enums tests
 */

import { LivenessAction, LivenessActionStatus, DetectionPeriod, PromptCode, ErrorCode } from '../enums'

describe('Enumerations', () => {
  describe('LivenessAction', () => {
    it('should have required action values', () => {
      expect(LivenessAction.BLINK).toBe('blink')
      expect(LivenessAction.MOUTH_OPEN).toBe('mouth_open')
      expect(LivenessAction.NOD).toBe('nod')
    })

    it('should have 3 action types', () => {
      const actions = Object.values(LivenessAction)
      expect(actions.length).toBe(3)
    })
  })

  describe('LivenessActionStatus', () => {
    it('should have required status values', () => {
      expect(LivenessActionStatus.STARTED).toBe('started')
      expect(LivenessActionStatus.COMPLETED).toBe('completed')
      expect(LivenessActionStatus.TIMEOUT).toBe('timeout')
    })
  })

  describe('DetectionPeriod', () => {
    it('should have required period values', () => {
      expect(DetectionPeriod.DETECT).toBe('detect')
      expect(DetectionPeriod.COLLECT).toBe('collect')
      expect(DetectionPeriod.VERIFY).toBe('verify')
    })
  })

  describe('PromptCode', () => {
    it('should have all prompt codes', () => {
      expect(PromptCode.NO_FACE).toBe('NO_FACE')
      expect(PromptCode.MULTIPLE_FACE).toBe('MULTIPLE_FACE')
      expect(PromptCode.FACE_TOO_SMALL).toBe('FACE_TOO_SMALL')
      expect(PromptCode.FACE_TOO_LARGE).toBe('FACE_TOO_LARGE')
      expect(PromptCode.FACE_NOT_FRONTAL).toBe('FACE_NOT_FRONTAL')
      expect(PromptCode.IMAGE_QUALITY_LOW).toBe('IMAGE_QUALITY_LOW')
      expect(PromptCode.FRAME_DETECTED).toBe('FRAME_DETECTED')
    })
  })

  describe('ErrorCode', () => {
    it('should have all error codes', () => {
      expect(ErrorCode.DETECTOR_NOT_INITIALIZED).toBe('DETECTOR_NOT_INITIALIZED')
      expect(ErrorCode.CAMERA_ACCESS_DENIED).toBe('CAMERA_ACCESS_DENIED')
      expect(ErrorCode.STREAM_ACQUISITION_FAILED).toBe('STREAM_ACQUISITION_FAILED')
      expect(ErrorCode.SUSPECTED_FRAUDS_DETECTED).toBe('SUSPECTED_FRAUDS_DETECTED')
    })
  })
})
