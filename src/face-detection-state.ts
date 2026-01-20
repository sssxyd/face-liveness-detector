import { DetectionPeriod, LivenessAction } from "./enums"
import { FaceDetectionEngine } from "./face-detection-engine"
import { MotionLivenessDetector } from "./motion-liveness-detector"

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

    constructor(options: Partial<DetectionState>) {
        Object.assign(this, options)
    }

    reset(): void {
        this.clearActionVerifyTimeout()

        const savedMotionDetector = this.motionDetector

        savedMotionDetector?.reset()

        Object.assign(this, new DetectionState({}))

        this.motionDetector = savedMotionDetector
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

export function createDetectionState(engine: FaceDetectionEngine): DetectionState {
    const detectionState = new DetectionState({})
    detectionState.motionDetector = new MotionLivenessDetector()
    detectionState.motionDetector.setEmitDebug(engine.emitDebug.bind(engine))
    return detectionState
}