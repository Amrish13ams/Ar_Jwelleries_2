'use client'

import necklacePng from '../Remove background project (2.1).png'
import { useCallback, useEffect, useRef, useState } from 'react'

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const necklaceImageRef = useRef<HTMLImageElement | null>(null) // Corrected: This was a duplicate, now it's the necklace ref
  const faceDetectionRef = useRef<any>(null)
  const animationFrameId = useRef<number | null>(null)
  const [permissionState, setPermissionState] = useState<'pending' | 'granted' | 'denied'>('pending')
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([])
  const [currentDeviceIndex, setCurrentDeviceIndex] = useState(0)
  const [showCameraOptions, setShowCameraOptions] = useState(false)

  const setupCamera = useCallback(async (deviceId?: string) => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
      tracks.forEach((track) => track.stop())
    }

    const constraints: MediaStreamConstraints = {
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    }
    if (deviceId) {
      ;(constraints.video as MediaTrackConstraints).deviceId = { exact: deviceId }
    } else {
      ;(constraints.video as MediaTrackConstraints).facingMode = 'user'
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints)

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await new Promise<void>((resolve) => {
          videoRef.current!.onloadedmetadata = () => {
            videoRef.current?.play()
            setPermissionState('granted')
            resolve()
          }
        })
      }
    } catch (error) {
      // console.error('Camera setup error:', error)
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setPermissionState('denied')
      } else {
        setPermissionState('denied')
      }
    }
  }, [setPermissionState])

  useEffect(() => {
    // Temporarily override console.log and console.info to hide specific informational messages
    const originalLog = console.log
    const originalInfo = console.info
    const filterMessage = 'Created TensorFlow Lite XNNPACK delegate for CPU'

    console.log = (...args) => {
      if (typeof args[0] === 'string' && args[0].includes(filterMessage)) return
      originalLog(...args)
    }

    console.info = (...args) => {
      if (typeof args[0] === 'string' && args[0].includes(filterMessage)) return
      originalInfo(...args)
    }

    const initAR = async () => {
      try {
        // Check camera permissions first
        try {
          const permission = await navigator.permissions.query({
            name: 'camera' as PermissionName,
          })
          if (permission.state === 'denied') {
            setPermissionState('denied')
            return
          }
        } catch (err) {
          // Fallback if permissions API is not supported
          // console.log('[v0] Permissions API not available, proceeding with request')
        }

        // Load MediaPipe FaceMesh
        const visionModule = await import('@mediapipe/tasks-vision')
        const { FaceLandmarker, FilesetResolver } = visionModule

        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm'
        )

        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          },
          numFaces: 1,
          runningMode: 'VIDEO',
        })

        faceDetectionRef.current = faceLandmarker

        // Initialize video stream
        await setupCamera()

        // Get video devices
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoInputs = devices.filter((device) => device.kind === 'videoinput')
        setVideoDevices(videoInputs)

        // Load images
        const necklaceImg = new Image()
        necklaceImg.src = necklacePng.src
        necklaceImageRef.current = necklaceImg

        // Wait for images to load
        await Promise.all([
          new Promise((resolve, reject) => { necklaceImg.onload = resolve; necklaceImg.onerror = (e) => reject(new Error('Failed to load necklace image')); }),
        ])

        // Start AR rendering
        // Start AR rendering
        const canvas = canvasRef.current
        if (canvas) {
          const ctx = canvas.getContext('2d')
          if (!ctx) return

          canvas.width = window.innerWidth
          canvas.height = window.innerHeight

          const animate = async () => {
            try {
              const video = videoRef.current
              if (!video || !canvas) {
                // If refs are gone, component has likely unmounted. Stop the loop.
                return
              }

              if (video.videoWidth > 0 && video.videoHeight > 0) {
                // Draw mirrored video, cropping to fit canvas aspect ratio ("cover")
                ctx.save()
                ctx.scale(-1, 1)

                const videoWidth = video.videoWidth
                const videoHeight = video.videoHeight
                const canvasWidth = canvas.width
                const canvasHeight = canvas.height

                const canvasAspect = canvasWidth / canvasHeight
                const videoAspect = videoWidth / videoHeight

                let sx, sy, sWidth, sHeight

                if (videoAspect > canvasAspect) {
                  // Video is wider than canvas, crop sides
                  sHeight = videoHeight
                  sWidth = videoHeight * canvasAspect
                  sx = (videoWidth - sWidth) / 2
                  sy = 0
                } else {
                  // Video is taller than canvas, crop top/bottom
                  sWidth = videoWidth
                  sHeight = videoWidth / canvasAspect
                  sx = 0
                  sy = (videoHeight - sHeight) / 2
                }

                ctx.drawImage(video, sx, sy, sWidth, sHeight, -canvas.width, 0, canvas.width, canvas.height)
                ctx.restore()

                // Helper functions to convert normalized coordinates to canvas coordinates
                const toCanvasX = (x: number) => (1 - ((x * videoWidth - sx) / sWidth)) * canvas.width
                const toCanvasY = (y: number) => ((y * videoHeight - sy) / sHeight) * canvas.height

                // Run detection
                if (video.readyState === video.HAVE_ENOUGH_DATA) {
                  const now = Date.now()
                  if (faceDetectionRef.current) {
                    const detectionResult = faceDetectionRef.current.detectForVideo(video, now)
                    if (detectionResult.faceLandmarks && detectionResult.faceLandmarks.length > 0) {
                      const landmarks = detectionResult.faceLandmarks[0]

                      // Get key points (normalized to 0-1)
                      // We still need the eyes to calculate the overall face width for scaling
                      const leftEye = landmarks[226]
                      const rightEye = landmarks[446]
                      const leftEyeX = toCanvasX(leftEye.x)
                      const rightEyeX = toCanvasX(rightEye.x)

                      // Get landmarks 11 and 12 for the chin
                      const chinPointRight = landmarks[11] // User's right side of chin
                      const chinPointLeft = landmarks[12] // User's left side of chin

                      const chinRightX = toCanvasX(chinPointRight.x)
                      const chinRightY = toCanvasY(chinPointRight.y)
                      const chinLeftX = toCanvasX(chinPointLeft.x)
                      const chinLeftY = toCanvasY(chinPointLeft.y)

                      // Find the midpoint on the chin to anchor the necklace
                      const chinMidX = (chinRightX + chinLeftX) / 2
                      const chinMidY = (chinRightY + chinLeftY) / 2

                      // Calculate necklace position and scale based on face width
                      const faceWidth = (leftEyeX - rightEyeX) * 2.5

                      if (necklaceImageRef.current) {
                        const necklaceWidth = faceWidth * 0.9
                        const necklaceHeight =
                          (necklaceImageRef.current!.height / necklaceImageRef.current!.width) * necklaceWidth

                        // Position necklace based on the chin midpoint
                        const necklaceX = chinMidX - necklaceWidth / 2
                        // Position below the chin. You can adjust the multiplier
                        // to move the necklace up or down to get the perfect fit.
                        const necklaceY = chinMidY + necklaceHeight * 0.1

                        // Draw necklace
                        ctx.save()
                        ctx.globalAlpha = 0.95
                        ctx.drawImage(
                          necklaceImageRef.current!,
                          necklaceX,
                          necklaceY,
                          necklaceWidth,
                          necklaceHeight
                        )
                        ctx.restore()
                      }
                    }
                  }
                }
              }
            } catch (e) {
              console.error('Error in animation loop:', e)
              // Stop the loop if there's a persistent error to avoid flooding the console
              if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current)
            }

            animationFrameId.current = requestAnimationFrame(animate)
          }

          animate()
        }
      } catch (error: any) {
        // console.error('AR initialization error:', error)
        if (
          error instanceof DOMException &&
          error.name === 'NotAllowedError'
        ) {
          setPermissionState('denied')
        } else {
          console.error("AR Initialization failed:", error.message);
          setPermissionState('denied')
        }
      }
    }

    initAR()
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current)
      }
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
        tracks.forEach((track) => track.stop())
      }

      // Restore the original console functions when the component unmounts
      console.log = originalLog
      console.info = originalInfo
    }
  }, [setupCamera])

  const selectCamera = async (deviceId: string) => {
    const deviceIndex = videoDevices.findIndex((d) => d.deviceId === deviceId)
    if (deviceIndex !== -1) {
      setCurrentDeviceIndex(deviceIndex)
      await setupCamera(deviceId)
      setShowCameraOptions(false)
    }
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {permissionState === 'granted' && videoDevices.length > 1 && (
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={() => setShowCameraOptions((prev) => !prev)}
            className="px-4 py-2 bg-white/20 text-white rounded-lg font-medium hover:bg-white/30 transition"
          >
            Switch Camera
          </button>
          {showCameraOptions && (
            <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white/20 backdrop-blur-sm">
              <div className="py-1 rounded-md ring-1 ring-black ring-opacity-5">
                {videoDevices.map((device, index) => (
                  <button
                    key={device.deviceId}
                    onClick={() => selectCamera(device.deviceId)}
                    className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-white/30"
                  >
                    {device.label || `Camera ${index + 1}`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <video
        ref={videoRef}
        className="hidden"
        playsInline
        muted
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />
    </div>
  )
}
