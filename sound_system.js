/**
 * ═══════════════════════════════════════════════════════════════════
 *  ROYAUME DES CONNAISSANCES — SOUND & MUSIC ENGINE
 *  - Chill, relaxing game background music for kids
 *  - Tactile, juicy, satisfying button click audio feedback
 *  - Smart voiceover audio ducking (narration clarity)
 * ═══════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  const SoundSystem = {
    ctx: null,
    musicAudio: null,
    isMusicMuted: false,
    isSoundMuted: false,
    defaultMusicVol: 0.24,
    currentMusicVol: 0.24,
    isDucked: false,
    duckTimer: null,
    hasInteracted: false,

    init() {
      if (this.ctx) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      } catch (e) {
        console.warn('Web Audio not supported', e);
      }

      // Load saved preferences
      try {
        const savedMusic = localStorage.getItem('game_music_muted');
        const savedSound = localStorage.getItem('game_sound_muted');
        if (savedMusic !== null) this.isMusicMuted = savedMusic === 'true';
        if (savedSound !== null) this.isSoundMuted = savedSound === 'true';
      } catch (e) { }

      this.createUI();
      this.bindGlobalEvents();
      this.hookAudioDucking();
    },

    resumeContext() {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => { });
      }
    },

    // ─────────────────────────────────────────────────────────────────
    // BACKGROUND MUSIC
    // ─────────────────────────────────────────────────────────────────
    startMusic() {
      if (this.musicAudio) {
        if (!this.isMusicMuted && this.musicAudio.paused) {
          this.musicAudio.play().catch(() => { });
        }
        return;
      }

      this.musicAudio = new Audio('audio/bg_music.mp3');
      this.musicAudio.loop = true;
      this.musicAudio.volume = 0; // fade in

      if (!this.isMusicMuted) {
        this.musicAudio.play().then(() => {
          this.fadeInMusic(this.defaultMusicVol, 1200);
        }).catch(() => {
          // Will resume on next user gesture
        });
      }
      this.updateUI();
    },

    fadeInMusic(targetVol, durationMs) {
      if (!this.musicAudio || this.isMusicMuted) return;
      const start = performance.now();
      const initial = this.musicAudio.volume;
      const step = (now) => {
        const p = Math.min(1, (now - start) / durationMs);
        if (this.musicAudio && !this.isMusicMuted && !this.isDucked) {
          this.musicAudio.volume = initial + (targetVol - initial) * p;
          if (p < 1) requestAnimationFrame(step);
        }
      };
      requestAnimationFrame(step);
    },

    toggleMusic() {
      this.resumeContext();
      this.isMusicMuted = !this.isMusicMuted;
      try {
        localStorage.setItem('game_music_muted', String(this.isMusicMuted));
      } catch (e) { }

      if (this.isMusicMuted) {
        if (this.musicAudio) this.musicAudio.pause();
      } else {
        if (!this.musicAudio) {
          this.startMusic();
        } else {
          this.musicAudio.volume = this.defaultMusicVol;
          this.musicAudio.play().catch(() => { });
        }
      }
      this.updateUI();
    },

    toggleSound() {
      this.resumeContext();
      this.isSoundMuted = !this.isSoundMuted;
      try {
        localStorage.setItem('game_sound_muted', String(this.isSoundMuted));
      } catch (e) { }
      if (!this.isSoundMuted) this.playClick();
      this.updateUI();
    },

    // Smart ducking: drops music volume to 0.05 when an exercise voiceover is talking
    duckMusic() {
      if (!this.musicAudio || this.isMusicMuted) return;
      this.isDucked = true;
      this.musicAudio.volume = 0.05;
      if (this.duckTimer) clearTimeout(this.duckTimer);
    },

    unduckMusic() {
      if (!this.musicAudio || this.isMusicMuted) return;
      if (this.duckTimer) clearTimeout(this.duckTimer);
      this.duckTimer = setTimeout(() => {
        this.isDucked = false;
        if (this.musicAudio && !this.isMusicMuted) {
          this.fadeInMusic(this.defaultMusicVol, 600);
        }
      }, 350);
    },

    hookAudioDucking() {
      // Intercept any Audio element play/pause to smoothly duck/unduck background music
      const self = this;
      const origPlay = HTMLMediaElement.prototype.play;
      const origPause = HTMLMediaElement.prototype.pause;

      HTMLMediaElement.prototype.play = function () {
        if (this !== self.musicAudio && !this._isSfx) {
          self.duckMusic();
          this.addEventListener('ended', () => self.unduckMusic(), { once: true });
          this.addEventListener('pause', () => self.unduckMusic(), { once: true });
        }
        return origPlay.apply(this, arguments);
      };
    },

    // ─────────────────────────────────────────────────────────────────
    // BUTTON SOUND EFFECTS (Tactile Pop / Bubble / Wooden Tap)
    // ─────────────────────────────────────────────────────────────────
    playClick() {
      if (this.isSoundMuted) return;
      this.resumeContext();
      if (!this.ctx) return;

      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        // Organic micro pitch variation (±25 Hz)
        const pitchVar = (Math.random() - 0.5) * 50;
        const startFreq = 640 + pitchVar;
        const endFreq = 220 + pitchVar * 0.4;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(startFreq, now);
        osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.065);

        // Warm gain envelope
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.32, now + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);

        // Warm lowpass filter
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2600, now);
        filter.Q.setValueAtTime(1.2, now);

        osc.connect(gain);
        gain.connect(filter);
        filter.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.08);

        // Subtle click transient for extra tactile punch
        const clickOsc = this.ctx.createOscillator();
        const clickGain = this.ctx.createGain();
        clickOsc.type = 'triangle';
        clickOsc.frequency.setValueAtTime(1800, now);
        clickGain.gain.setValueAtTime(0.08, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
        clickOsc.connect(clickGain);
        clickGain.connect(this.ctx.destination);
        clickOsc.start(now);
        clickOsc.stop(now + 0.02);
      } catch (e) {
        console.warn('playClick error', e);
      }
    },

    playSuccess() {
      if (this.isSoundMuted) return;
      this.resumeContext();
      if (!this.ctx) return;

      try {
        // Joyful celesta arpeggio (C5, E5, G5, C6)
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((f, i) => {
          const t = this.ctx.currentTime + i * 0.075;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, t);

          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.linearRampToValueAtTime(0.24, t + 0.004);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);

          osc.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start(t);
          osc.stop(t + 0.46);
        });
      } catch (e) { }
    },

    playIncorrect() {
      if (this.isSoundMuted) return;
      this.resumeContext();
      if (!this.ctx) return;

      try {
        // Soft kid-friendly double boop
        [310, 250].forEach((f, i) => {
          const t = this.ctx.currentTime + i * 0.11;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, t);
          osc.frequency.exponentialRampToValueAtTime(f * 0.9, t + 0.09);

          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.linearRampToValueAtTime(0.18, t + 0.005);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);

          osc.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start(t);
          osc.stop(t + 0.12);
        });
      } catch (e) { }
    },

    // ─────────────────────────────────────────────────────────────────
    // GLOBAL BUTTON EVENT BINDING
    // ─────────────────────────────────────────────────────────────────
    bindGlobalEvents() {
      const handleFirstInteraction = () => {
        if (!this.hasInteracted) {
          this.hasInteracted = true;
          this.resumeContext();
          this.startMusic();
        }
      };

      window.addEventListener('click', handleFirstInteraction, { passive: true });
      window.addEventListener('touchstart', handleFirstInteraction, { passive: true });
      window.addEventListener('keydown', handleFirstInteraction, { passive: true });

      // Immediate tactile click sound on pointerdown / mousedown for zero lag
      const triggerSoundOnButton = (e) => {
        const target = e.target.closest(
          'button, .popup-commencer-btn, .popup-close-btn, #btn-check-answer, ' +
          '.j1-premium-btn, .j2-premium-btn, .hotspot, .choice-btn, .opt-card, ' +
          '.exercise-card, rect[id^="hitbox-"], .btn-sound-toggle, .btn-music-toggle, ' +
          '#btn-commencer, #btn-adventure-start, #btn-close-exercise, [role="button"]'
        );
        if (target) {
          this.playClick();
          // Micro-animation for visual feedback
          target.style.transition = 'transform 0.08s cubic-bezier(0.34, 1.56, 0.64, 1)';
          target.style.transform = 'scale(0.95)';
          const resetTransform = () => {
            target.style.transform = '';
            target.removeEventListener('pointerup', resetTransform);
            target.removeEventListener('pointerleave', resetTransform);
          };
          target.addEventListener('pointerup', resetTransform);
          target.addEventListener('pointerleave', resetTransform);
        }
      };

      // Pointerdown provides fastest instant reaction on touch and mouse
      if (window.PointerEvent) {
        document.addEventListener('pointerdown', triggerSoundOnButton, true);
      } else {
        document.addEventListener('mousedown', triggerSoundOnButton, true);
        document.addEventListener('touchstart', triggerSoundOnButton, true);
      }

      // Automatically play victory chime whenever an exercise displays "Bravo" or "Félicitations"
      const feedbackObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
          const text = (m.target.textContent || '').trim();
          if (text.includes('Bravo') || text.includes('Félicitations') || text.includes('parfait')) {
            this.playSuccess();
            break;
          }
        }
      });

      const startObserver = () => {
        const stage = document.getElementById('exercise-stage') || document.body;
        feedbackObserver.observe(stage, { childList: true, subtree: true, characterData: true });
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserver);
      } else {
        startObserver();
      }
    },

    // ─────────────────────────────────────────────────────────────────
    // FLOATING AUDIO CONTROL UI
    // ─────────────────────────────────────────────────────────────────
    createUI() {
      if (document.getElementById('audio-controls-pill')) return;

      const bar = document.createElement('div');
      bar.id = 'audio-controls-pill';
      bar.innerHTML = `
        <button id="btn-music-pill" class="btn-music-toggle" title="Musique de fond (Activer/Désactiver)" aria-label="Musique">
          <span class="audio-icon">🎵</span>
          <span class="audio-label">Musique</span>
        </button>
        <button id="btn-sfx-pill" class="btn-sound-toggle" title="Effets sonores des boutons (Activer/Désactiver)" aria-label="Sons">
          <span class="audio-icon">🔔</span>
          <span class="audio-label">Sons</span>
        </button>
      `;

      const style = document.createElement('style');
      style.textContent = `
        #audio-controls-pill {
          position: fixed;
          top: 14px;
          left: 20px;
          z-index: 999999;
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          padding: 5px 8px;
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
          user-select: none;
        }
        #audio-controls-pill button {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.25);
          border-radius: 9999px;
          color: #ffffff;
          font-family: 'Nunito', 'Segoe UI', system-ui, sans-serif;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          outline: none;
          transition: background 0.18s ease, transform 0.12s ease, opacity 0.18s ease;
        }
        #audio-controls-pill button:hover {
          background: rgba(255, 255, 255, 0.25);
          transform: translateY(-1px);
        }
        #audio-controls-pill button:active {
          transform: translateY(1px);
        }
        #audio-controls-pill button.muted {
          opacity: 0.55;
          background: rgba(239, 68, 68, 0.25);
          border-color: rgba(239, 68, 68, 0.45);
          text-decoration: line-through;
        }
        #audio-controls-pill .audio-icon {
          font-size: 14px;
          line-height: 1;
        }
        @media (max-width: 768px) {
          #audio-controls-pill {
            right: 10px;
            top: 60px;
          }
          #audio-controls-pill .audio-label {
            display: none;
          }
        }
      `;

      document.head.appendChild(style);
      document.body.appendChild(bar);

      document.getElementById('btn-music-pill').addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleMusic();
      });

      document.getElementById('btn-sfx-pill').addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleSound();
      });

      this.updateUI();
    },

    updateUI() {
      const musicBtn = document.getElementById('btn-music-pill');
      const sfxBtn = document.getElementById('btn-sfx-pill');
      if (musicBtn) {
        musicBtn.classList.toggle('muted', this.isMusicMuted);
        const icon = musicBtn.querySelector('.audio-icon');
        if (icon) icon.textContent = this.isMusicMuted ? '🔇' : '🎵';
      }
      if (sfxBtn) {
        sfxBtn.classList.toggle('muted', this.isSoundMuted);
        const icon = sfxBtn.querySelector('.audio-icon');
        if (icon) icon.textContent = this.isSoundMuted ? '🔕' : '🔔';
      }
    }
  };

  // Expose globally
  window.SoundSystem = SoundSystem;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SoundSystem.init());
  } else {
    SoundSystem.init();
  }
})();
