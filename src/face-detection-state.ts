import { DetectionPeriod, LivenessAction, LivenessActionStatus } from "./enums"
import { MotionLivenessDetector } from "./motion-liveness-detector"
import { ScreenCaptureDetector, stringToDetectionStrategy } from './screen-capture-detector'
import { ResolvedEngineOptions } from "./types"

/**
 * Internal detection state interface
 */
export class DetectionState {
    period: DetectionPeriod = DetectionPeriod.DETECT
    startTime: number = performance.now()
    collectCount: number = 0
    suspectedFraudsCount: number = 0
    bestQualityScore: number = 0
    bestFrameImage: string | null = null
    bestFaceImage: string | null = null
    completedActions: Set<LivenessAction> = new Set()
    currentAction: LivenessAction | null = null
    actionVerifyTimeout: ReturnType<typeof setTimeout> | null = null
    lastFrontalScore: number = 1
    motionDetector: MotionLivenessDetector | null = null
    liveness: boolean = false
    screenDetector: ScreenCaptureDetector | null = null

    constructor(options: Partial<DetectionState>) {
        Object.assign(this, options)
    }

    reset(): void {
        this.clearActionVerifyTimeout()
        
        const savedMotionDetector = this.motionDetector
        const savedScreenDetector = this.screenDetector

        savedMotionDetector?.reset()

        Object.assign(this, new DetectionState({}))

        this.motionDetector = savedMotionDetector
        this.screenDetector = savedScreenDetector
    }

    // 默认方法
    needFrontalFace(): boolean {
        return this.period !== DetectionPeriod.VERIFY
    }

    // 是否准备好进行动作验证
    isReadyToVerify(minCollectCount: number): boolean {
        if (this.period === DetectionPeriod.COLLECT 
            && this.liveness 
            && this.collectCount >= minCollectCount)
            {
            return true
            }
        return false
    }

    onActionStarted(nextAction: LivenessAction, timeoutMills: number, timeoutCallback: () => void): void {
        if(nextAction === null){
            return
        }        
        this.currentAction = nextAction
        this.clearActionVerifyTimeout()
        this.actionVerifyTimeout = setTimeout(timeoutCallback, timeoutMills)        
    }

    onActionCompleted(): void {
        if(this.currentAction === null) {
            return
        }
        this.clearActionVerifyTimeout()     
        this.completedActions.add(this.currentAction)
        this.currentAction = null
    }

    /**
     * Clear action verify timeout
     */
    private clearActionVerifyTimeout(): void {
        if (this.actionVerifyTimeout !== null) {
            clearTimeout(this.actionVerifyTimeout)
            this.actionVerifyTimeout = null
        }
    }    
}

 // <-- Add this import at the top if ResolvedEngineOptions is defined in types.ts

export function createDetectionState(options: ResolvedEngineOptions): DetectionState {
    const detectionState = new DetectionState({})
    detectionState.motionDetector = new MotionLivenessDetector({
        minMotionThreshold: options.motion_liveness_min_motion_score,
        minKeypointVariance: options.motion_liveness_min_keypoint_variance,
        frameBufferSize: options.motion_liveness_frame_buffer_size,
        eyeAspectRatioThreshold: options.motion_liveness_eye_aspect_ratio_threshold
    })
    detectionState.screenDetector = new ScreenCaptureDetector({
        confidenceThreshold: options.screen_capture_confidence_threshold,
        detectionStrategy: stringToDetectionStrategy(options.screen_capture_detection_strategy),
        moireThreshold: options.screen_moire_pattern_threshold,
        moireEnableDCT: options.screen_moire_pattern_enable_dct,
        moireEnableEdgeDetection: options.screen_moire_pattern_enable_edge_detection,
        colorSaturationThreshold: options.screen_color_saturation_threshold,
        colorRgbCorrelationThreshold: options.screen_color_rgb_correlation_threshold,
        colorPixelEntropyThreshold: options.screen_color_pixel_entropy_threshold,
        colorConfidenceThreshold: options.screen_color_confidence_threshold,
        rgbLowFreqStartPercent: options.screen_rgb_low_freq_start_percent,
        rgbLowFreqEndPercent: options.screen_rgb_low_freq_end_percent,
        rgbEnergyRatioNormalizationFactor: options.screen_rgb_energy_ratio_normalization_factor,
        rgbChannelDifferenceNormalizationFactor: options.screen_rgb_channel_difference_normalization_factor,
        rgbEnergyScoreWeight: options.screen_rgb_energy_score_weight,
        rgbAsymmetryScoreWeight: options.screen_rgb_asymmetry_score_weight,
        rgbDifferenceFactorWeight: options.screen_rgb_difference_factor_weight,
        rgbConfidenceThreshold: options.screen_rgb_confidence_threshold
    })
    return detectionState
}