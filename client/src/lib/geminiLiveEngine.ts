// ---------------------------------------------------------------------------
// Gemini Live API WebSocket voice engine
// Connects directly to Google's BidiGenerateContent endpoint for real-time
// audio I/O with tool calling support.
// ---------------------------------------------------------------------------

export interface GeminiLiveCallbacks {
  onConnectionChange: (
    state:
      | 'connecting'
      | 'connected'
      | 'disconnected'
      | 'reconnecting'
      | 'error',
  ) => void;
  onTranscript: (text: string, isFinal: boolean, isUser: boolean) => void;
  onAudioLevel: (level: number) => void;
  onToolCall: (toolName: string, args: Record<string, any>) => void;
  onError: (error: string) => void;
}

const GEMINI_MODEL = 'gemini-2.5-flash-preview-native-audio-dialog';

export class GeminiLiveEngine {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private micGainNode: GainNode | null = null;
  private callbacks: GeminiLiveCallbacks;
  private token: string;
  private sessionHandle: string | null = null;
  private hasGreeted = false;
  private isMuted = false;
  private isAiSpeaking = false;
  private reconnectAttempts = 0;
  private maxReconnects = 20;
  private nextPlayTime = 0;
  private chunkCount = 0;
  private destroyed = false;
  private systemPrompt: string;

  constructor(
    token: string,
    callbacks: GeminiLiveCallbacks,
    systemPrompt: string,
  ) {
    this.token = token;
    this.callbacks = callbacks;
    this.systemPrompt = systemPrompt;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  async connect() {
    if (this.destroyed) return;
    this.callbacks.onConnectionChange('connecting');

    try {
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.token}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.sendSetupMessage();
      };

      this.ws.onmessage = async (event) => {
        const data =
          typeof event.data === 'string'
            ? JSON.parse(event.data)
            : JSON.parse(await (event.data as Blob).text());
        this.handleMessage(data);
      };

      this.ws.onclose = () => {
        if (!this.destroyed) {
          this.callbacks.onConnectionChange('disconnected');
          this.attemptReconnect();
        }
      };

      this.ws.onerror = () => {
        this.callbacks.onError('WebSocket connection error');
        this.callbacks.onConnectionChange('error');
      };
    } catch (error) {
      this.callbacks.onError(`Connection failed: ${error}`);
      this.callbacks.onConnectionChange('error');
    }
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.micGainNode) {
      this.micGainNode.gain.value = muted ? 0 : 1;
    }
  }

  disconnect() {
    this.destroyed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  // ── Setup ───────────────────────────────────────────────────────────────

  private sendSetupMessage() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const setupMessage = {
      setup: {
        model: `models/${GEMINI_MODEL}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
        systemInstruction: {
          parts: [{ text: this.systemPrompt }],
        },
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
            endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
            silenceDurationMs: 700,
            prefixPaddingMs: 300,
          },
          activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
          turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY',
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        contextWindowCompression: { slidingWindow: {} },
        sessionResumption: this.sessionHandle
          ? { handle: this.sessionHandle }
          : {},
        tools: [{ functionDeclarations: this.getToolDeclarations() }],
      },
    };

    this.ws.send(JSON.stringify(setupMessage));
  }

  private getToolDeclarations() {
    return [
      {
        name: 'search_person',
        description:
          'Look up a person in the relationship graph by name, title, or org.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: {
              type: 'STRING',
              description: 'Person name or title + org',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_relationships',
        description:
          'Get team relationships with a specific person and strength scores.',
        parameters: {
          type: 'OBJECT',
          properties: {
            person_name: { type: 'STRING' },
          },
          required: ['person_name'],
        },
      },
      {
        name: 'find_path',
        description:
          'Find the warmest connection path from your team to a target person.',
        parameters: {
          type: 'OBJECT',
          properties: {
            target_name: { type: 'STRING' },
          },
          required: ['target_name'],
        },
      },
      {
        name: 'get_reflections',
        description:
          'Get team reflections and observations about a person.',
        parameters: {
          type: 'OBJECT',
          properties: {
            person_name: { type: 'STRING' },
            category: { type: 'STRING' },
          },
          required: ['person_name'],
        },
      },
      {
        name: 'log_interaction',
        description:
          'Log a new interaction. Use when the user says they met someone.',
        parameters: {
          type: 'OBJECT',
          properties: {
            person_name: { type: 'STRING' },
            type: { type: 'STRING' },
            summary: { type: 'STRING' },
          },
          required: ['person_name', 'type', 'summary'],
        },
      },
      {
        name: 'add_reflection',
        description: 'Store a new observation about a person.',
        parameters: {
          type: 'OBJECT',
          properties: {
            person_name: { type: 'STRING' },
            category: { type: 'STRING' },
            content: { type: 'STRING' },
          },
          required: ['person_name', 'category', 'content'],
        },
      },
    ];
  }

  // ── Message handler ─────────────────────────────────────────────────────

  private handleMessage(data: any) {
    // Setup complete
    if (data.setupComplete) {
      this.callbacks.onConnectionChange('connected');
      this.reconnectAttempts = 0;
      if (!this.hasGreeted) {
        this.sendGreeting();
        this.hasGreeted = true;
      }
      this.startAudioCapture();
      return;
    }

    // Session resumption update
    if (data.sessionResumptionUpdate?.newHandle) {
      this.sessionHandle = data.sessionResumptionUpdate.newHandle;
    }

    // Input transcription (user speech)
    if (data.serverContent?.inputTranscription?.text) {
      this.callbacks.onTranscript(
        data.serverContent.inputTranscription.text,
        true,
        true,
      );
    }

    // Output transcription (AI speech)
    if (data.serverContent?.outputTranscription?.text) {
      this.callbacks.onTranscript(
        data.serverContent.outputTranscription.text,
        true,
        false,
      );
    }

    // Audio output from model
    if (data.serverContent?.modelTurn?.parts) {
      for (const part of data.serverContent.modelTurn.parts) {
        if (part.inlineData?.data) {
          this.isAiSpeaking = true;
          this.muteInput();
          this.playAudio(part.inlineData.data);
        }
      }
    }

    // Turn complete
    if (data.serverContent?.turnComplete) {
      this.isAiSpeaking = false;
      setTimeout(() => this.unmuteInput(), 250);
    }

    // Tool calls from model
    if (data.toolCall?.functionCalls) {
      for (const fc of data.toolCall.functionCalls) {
        this.callbacks.onToolCall(fc.name, fc.args);
        this.handleToolCall(fc);
      }
    }

    // Server wants us to reconnect
    if (data.goAway) {
      this.attemptReconnect();
    }
  }

  // ── Tool call execution (round-trip to our server) ──────────────────────

  private async handleToolCall(fc: {
    id: string;
    name: string;
    args: Record<string, any>;
  }) {
    try {
      const response = await fetch('/api/trpc/chat.executeToolCall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          json: { toolName: fc.name, args: fc.args },
        }),
      });
      const body = await response.json();
      const result = body?.result?.data ?? body;

      // Send tool response back to Gemini
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            toolResponse: {
              functionResponses: [
                {
                  id: fc.id,
                  name: fc.name,
                  response: result,
                },
              ],
            },
          }),
        );
      }
    } catch {
      // Send error response so Gemini can continue
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            toolResponse: {
              functionResponses: [
                {
                  id: fc.id,
                  name: fc.name,
                  response: { error: 'Tool execution failed' },
                },
              ],
            },
          }),
        );
      }
    }
  }

  // ── Greeting ────────────────────────────────────────────────────────────

  private sendGreeting() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        clientContent: {
          turns: [
            {
              role: 'user',
              parts: [
                {
                  text: 'Greet the user briefly. Let them know you are the RelGraph voice assistant ready to help navigate their relationship graph.',
                },
              ],
            },
          ],
          turnComplete: true,
        },
      }),
    );
  }

  // ── Audio capture (microphone -> Gemini) ────────────────────────────────

  private async startAudioCapture() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.micGainNode = this.audioContext.createGain();
      this.scriptProcessor = this.audioContext.createScriptProcessor(
        1024,
        1,
        1,
      );

      // Silent gain node connected to destination (required for onaudioprocess)
      const silentGain = this.audioContext.createGain();
      silentGain.gain.value = 0;

      source.connect(this.micGainNode);
      this.micGainNode.connect(this.scriptProcessor);
      this.scriptProcessor.connect(silentGain);
      silentGain.connect(this.audioContext.destination);

      this.scriptProcessor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);

        // Calculate audio level for visualization
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const level = Math.sqrt(sum / inputData.length);
        this.callbacks.onAudioLevel(level);

        // Convert Float32 -> PCM16 LE
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Send audio via WebSocket (with back-pressure check)
        if (this.ws?.readyState === WebSocket.OPEN) {
          if (this.ws.bufferedAmount > 65536) return;

          const bytes = new Uint8Array(pcm16.buffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);

          this.ws.send(
            JSON.stringify({
              realtimeInput: {
                audio: {
                  data: base64,
                  mimeType: 'audio/pcm;rate=16000',
                },
              },
            }),
          );
        }
      };
    } catch (error) {
      this.callbacks.onError(`Microphone access failed: ${error}`);
    }
  }

  // ── Audio playback (Gemini -> speakers) ─────────────────────────────────

  private playAudio(base64Data: string) {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: 24000 });
    }

    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768;
    }

    const buffer = this.audioContext.createBuffer(
      1,
      float32.length,
      24000,
    );
    buffer.getChannelData(0).set(float32);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    const now = this.audioContext.currentTime;
    if (this.nextPlayTime < now) this.nextPlayTime = now;

    source.start(this.nextPlayTime);
    this.nextPlayTime += buffer.duration;

    // Re-anchor every 100 chunks to prevent drift
    this.chunkCount++;
    if (this.chunkCount % 100 === 0) {
      this.nextPlayTime = this.audioContext.currentTime + 0.05;
    }
  }

  // ── Mic gain helpers ────────────────────────────────────────────────────

  private muteInput() {
    if (this.micGainNode) this.micGainNode.gain.value = 0;
  }

  private unmuteInput() {
    if (this.micGainNode && !this.isMuted) this.micGainNode.gain.value = 1;
  }

  // ── Reconnection ────────────────────────────────────────────────────────

  private attemptReconnect() {
    if (this.destroyed || this.reconnectAttempts >= this.maxReconnects)
      return;
    this.reconnectAttempts++;
    this.callbacks.onConnectionChange('reconnecting');
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts - 1),
      30000,
    );
    setTimeout(() => this.connect(), delay);
  }
}
