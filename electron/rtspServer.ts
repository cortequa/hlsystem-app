import express from 'express';
import { Server } from 'http';
import { WebSocketServer } from 'ws';
import { spawn, ChildProcess } from 'child_process';
import { createServer } from 'http';
import path from 'path';
import { execSync } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

// RTSP URL může obsahovat přihlašovací údaje kamery (rtsp://user:pass@host).
// Do logů je nikdy nepíšeme v plaintextu (prod-check).
function redactRtspUrl(url: string): string {
  return url.replace(/(rtsp:\/\/)[^@/]+@/i, '$1***@');
}

// Get FFmpeg path
function getFFmpegPath(): string {
  // Try simple 'ffmpeg' command first
  try {
    execSync('ffmpeg -version', { stdio: 'ignore', timeout: 5000 });
    console.log('FFmpeg found in PATH');
    return 'ffmpeg';
  } catch (e) {
    console.log('FFmpeg not found in PATH');
  }
  
  // Try common installation paths
  const commonPaths = [
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\ffmpeg\\ffmpeg-2025-07-10-git-82aeee3c19-essentials_build\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe',
  ];
  
  for (const testPath of commonPaths) {
    try {
      console.log('Testing FFmpeg path:', testPath);
      execSync(`"${testPath}" -version`, { stdio: 'ignore', timeout: 5000 });
      console.log('FFmpeg found at:', testPath);
      return testPath;
    } catch (e) {
      console.log('FFmpeg not found at:', testPath);
      continue;
    }
  }
  
  // As a last resort, try to find a working FFmpeg from common download locations
  const downloadPaths = [
    'C:\\Users\\%USERNAME%\\Downloads\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Tools\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\ffmpeg-master-latest-win64-gpl\\bin\\ffmpeg.exe',
  ];
  
  for (const testPath of downloadPaths) {
    try {
      const expandedPath = testPath.replace('%USERNAME%', process.env.USERNAME || '');
      console.log('Testing download path:', expandedPath);
      execSync(`"${expandedPath}" -version`, { stdio: 'ignore', timeout: 5000 });
      console.log('FFmpeg found at:', expandedPath);
      return expandedPath;
    } catch (e) {
      continue;
    }
  }
  
  throw new Error('FFmpeg not found. Please install FFmpeg:\\n' +
    '1. Download from https://ffmpeg.org/download.html\\n' +
    '2. Extract to C:\\\\ffmpeg\\\\ or add to PATH\\n' +
    '3. Or try: winget install Gyan.FFmpeg');
}

interface StreamInstance {
  ffmpegProcess: ChildProcess;
  server: Server;
  wsServer: WebSocketServer;
  port: number;
}


// Detekce dostupných kodeků pro hardware akceleraci
async function detectAvailableCodecs(): Promise<{
  hasNvidiaGpu: boolean;
  hasIntelQsv: boolean;
  hasAmdAmf: boolean;
  supportedCodecs: string[];
}> {
  const ffmpegPath = getFFmpegPath();
  
  try {
    const { stdout } = await execAsync(`"${ffmpegPath}" -encoders`);
    
    const result = {
      hasNvidiaGpu: stdout.includes('h264_nvenc') || stdout.includes('hevc_nvenc'),
      hasIntelQsv: stdout.includes('h264_qsv') || stdout.includes('hevc_qsv'),
      hasAmdAmf: stdout.includes('h264_amf') || stdout.includes('hevc_amf'),
      supportedCodecs: [] as string[]
    };
    
    // Priorita kodeků podle efektivity
    if (result.hasNvidiaGpu) {
      result.supportedCodecs.push('h264_nvenc');
      console.log('✅ NVIDIA GPU encoding available (h264_nvenc)');
    }
    if (result.hasIntelQsv) {
      result.supportedCodecs.push('h264_qsv');
      console.log('✅ Intel Quick Sync Video available (h264_qsv)');
    }
    if (result.hasAmdAmf) {
      result.supportedCodecs.push('h264_amf');
      console.log('✅ AMD AMF encoding available (h264_amf)');
    }
    
    // Fallback na optimalizovaný software kodek
    result.supportedCodecs.push('libx264');
    
    return result;
  } catch (error) {
    console.log('⚠️ Could not detect hardware codecs, using software fallback');
    return {
      hasNvidiaGpu: false,
      hasIntelQsv: false,
      hasAmdAmf: false,
      supportedCodecs: ['libx264']
    };
  }
}

// Optimalizované argumenty podle dostupného hardware
async function getOptimizedFFmpegArgs(rtspUrl: string): Promise<string[]> {
  const codecInfo = await detectAvailableCodecs();
  const primaryCodec = codecInfo.supportedCodecs[0];
  
  console.log(`🎯 Using codec: ${primaryCodec}`);
  
  // Základní argumenty
  let args = [
    '-rtsp_transport', 'tcp',
    '-use_wallclock_as_timestamps', '1',
    '-fflags', '+discardcorrupt',
    '-i', rtspUrl
  ];
  
  // Video kódování podle dostupného hardware
  if (primaryCodec.includes('nvenc')) {
    // NVIDIA GPU optimalizace
    args = args.concat([
      '-c:v', 'h264_nvenc',
      '-preset', 'p1',           // Nejrychlejší NVENC preset
      '-tune', 'zerolatency',
      '-profile:v', 'baseline',   // Nejjednodušší profil
      '-level', '3.0',
      '-rc', 'cbr',              // Constant bitrate
      '-b:v', '200k',            // Velmi nízký bitrate
      '-maxrate', '300k',
      '-bufsize', '400k'
    ]);
  } else if (primaryCodec.includes('qsv')) {
    // Intel Quick Sync optimalizace
    args = args.concat([
      '-c:v', 'h264_qsv',
      '-preset', 'veryfast',
      '-profile:v', 'baseline',
      '-b:v', '200k',
      '-maxrate', '300k',
      '-bufsize', '400k'
    ]);
  } else if (primaryCodec.includes('amf')) {
    // AMD AMF optimalizace
    args = args.concat([
      '-c:v', 'h264_amf',
      '-usage', 'webcam',        // Optimalizace pro real-time
      '-profile:v', 'baseline',
      '-b:v', '200k',
      '-maxrate', '300k',
      '-bufsize', '400k'
    ]);
  } else {
    // Software kodek - maximálně optimalizováno
    args = args.concat([
      '-c:v', 'libx264',
      '-preset', 'ultrafast',    // Nejrychlejší možné
      '-tune', 'zerolatency',
      '-profile:v', 'baseline',
      '-x264-params', 'nal-hrd=cbr:force-cfr=1',
      '-b:v', '150k',            // Ještě nižší bitrate pro software
      '-maxrate', '200k',
      '-bufsize', '300k'
    ]);
  }
  
  // Společné video parametry
  args = args.concat([
    '-s', '320x240',             // Malé rozlišení
    '-r', '8',                   // Velmi nízký framerate (8 FPS)
    '-g', '24',                  // GOP size = 3x framerate
    '-keyint_min', '8',
    '-sc_threshold', '0',
    '-f', 'mpegts',
    '-an',                       // Žádné audio
    '-threads', '1',             // Jen 1 vlákno pro kódování
    '-flags', '+global_header',
    '-fflags', '+flush_packets',
    '-avoid_negative_ts', 'make_zero',
    '-'
  ]);
  
  return args;
}

// Test RTSP connection function
async function testRTSPConnection(rtspUrl: string, timeoutMs: number = 10000): Promise<{
  success: boolean;
  error?: string;
  details?: string;
}> {
  return new Promise((resolve) => {
    const ffmpegPath = getFFmpegPath();
    
    // Use FFprobe to test RTSP connection
    const testProcess = spawn(ffmpegPath, [
      '-rtsp_transport', 'tcp',
      '-i', rtspUrl,
      '-t', '1', // Test for 1 second
      '-f', 'null',
      '-'
    ]);

    let hasResponded = false;
    const timeout = setTimeout(() => {
      if (!hasResponded) {
        hasResponded = true;
        testProcess.kill();
        resolve({
          success: false,
          error: 'Connection timeout',
          details: `RTSP stream did not respond within ${timeoutMs}ms`
        });
      }
    }, timeoutMs);

    let errorOutput = '';
    testProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    testProcess.on('exit', (code) => {
      if (!hasResponded) {
        hasResponded = true;
        clearTimeout(timeout);
        
        if (code === 0 || errorOutput.includes('frame=')) {
          resolve({ success: true });
        } else {
          resolve({
            success: false,
            error: `FFmpeg exit code: ${code}`,
            details: errorOutput.substring(0, 500) // Limit error output
          });
        }
      }
    });

    testProcess.on('error', (error) => {
      if (!hasResponded) {
        hasResponded = true;
        clearTimeout(timeout);
        resolve({
          success: false,
          error: error.message,
          details: 'Failed to start FFmpeg process'
        });
      }
    });
  });
}

export class RTSPStreamServer {
  private streams: Map<string, StreamInstance> = new Map();
  private basePort = 9999;
  private currentPort = this.basePort;

  // Run system diagnostics
  private async runDiagnostics(): Promise<{
    ffmpegAvailable: boolean;
    ffmpegVersion: string | null;
    networkInfo: any;
    systemInfo: any;
  }> {
    const diagnostics = {
      ffmpegAvailable: false,
      ffmpegVersion: null as string | null,
      networkInfo: {},
      systemInfo: {}
    };

    // Check FFmpeg
    try {
      const ffmpegPath = getFFmpegPath();
      const { stdout } = await execAsync(`"${ffmpegPath}" -version`);
      diagnostics.ffmpegAvailable = true;
      diagnostics.ffmpegVersion = stdout.split('\n')[0];
      console.log('✅ FFmpeg available:', diagnostics.ffmpegVersion);
    } catch (error) {
      console.log('❌ FFmpeg not available:', error);
    }

    // Check network info
    try {
      const { stdout } = await execAsync('ipconfig');
      diagnostics.networkInfo = { ipconfig: stdout.substring(0, 500) }; // Limit output
    } catch (error) {
      console.log('Network info check failed:', error);
    }

    // Check system info
    try {
      diagnostics.systemInfo = {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        env: {
          PATH: process.env.PATH ? 'SET' : 'NOT_SET',
          USERNAME: process.env.USERNAME || 'UNKNOWN'
        }
      };
    } catch (error) {
      console.log('System info check failed:', error);
    }

    return diagnostics;
  }

  async startStream(rtspUrl: string, streamId: string): Promise<number> {
    // Check if stream already exists
    if (this.streams.has(streamId)) {
      console.log(`Stream ${streamId} already exists, returning existing port`);
      return this.streams.get(streamId)!.port;
    }

    console.log(`🔄 Starting diagnostics for stream ${streamId}`);
    
    // Run system diagnostics
    const diagnostics = await this.runDiagnostics();
    console.log('System diagnostics:', JSON.stringify(diagnostics, null, 2));
    
    if (!diagnostics.ffmpegAvailable) {
      throw new Error(`FFmpeg is not available on this system. Please install FFmpeg:\n` +
        `1. Download from https://ffmpeg.org/download.html\n` +
        `2. Extract to C:\\ffmpeg\\ or add to PATH\n` +
        `3. Or try: winget install Gyan.FFmpeg`);
    }

    // Test RTSP connection first
    console.log(`🔄 Testing RTSP connection for ${streamId}: ${redactRtspUrl(rtspUrl)}`);
    const connectionTest = await testRTSPConnection(rtspUrl, 15000);
    
    if (!connectionTest.success) {
      const errorMsg = `Failed to connect to RTSP stream ${streamId}:\n` +
        `URL: ${rtspUrl}\n` +
        `Error: ${connectionTest.error}\n` +
        `Details: ${connectionTest.details}\n\n` +
        `Possible causes:\n` +
        `1. Camera is not reachable from this network\n` +
        `2. RTSP URL is incorrect\n` +
        `3. Camera requires authentication\n` +
        `4. Network firewall blocking connection`;
      
      console.error('❌ RTSP Connection Test Failed:', errorMsg);
      throw new Error(errorMsg);
    }
    
    console.log(`✅ RTSP connection test successful for ${streamId}`);

    const port = this.currentPort++;
    
    // Create HTTP server
    const server = createServer();
    
    // Create WebSocket server
    const wsServer = new WebSocketServer({ server });
    
    // Test RTSP URL first
    console.log(`Testing RTSP connection for ${streamId}: ${redactRtspUrl(rtspUrl)}`);
    
    // Optimalizované FFmpeg parametry pro nižší zátěž CPU
    const ffmpegArgs = [
      // RTSP optimalizace
      '-rtsp_transport', 'tcp',
      '-i', rtspUrl,
      
      // Výstupní formát
      '-f', 'mpegts',
      
      // Video kodeky - zkusíme hardware akceleraci
      '-c:v', 'h264_nvenc',  // NVIDIA GPU akcelerace
      '-preset', 'fast',      // Rychlé kódování
      '-tune', 'zerolatency', // Minimální latence
      
      // Pokud selže hardware, fallback na optimalizovaný software
      '-c:v', 'libx264',
      '-preset', 'ultrafast', // Nejrychlejší preset
      '-tune', 'zerolatency',
      
      // Rozlišení a kvalita - výrazně sníženo
      '-s', '320x240',        // Menší rozlišení = méně práce
      '-r', '10',             // Snížený framerate z 25 na 10 FPS
      '-b:v', '300k',         // Snížený bitrate z 1000k na 300k
      '-maxrate', '400k',     // Maximální bitrate
      '-bufsize', '600k',     // Buffer size
      
      // GOP optimalizace
      '-g', '30',             // GOP size snížen z 50
      '-keyint_min', '10',    // Minimální keyframe interval
      '-sc_threshold', '0',   // Zakázat scene change detection
      
      // Audio optimalizace - zcela zakázáno pro úsporu výkonu
      '-an',                  // No audio = významná úspora CPU
      
      // Obecné optimalizace
      '-threads', '2',        // Omezit počet vláken
      '-flags', '+global_header',
      '-fflags', '+genpts+flush_packets',
      '-avoid_negative_ts', 'make_zero',
      
      // Výstup
      '-'
    ];

    // Start FFmpeg process (URL redigované — může obsahovat creds kamery).
    console.log(`Starting FFmpeg for stream ${streamId} with URL: ${redactRtspUrl(rtspUrl)}`);
    console.log(`FFmpeg args:`, ffmpegArgs.map((a) => (a === rtspUrl ? redactRtspUrl(a) : a)));

    const ffmpegPath = getFFmpegPath();
    console.log(`Using FFmpeg path: ${ffmpegPath}`);
    
    const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);
    
    // Handle FFmpeg stdout (video stream)
    let dataReceived = false;
    ffmpegProcess.stdout.on('data', (data) => {
      if (!dataReceived) {
        console.log(`First data chunk received for ${streamId}, size: ${data.length}`);
        dataReceived = true;
      }
      
      // Broadcast to all connected WebSocket clients
      wsServer.clients.forEach((client) => {
        if (client.readyState === client.OPEN) {
          client.send(data);
        }
      });
    });

    // Handle FFmpeg errors
    ffmpegProcess.stderr.on('data', (data) => {
      const errorText = data.toString();
      // Filter out common non-critical audio timestamp warnings to reduce console spam
      if (!errorText.includes('Non-monotonic DTS') && 
          !errorText.includes('changing to') && 
          !errorText.includes('incorrect timestamps')) {
        console.error(`FFmpeg stderr for ${streamId}:`, errorText);
      }
    });

    ffmpegProcess.on('error', (error) => {
      console.error(`FFmpeg error for ${streamId}:`, error);
    });

    ffmpegProcess.on('close', (code) => {
      console.log(`FFmpeg process for ${streamId} exited with code ${code}`);
    });

    // Handle WebSocket connections
    wsServer.on('connection', (ws) => {
      console.log(`New WebSocket connection for stream ${streamId}`);
      
      ws.on('close', () => {
        console.log(`WebSocket connection closed for stream ${streamId}`);
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error for stream ${streamId}:`, error);
      });
    });

    // Start HTTP server — BIND JEN NA LOCALHOST (renderer se připojuje na
    // ws://127.0.0.1:port). Bez explicitního hostu by ws relay poslouchal na
    // 0.0.0.0 a kamerový stream by byl dostupný komukoli v LAN (prod-check).
    server.listen(port, '127.0.0.1', () => {
      console.log(`RTSP stream server running on 127.0.0.1:${port} for stream ${streamId}`);
    });

    // Store stream instance
    this.streams.set(streamId, { ffmpegProcess, server, wsServer, port });
    
    return port;
  }

  stopStream(streamId: string): void {
    const streamInstance = this.streams.get(streamId);
    if (streamInstance) {
      // Kill FFmpeg process
      streamInstance.ffmpegProcess.kill('SIGKILL');
      
      // Close WebSocket server
      streamInstance.wsServer.close();
      
      // Close HTTP server
      streamInstance.server.close();
      
      this.streams.delete(streamId);
      console.log(`Stopped stream ${streamId}`);
    }
  }

  stopAllStreams(): void {
    for (const [streamId] of this.streams) {
      this.stopStream(streamId);
    }
  }

  getStreamPort(streamId: string): number | null {
    const streamInstance = this.streams.get(streamId);
    return streamInstance ? streamInstance.port : null;
  }
}

export const rtspStreamServer = new RTSPStreamServer();
