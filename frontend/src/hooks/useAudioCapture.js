import { useState, useRef } from 'react';

export const useAudioCapture = (onAudioData, onRecordingStop, onVolumeChange) => {
  const [isRecording, setIsRecording] = useState(false);
  const streamRef = useRef(null);
  const processorRef = useRef(null);
  const audioContextRef = useRef(null);
  const onAudioDataRef = useRef(onAudioData);
  const onRecordingStopRef = useRef(onRecordingStop);
  const onVolumeChangeRef = useRef(onVolumeChange);
  onAudioDataRef.current = onAudioData;
  onRecordingStopRef.current = onRecordingStop;
  onVolumeChangeRef.current = onVolumeChange;

  const downsample = (float32Array, fromRate, toRate) => {
    if (fromRate === toRate) {
      const int16 = new Int16Array(float32Array.length);
      for (let i = 0; i < float32Array.length; i++) {
        int16[i] = Math.max(-1, Math.min(1, float32Array[i])) * 0x7FFF;
      }
      return int16;
    }
    const ratio = fromRate / toRate;
    const newLength = Math.floor(float32Array.length / ratio);
    const int16 = new Int16Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const srcIndex = Math.floor(i * ratio);
      int16[i] = Math.max(-1, Math.min(1, float32Array[srcIndex])) * 0x7FFF;
    }
    return int16;
  };

  const startRecording = async () => {
    try {
      // Si ya está grabando, no hacer nada
      if (streamRef.current || processorRef.current) {
        console.warn('Ya se está grabando actualmente.');
        return;
      }

      // CRÍTICO PARA NAVEGADORES MÓVILES: Crear/reanudar AudioContext SINCRONICAMENTE dentro del evento de toque (user gesture)
      let audioCtx = audioContextRef.current;
      if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioCtx;
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      streamRef.current = stream;

      // Re-verificar estado por si se suspendió durante el diálogo de permiso
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
        console.log('🔊 AudioContext reanudado tras diálogo de permisos');
      }
      
      const nativeSampleRate = audioCtx.sampleRate;
      console.log(`🎤 Sample rate nativo: ${nativeSampleRate}Hz`);

      const source = audioCtx.createMediaStreamSource(stream);

      // ScriptProcessorNode con buffer de 4096
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      let chunkCount = 0;

      processor.onaudioprocess = (e) => {
        // Doble verificación: si no deberíamos estar grabando, ignorar
        if (!processorRef.current) return;

        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calcular RMS (Root Mean Square) para medir el volumen real capturado
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);

        if (onVolumeChangeRef.current) {
          onVolumeChangeRef.current(rms);
        }

        const pcm16k = downsample(inputData, nativeSampleRate, 16000);

        // Convertir a Base64
        const bytes = new Uint8Array(pcm16k.buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Audio = window.btoa(binary);

        chunkCount++;
        if (chunkCount <= 5 || chunkCount % 20 === 0) {
          console.log(`🔊 Chunk #${chunkCount}: RMS=${rms.toFixed(5)} (${pcm16k.length} samples)`);
        }

        if (onAudioDataRef.current) {
          onAudioDataRef.current(base64Audio);
        }
      };

      // Para evitar que Chrome en Android libere el ScriptProcessorNode con el Garbage Collector:
      const silenceGain = audioCtx.createGain();
      silenceGain.gain.value = 0;
      source.connect(processor);
      processor.connect(silenceGain);
      silenceGain.connect(audioCtx.destination);

      setIsRecording(true);
      console.log(`🎙️ Grabación iniciada (${nativeSampleRate}Hz → 16kHz PCM)`);
    } catch (err) {
      console.error('Error al acceder al micrófono:', err);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    console.log('🛑 Solicitado detener grabación...');
    
    // 1. Limpiar el procesador inmediatamente para que no procese más onaudioprocess
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    // 2. Detener todos los tracks del micrófono
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log(`Track de micrófono detenido: ${track.label}`);
      });
      streamRef.current = null;
    }

    // Nota: Dejamos el AudioContext abierto para la siguiente grabación

    setIsRecording(false);
    if (onVolumeChangeRef.current) {
      onVolumeChangeRef.current(0);
    }
    console.log('🛑 Grabación detenida por completo');

    // 4. Enviar la señal de fin de stream después de limpiar todo
    if (onRecordingStopRef.current) {
      onRecordingStopRef.current();
    }
  };

  return { isRecording, startRecording, stopRecording };
};
