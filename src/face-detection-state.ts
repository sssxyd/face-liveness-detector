import { DetectionPeriod, LivenessAction } from "./enums"
import { FaceDetectionEngine } from "./face-detection-engine"
import { FaceMovingDetector } from "./face-moving-detector"
import { PhotoAttackDetector } from "./photo-attack-detector"
import { ScreenAttackDetector } from "./screen-attach-detector"

/**
 * Internal detection state interface
 */
export class DetectionState {
    period: DetectionPeriod = DetectionPeriod.DETECT
    startTime: number = performance.now()
    collectCount: number = 0
    bestQualityScore: number = 0
    bestFrameImage: string | null = null
    bestFaceImage: string | null = null
    completedActions: Set<LivenessAction> = new Set()
    currentAction: LivenessAction | null = null
    actionVerifyTimeout: ReturnType<typeof setTimeout> | null = null
    lastFrontalScore: number = 1
    faceMovingDetector: FaceMovingDetector | null = null
    photoAttackDetector: PhotoAttackDetector | null = null
    screenAttachDetector: ScreenAttackDetector | null = null
    liveness: boolean = false
    realness: boolean = false

    constructor(options: Partial<DetectionState>) {
        Object.assign(this, options)
    }

    reset(): void {
        this.clearActionVerifyTimeout()

        const savedFaceMovingDetector = this.faceMovingDetector
        const savedPhotoAttackDetector = this.photoAttackDetector
        const savedScreenAttackDetector = this.screenAttachDetector

        savedFaceMovingDetector?.reset()
        savedPhotoAttackDetector?.reset()
        savedScreenAttackDetector?.reset()

        Object.assign(this, new DetectionState({}))

        this.faceMovingDetector = savedFaceMovingDetector
        this.photoAttackDetector = savedPhotoAttackDetector
        this.screenAttachDetector = savedScreenAttackDetector
    }

    setOpenCv(opencv: any): void {
        this.screenAttachDetector?.setOpencv(opencv)
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

export function createDetectionState(engine: FaceDetectionEngine): DetectionState {
    const detectionState = new DetectionState({})
    detectionState.faceMovingDetector = new FaceMovingDetector()
    detectionState.faceMovingDetector.setEmitDebug(engine.emitDebug.bind(engine))
    detectionState.photoAttackDetector = new PhotoAttackDetector()
    detectionState.photoAttackDetector.setEmitDebug(engine.emitDebug.bind(engine))
    detectionState.screenAttachDetector = new ScreenAttackDetector()
    detectionState.screenAttachDetector.setOpencv(cv)
    detectionState.screenAttachDetector.setEmitDebug(engine.emitDebug.bind(engine))
    return detectionState
}