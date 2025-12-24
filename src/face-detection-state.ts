import { DetectionPeriod, LivenessAction, LivenessActionStatus } from "./enums"
import { MotionLivenessDetector } from "./motion-liveness-detector"
import { ScreenCaptureDetector } from './screen-capture-detector'
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
    realness: boolean = false
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

    updateVideoFPS(fps: number): void {
        if(this.screenDetector === null){
            this.screenDetector = new ScreenCaptureDetector(fps)
            return
        }
        if(this.screenDetector.getFPS() !== fps){
            this.screenDetector.reset()
            this.screenDetector = new ScreenCaptureDetector(fps)
        }
    }

    // 默认方法
    needFrontalFace(): boolean {
        return this.period !== DetectionPeriod.VERIFY
    }

    // 是否准备好进行动作验证
    isReadyToVerify(minCollectCount: number): boolean {
        if (this.period === DetectionPeriod.COLLECT 
            && this.liveness && this.realness
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

    setCVInstance(cvInstance: any): void {
        this.motionDetector?.setCVInstance(cvInstance)
        this.screenDetector?.setCVInstance(cvInstance)
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

export function createDetectionState(options: ResolvedEngineOptions, fps: number): DetectionState {
    const detectionState = new DetectionState({})
    detectionState.motionDetector = new MotionLivenessDetector(options.motion_liveness_strict_photo_detection)
    detectionState.screenDetector = new ScreenCaptureDetector(fps)
    return detectionState
}