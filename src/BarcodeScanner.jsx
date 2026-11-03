import React, { useEffect, useRef, useState, useCallback } from 'react';

/* ─────────────────────────────────────────────────────────────
   BARCODE SCANNER
   Uses BarcodeDetector API (Chrome/Edge) with a canvas fallback.
   Fires onDetect(barcodeString) when a code is found.
───────────────────────────────────────────────────────────── */
export default function BarcodeScanner({ onDetect, onClose }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef    = useRef(null);
  const lastScan  = useRef('');
  const lastTime  = useRef(0);

  const [status, setStatus]       = useState('starting'); // starting | scanning | error
  const [errorMsg, setErrorMsg]   = useState('');
  const [lastCode, setLastCode]   = useState('');
  const [torch, setTorch]         = useState(false);
  const [facingMode, setFacingMode] = useState('environment');

  // ── Start camera ──────────────────────────────────────────
  const startCamera = useCallback(async (facing = 'environment') => {
    // Stop any existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    cancelAnimationFrame(rafRef.current);
    setStatus('starting');
    setErrorMsg('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus('scanning');
      startDetection();

      // Warn if BarcodeDetector not supported
      if (!('BarcodeDetector' in window)) {
        setErrorMsg('Your browser does not support automatic barcode detection. Use manual entry below.');
        setStatus('error');
      }
    } catch (err) {
      console.error('Camera error:', err);
      if (err.name === 'NotAllowedError') {
        setErrorMsg('Camera permission denied. Please allow camera access and try again.');
      } else if (err.name === 'NotFoundError') {
        setErrorMsg('No camera found on this device.');
      } else {
        setErrorMsg(`Camera error: ${err.message}`);
      }
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [facingMode]);

  // ── Toggle torch ──────────────────────────────────────────
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    const caps  = track.getCapabilities?.() || {};
    if (!caps.torch) return;
    const next = !torch;
    await track.applyConstraints({ advanced: [{ torch: next }] });
    setTorch(next);
  };

  // ── Detection loop ────────────────────────────────────────
  const startDetection = useCallback(() => {
    const useBarcodeDetector = 'BarcodeDetector' in window;

    let detector = null;
    if (useBarcodeDetector) {
      detector = new window.BarcodeDetector({
        formats: [
          'code_128', 'code_39', 'code_93', 'codabar',
          'ean_13', 'ean_8', 'upc_a', 'upc_e',
          'qr_code', 'data_matrix', 'pdf417',
          'itf', 'aztec',
        ],
      });
    }

    const tick = async () => {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);

      try {
        let barcode = null;

        if (useBarcodeDetector) {
          const results = await detector.detect(video);
          if (results.length > 0) barcode = results[0].rawValue;
        }
        // If BarcodeDetector not available, manual entry is the fallback (see below)

        if (barcode) {
          const now = Date.now();
          if (barcode !== lastScan.current || now - lastTime.current > 2000) {
            lastScan.current = barcode;
            lastTime.current = now;
            setLastCode(barcode);
            onDetect(barcode);
          }
        }
      } catch {
        // No barcode in frame — expected
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [onDetect]);

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="scanner-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="scanner-modal">

        {/* Header */}
        <div className="scanner-header">
          <div>
            <h2 className="scanner-title">Scan Barcode</h2>
            <p className="scanner-sub">Point camera at product barcode</p>
          </div>
          <button className="scanner-close" onClick={onClose}>×</button>
        </div>

        {/* Viewfinder */}
        <div className="scanner-viewport">
          <video
            ref={videoRef}
            className="scanner-video"
            playsInline
            muted
            autoPlay
          />
          <canvas ref={canvasRef} className="scanner-canvas" />

          {/* Aim overlay */}
          {status === 'scanning' && (
            <div className="scanner-aim">
              <div className="scanner-aim-inner">
                <span className="aim-corner tl" />
                <span className="aim-corner tr" />
                <span className="aim-corner bl" />
                <span className="aim-corner br" />
                <div className="scanner-line" />
              </div>
            </div>
          )}

          {/* Status overlays */}
          {status === 'starting' && (
            <div className="scanner-status-overlay">
              <div className="scanner-spinner" />
              <p>Starting camera…</p>
            </div>
          )}
          {status === 'error' && (
            <div className="scanner-status-overlay scanner-error-overlay">
              <span style={{ fontSize: 40 }}>📷</span>
              <p>{errorMsg}</p>
              <button className="scanner-retry-btn" onClick={() => startCamera(facingMode)}>
                Try Again
              </button>
            </div>
          )}

          {/* Last scanned pill */}
          {lastCode && status === 'scanning' && (
            <div className="scanner-last-code">
              ✓ {lastCode}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="scanner-controls">
          <button
            className={`scanner-ctrl-btn${torch ? ' active' : ''}`}
            onClick={toggleTorch}
            title="Toggle flashlight"
          >
            {torch ? '🔦' : '💡'} Torch
          </button>
          <button
            className="scanner-ctrl-btn"
            onClick={() => setFacingMode(f => f === 'environment' ? 'user' : 'environment')}
            title="Flip camera"
          >
            🔄 Flip
          </button>
          <button className="scanner-ctrl-btn" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        {/* Manual entry fallback */}
        <div className="scanner-manual">
          <p>Can't scan? Enter barcode manually:</p>
          <form onSubmit={e => {
            e.preventDefault();
            const val = e.target.elements.manual.value.trim();
            if (val) { onDetect(val); e.target.reset(); }
          }}>
            <input name="manual" placeholder="Type or paste barcode…" autoComplete="off" />
            <button type="submit">Add</button>
          </form>
        </div>

      </div>
    </div>
  );
}
