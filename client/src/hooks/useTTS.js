//SAM tts
import { useState, useEffect, useRef, useCallback } from 'react';
import SamJs from 'sam-js';

//these are standard settings for the SAM voice
//https://discordier.github.io/sam/
const DEFAULT_CONFIG = {
  pitch: 64,
  speed: 72,
  throat: 128,
  mouth: 128,
  volume: 50
};

export default function useTTS() {
  const [enabled, setEnabled] = useState(false);         //is tts enabled - yes/no
  const [config, setConfig] = useState(DEFAULT_CONFIG);  //the config for the TTS (pitch, speed, etc.)
  const audioCtxRef = useRef(null);                      //audio context, connects to browser output node
  const gainNodeRef = useRef(null);                      //gain node for controlling tts volume
  const configRef = useRef(config);                      //config reference used to adjust the SamTTS
  //keep ref in sync
  useEffect(() => { configRef.current = config; }, [config]);

  //initialize Web Audio API
  useEffect(() => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      audioCtxRef.current = ctx;
      gainNodeRef.current = gain;
    }
  }, []); //empty list at end means we initialize once on start, never again

  //sync volume slider to gain node
  useEffect(() => {
    if (gainNodeRef.current) {
      const vol = config.volume / 100;
      gainNodeRef.current.gain.value = vol * vol;
    }
  }, [config.volume]);

  //play text through SAM
  const playTTS = useCallback((text, overrideConfig) => {
    const cfg = overrideConfig || configRef.current;
    const audioCtx = audioCtxRef.current;
    const gainNode = gainNodeRef.current;
    if (!audioCtx || !gainNode || Number(cfg.volume) <= 0) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const cleanText = text.replace(/[*_#`]/g, '');
    //the SamJs object for outputting the audio
    const sam = new SamJs({
      pitch: Number(cfg.pitch),
      speed: Number(cfg.speed),
      throat: Number(cfg.throat),
      mouth: Number(cfg.mouth)
    });

    try {
      const audioData = sam.buf32(cleanText);
      if (audioData && audioData.length > 0) {
        const buffer = audioCtx.createBuffer(1, audioData.length, 22050);
        buffer.getChannelData(0).set(audioData);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(gainNode);
        source.start();
      }
    } catch (e) {
      console.error('SAM Audio Error:', e);
    }
  }, []);
  const resetConfig = useCallback(() => setConfig(DEFAULT_CONFIG), []);
  return { enabled, setEnabled, config, setConfig, resetConfig, playTTS, configRef };
}
