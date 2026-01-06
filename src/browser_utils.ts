
/**
 * 将绘制图片的canvas转换为mat
 * @param {any} cv OpenCV实例
 * @param {HTMLCanvasElement} canvas canvas元素
 * @param {boolean} gray 是否转换为灰度图像
 * @param {any} dstMat 可选的目标Mat对象，如果提供则复用该对象，否则创建新对象
 * @returns {any | null} - 转换后的Mat对象，如果转换失败则返回null
 */
export function drawCanvasToMat(cv: any, canvas: HTMLCanvasElement, gray: boolean, dstMat?: any): any | null {
    try {
        if(!cv || !canvas){
            return null
        }
        
        // If destination Mat is provided, reuse it; otherwise create new one
        let mat: any
        if (dstMat) {
            // Read canvas data into existing Mat
            cv.imread(canvas, dstMat)
            mat = dstMat
        } else {
            // Create new Mat
            mat = cv.imread(canvas)
        }
        
        if (!mat || mat.empty()) {
            return null
        }
        if(gray){
            cv.cvtColor(mat, mat, cv.COLOR_BGR2GRAY)
        }
        return mat
    } catch (e) {
        return null
    }
}

export function matToGray(cv: any, mat: any): any | null {
    try {
        if (!cv || !mat || mat.empty()) {
            return null
        }
        const grayMat = new cv.Mat()
        cv.cvtColor(mat, grayMat, cv.COLOR_BGR2GRAY)
        return grayMat
    } catch (e) {
        return null
    }
}

/**
 * Convert OpenCV Mat to Base64 JPEG image
 * @param {any} cv - OpenCV instance
 * @param {any} mat - OpenCV Mat object
 * @param {number} quality - JPEG quality (0-1), default 0.9
 * @returns {string | null} Base64 encoded JPEG image data
 */
export function matToBase64Jpeg(cv: any, mat: any, quality: number = 0.9): string | null {
    try {
        if (!cv || !mat || mat.empty()) {
            return null
        }

        // Create temporary canvas to hold the Mat
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = mat.cols
        tempCanvas.height = mat.rows

        // Convert Mat back to canvas using imshow
        cv.imshow(tempCanvas, mat)

        // Convert canvas to Base64 JPEG
        const base64Data = tempCanvas.toDataURL('image/jpeg', quality)

        // Properly clean up canvas
        const ctx = tempCanvas.getContext('2d')
        if (ctx) {
            ctx.clearRect(0, 0, tempCanvas.width, tempCanvas.height)
        }
        tempCanvas.width = 0
        tempCanvas.height = 0

        return base64Data
    } catch (e) {
        return null
    }
}