'use client'

import earring2 from '../earing2.png'
import ring1 from '../ring1.png'
import { useCallback, useEffect, useRef, useState } from 'react'

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const necklaceImageRef = useRef<HTMLImageElement | null>(null) // Corrected: This was a duplicate, now it's the necklace ref
  const earringImageRef = useRef<HTMLImageElement | null>(null)
  const faceDetectionRef = useRef<any>(null)
  const handLandmarkerRef = useRef<any>(null)
  const ringImageRef = useRef<HTMLImageElement | null>(null) // Add this line for the ring image
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
      console.error('Camera setup error:', error)
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setPermissionState('denied')
      } else {
        setPermissionState('denied')
      }
      throw error
    }
  }, [setPermissionState])

  useEffect(() => {
    const initAR = async () => {
      try {
        // Check camera permissions first
        try {
          const permission = await navigator.permissions.query({ name: 'camera' })
          if (permission.state === 'denied') {
            setPermissionState('denied')
            return
          }
        } catch (err) {
          // Fallback if permissions API is not supported
          console.log('[v0] Permissions API not available, proceeding with request')
        }

        // Load MediaPipe FaceMesh
        const visionModule = await import('@mediapipe/tasks-vision')
        const { FaceLandmarker, HandLandmarker, FilesetResolver } = visionModule

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

        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          },
          numHands: 2,
          runningMode: 'VIDEO',
        })
        handLandmarkerRef.current = handLandmarker

        // Initialize video stream
        await setupCamera()

        // Get video devices
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoInputs = devices.filter((device) => device.kind === 'videoinput')
        setVideoDevices(videoInputs)

        // Load images
        const necklaceImg = new Image()
        necklaceImg.crossOrigin = 'anonymous'
        necklaceImg.src =
          'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/necless-removebg-preview-eKz2jodGH8N7T3A6C0R7P8ArJP6J6b.png'
        necklaceImageRef.current = necklaceImg

        const earringImg = new Image()
        // The earring image is now imported directly.
        earringImg.src = earring2.src
        earringImageRef.current = earringImg

        const ringImg = new Image() // Add these lines for the ring image
        ringImg.src = ring1.src      // Use the imported ring image
        ringImageRef.current = ringImg // Store reference to the ring image

        // Wait for images to load
        await Promise.all([ // Added opening square bracket
          new Promise((resolve, reject) => { necklaceImg.onload = resolve; necklaceImg.onerror = () => reject(new Error(`Failed to load image: ${necklaceImg.src}`)); }),
          new Promise((resolve, reject) => { earringImg.onload = resolve; earringImg.onerror = () => reject(new Error(`Failed to load image: ${earringImg.src}`)); }),
          new Promise((resolve, reject) => { ringImg.onload = resolve; ringImg.onerror = () => reject(new Error(`Failed to load image: ${ringImg.src}`)); }), // Add ring image to loading promise
        ]) // Added closing square bracket

        // Start AR rendering
        // Start AR rendering
        const canvas = canvasRef.current
        if (canvas) {
          const ctx = canvas.getContext('2d')
          if (!ctx) return

          canvas.width = window.innerWidth
          canvas.height = window.innerHeight

          const animate = async () => {
            const video = videoRef.current
            if (!video || !canvas) {
              // If refs are gone, component has likely unmounted. Stop the loop.
              return;
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
              const toCanvasX = (x: number) => (1 - ((x * videoWidth - sx) / sWidth)) * canvas.width;
              const toCanvasY = (y: number) => ((y * videoHeight - sy) / sHeight) * canvas.height;

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
                  const leftEyeX = toCanvasX(leftEye.x);
                  const rightEyeX = toCanvasX(rightEye.x);

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
                    // Position below the chin. You can adjust the `* 0.2` multiplier
                    // to move the necklace up or down to get the perfect fit.
                    const necklaceY = chinMidY + necklaceHeight * 0.4

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

                  // Draw Earrings
                  if (earringImageRef.current) {
                    // Get key points for ears
                    const personRightEarlobe = landmarks[361] // Person's right earlobe
                    const personLeftEarlobe = landmarks[132]  // Person's left earlobe

                    // Convert landmark coordinates
                    const personRightEarlobeX = toCanvasX(personRightEarlobe.x)
                    const personRightEarlobeY = toCanvasY(personRightEarlobe.y)
                    const personLeftEarlobeX = toCanvasX(personLeftEarlobe.x)
                    const personLeftEarlobeY = toCanvasY(personLeftEarlobe.y)

                    // Calculate earring size
                    const earringWidth = faceWidth * 0.05 //Adjusted size to be smaller
                    const earringHeight =
                      (earringImageRef.current!.height / earringImageRef.current!.width) * earringWidth
                    const earringHorizontalOffset = faceWidth * -0.015

                    // Determine ear visibility based on relative depth (z-coordinate)
                    const eyeDistX = Math.abs(leftEye.x - rightEye.x);
                    const zThreshold = eyeDistX * 0.5; // Heuristic: if z-diff is > 1.5x eye distance, one is hidden
                    const rightEarVisible = personLeftEarlobe.z - personRightEarlobe.z > -zThreshold;
                    const leftEarVisible = personRightEarlobe.z - personLeftEarlobe.z > -zThreshold;
                    
                    // Draw earring on person's right ear if landmark is visible
                    if (personRightEarlobe && rightEarVisible) {
                      ctx.save()
                      ctx.globalAlpha = 0.95
                      ctx.drawImage(
                        earringImageRef.current!,
                        personRightEarlobeX - earringWidth / 2 + earringHorizontalOffset,
                        personRightEarlobeY,
                        earringWidth,
                        earringHeight,
                      )
                      ctx.restore()
                    }

                    // Draw earring on person's left ear if landmark is visible
                    if (personLeftEarlobe && leftEarVisible) {
                      ctx.save()
                      ctx.globalAlpha = 0.95
                      ctx.drawImage(
                        earringImageRef.current!,
                        personLeftEarlobeX - earringWidth / 2 - earringHorizontalOffset,
                        personLeftEarlobeY,
                        earringWidth,
                        earringHeight,
                      )
                      ctx.restore()
                    }
                  }
                }
                }

                // Detect and draw on hands for the ring
                if (handLandmarkerRef.current && ringImageRef.current) {
                  const handResult = handLandmarkerRef.current.detectForVideo(video, now);
                  if (handResult && handResult.landmarks && handResult.landmarks.length > 0) {
                    for (const handLandmarks of handResult.landmarks) {
                      const ringFingerBase = handLandmarks[13] // Landmark for the base of the ring finger (MCP joint)
                      const ringFingerPIP = handLandmarks[14] // Landmark for the middle of the ring finger (PIP joint)
                      const wrist = handLandmarks[0]
                      const middleFingerMCP = handLandmarks[9]

                      // Get canvas coordinates for base and middle of the finger
                      const ringBaseX = toCanvasX(ringFingerBase.x)
                      const ringBaseY = toCanvasY(ringFingerBase.y)
                      const ringPipX = toCanvasX(ringFingerPIP.x)
                      const ringPipY = toCanvasY(ringFingerPIP.y)

                      // Interpolate to position the ring slightly up from the base
                      const interpolationFactor = 0.4 // 40% up from the base
                      const ringX = ringBaseX + (ringPipX - ringBaseX) * interpolationFactor
                      const ringY = ringBaseY + (ringPipY - ringBaseY) * interpolationFactor

                      // Calculate the angle of the finger to rotate the ring
                      const angle = Math.atan2(
                        ringPipY - ringBaseY,
                        ringPipX - ringBaseX
                      )

                      // Calculate a reference size based on the hand landmarks for scaling the ring
                      const handRefSize = Math.hypot(toCanvasX(wrist.x) - toCanvasX(middleFingerMCP.x), toCanvasY(wrist.y) - toCanvasY(middleFingerMCP.y));
                      const ringWidth = handRefSize * 0.35; // Adjust this multiplier for a good fit
                      const ringHeight = (ringImageRef.current.height / ringImageRef.current.width) * ringWidth

                      ctx.save()
                      ctx.translate(ringX, ringY)
                      ctx.rotate(angle + Math.PI / 2) // Rotate to align with the finger
                      ctx.drawImage(ringImageRef.current, -ringWidth / 2, -ringHeight / 2, ringWidth, ringHeight)
                      ctx.restore()
                    }
                  }
                }
              }
            }

            animationFrameId.current = requestAnimationFrame(animate)
          }

          animate()
        }
      } catch (error) {
        console.error('AR initialization error:', error.name, error.message, error.stack, error)
        if (
          error instanceof DOMException &&
          error.name === 'NotAllowedError'
        ) {
          setPermissionState('denied')
        } else {
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
      
      {permissionState === 'pending' && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center text-white">
            <p className="text-lg font-medium mb-2">Requesting Camera Access</p>
            <p className="text-sm text-gray-400">Please allow camera access in your browser</p>
          </div>
        </div>
      )}
      
      {permissionState === 'denied' && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center text-white max-w-sm">
            <p className="text-lg font-medium mb-4">Camera Access Required</p>
            <p className="text-sm text-gray-400 mb-6">
              Please enable camera permissions in your browser settings to use the AR necklace try-on.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-white text-black rounded-lg font-medium hover:bg-gray-100 transition"
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
