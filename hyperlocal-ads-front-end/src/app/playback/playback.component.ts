import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AdService } from '../ad-service.service';
import shaka from 'shaka-player';

@Component({
  selector: 'app-playback',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styleUrls: ['./playback.component.css'],
  template: `
    <h2>Video Playback</h2>
    <label>User Latitude: <input type="number" [(ngModel)]="userLat" name = "userLat" required></label><br>
    <label>User Longitude: <input type="number" [(ngModel)]="userLng" name = "userLng" required></label><br>

    <!-- (click) listens for a button click and calls the startPlayback() function -->  
    <button (click)="startPlayback()">Start Playback</button>
    <div class="player-wrap">
      <!-- #videoPlayer is a template reference variable that Angular can use. 
      The '#' tells Angular to treat "videoPlayer" as a reference name, 
      not as a normal HTML attribute. -->
      <video #videoPlayer width="640" height="360" controls></video>
      <div #adContainer class="ad-container"></div>
    </div>
  `
})
export class PlaybackComponent implements OnInit {
/* 
 * @ViewChild('videoPlayer') tells Angular to look for the <video #videoPlayer> in the HTML template.
 * Whatever element #videoPlayer refers to is wrapped in an ElementRef container 
 * and stored in the variable videoElement. 
 * <HTMLVideoElement> specifies the type of the element inside. 
 * videoElement.nativeElement gives direct access to the real <video> DOM element, 
 * so you can call methods like play(), pause(), or check its duration. 
 */

  @ViewChild('videoPlayer') videoElement!: ElementRef<HTMLVideoElement>;

  // ! indicates to Angular that a value will eventually be assigned to the variable. 
  @ViewChild('adContainer') adContainer!: ElementRef<HTMLDivElement>;

  userLat: number = 0;
  userLng: number = 0;

  private player!: shaka.Player;

  //any = variable that can hold anything
  private contentTracker = {
    currentTime: 0,
    duration: NaN,
    paused: true,
    seeking: false,
    playbackRate: 1,
    get seekableRange() {
        const end = Number.isFinite(this.duration) ? this.duration : 0;
        return { start: 0, end };
    }
  };

  private cuePoints: number[] = [];
  private startedCount = 0;   // how many breaks we’ve started
  private readyCount   = 0;   // how many breaks IMA says are ready
  private adPlaying    = false;  // ← keep only ONE definition
  private nextCueIndex = 0;
  private checkMidrollsBound?: () => void;  // to remove the listener later if you want
  private onTimeUpdate?: () => void;  
  private companionTimer?: number;
  private companionHoldUntil = 0;
  private adsLoader?: any;
  private adsManager?: any;
  private adDisplayContainer?: any;
  private manifestUri = 'https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd'; // Hardcoded sample DASH

  constructor(private adService: AdService) {}

  // ngOnInit() is used to run set up code once at the start so that other functions can be used
  ngOnInit() {
    shaka.polyfill.installAll();
    this.player = new shaka.Player();
    this.loadImaSdk();
  }

  /* If the IMA Ads SDK is already available → initialize ads right away.
   * If not, loads SDK from Google's servers and initialize ads once it finishes loading.
   * IMA (Interactive Media Ads) SDK is a JavaScript library from google that helps play ads inside a videoplayer.
   * It parses the Vmap and loads everything in accordingly.  
  */

  loadImaSdk() {
    if ((window as any).google && (window as any).google.ima) {
      this.initAds();
      return;
    }
    const script = document.createElement('script');
    script.src = '//imasdk.googleapis.com/js/sdkloader/ima3.js';
    script.onload = () => this.initAds();
    script.onerror = () => console.error('Failed to load IMA SDK');
    document.head.appendChild(script);
  }

  // Create a new AdDisplayContainer from the IMA SDK.
  // window → the global browser object that holds everything in the page environment.
  // (window as any) → access the global "window" object without TypeScript errors.
  // .google.ima.AdDisplayContainer → class from the IMA SDK that links ads to your player.
  // this.adContainer.nativeElement → the <div #adContainer> in the template, where overlay ads can appear.
  // this.videoElement.nativeElement → the <video #videoPlayer> element, where the main content and video ads play.
  initAds() {
    this.adDisplayContainer = new (window as any).google.ima.AdDisplayContainer(this.adContainer.nativeElement, this.videoElement.nativeElement);
                                                                      /* these parameters tell IMA SDK where to display photo and video ads 
                                                                            → in the adContainer and videoPlayer boxes (defined in HTML code and above with @ViewChild annotation) */
  }

  async startPlayback(): Promise<void> {
    const win = window as any;
    const ima = win.google?.ima;
    if (!this.adDisplayContainer || !ima) {
        console.error('IMA not loaded');
        return;
    }

    // Load Shaka content
    this.player.attach(this.videoElement.nativeElement);
    await this.player.load(this.manifestUri);

    const v = this.videoElement.nativeElement;

    // Sync the tracker with the real video element
    const t = this.contentTracker;
    this.onTimeUpdate = () => {
        t.currentTime   = v.currentTime;
        t.duration      = v.duration || t.duration;
    };
    v.addEventListener('timeupdate', this.onTimeUpdate);
    v.addEventListener('seeking',   () => { t.seeking = true;  this.onTimeUpdate?.(); });
    v.addEventListener('seeked',    () => { t.seeking = false; this.onTimeUpdate?.(); });
    v.addEventListener('play',      () => { t.paused  = false; });
    v.addEventListener('pause',     () => { t.paused  = true;  });
    v.addEventListener('ratechange',() => { t.playbackRate = v.playbackRate; });
    this.onTimeUpdate(); // seed

    // Ensure we know the duration
    if (isNaN(v.duration) || v.duration === 0) {
        await new Promise<void>(res =>
        v.addEventListener('loadedmetadata', () => res(), { once: true })
        );
    }
    const duration = (this.player as any).getDuration?.() ?? v.duration;
    if (!duration || isNaN(duration)) {
        console.error('Duration not available');
        return;
    }

    // Get VMAP from backend
    this.adService.getVmap(this.userLat, this.userLng, duration).subscribe({
        next: (vmapXml: string) => {
        console.log('breaks:', (vmapXml.match(/<vmap:AdBreak\b/g) || []).length);
        console.log('VMAP head:', (vmapXml || '').slice(0, 800));
        console.log('Has <CompanionAds>?', (vmapXml || '').includes('<CompanionAds>'));

        // Must be initialized on user gesture
        this.adDisplayContainer.initialize();

        // Create AdsLoader and set settings **BEFORE requestAds**
        this.adsLoader = new ima.AdsLoader(this.adDisplayContainer);
        const settings = this.adsLoader.getSettings();
        settings.setAutoPlayAdBreaks(true);  
        settings.setPlayerType('shaka');
        settings.setPlayerVersion((shaka as any)?.Player?.version || 'unknown');

        // Loader events
        this.adsLoader.addEventListener(
            ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
            (e: any) => this.onAdsManagerLoaded(e),
            false
        );
        this.adsLoader.addEventListener(
            ima.AdErrorEvent.Type.AD_ERROR,
            (e: any) => console.error('Ad error:', e.getError()),
            false
        );

        // Tell IMA when content ends (enables end/post-rolls if ever used)
        v.addEventListener('ended', () => {
            try { this.adsLoader?.contentComplete(); } catch {}
        }, { once: true });

        // Build the request
        const adsRequest = new ima.AdsRequest();
        adsRequest.adsResponse = vmapXml;
        adsRequest.linearAdSlotWidth  = 640;
        adsRequest.linearAdSlotHeight = 360;
        const rect = this.adContainer.nativeElement.getBoundingClientRect();
        adsRequest.nonLinearAdSlotWidth  = Math.round(rect.width);
        adsRequest.nonLinearAdSlotHeight = Math.round(rect.height);

        // Ask IMA to fetch & schedule ads (mid-rolls fire automatically)
        this.adsLoader.requestAds(adsRequest);

        // Start content playback
        v.play().catch(() => {});
        },
        error: (err) => console.error('Failed to get VMAP', err)
    });
    }


  private renderCompanion(e: any): void {
    try {
      const ima = (window as any).google.ima;
      const ad  = e?.getAd?.();
      if (!ad) return;

      // Prefer 640x375, fallback to "ignore" if exact not available
      const pick = (exact: boolean) => {
        const sel = new ima.CompanionAdSelectionSettings();
        sel.resourceType = ima.CompanionAdSelectionSettings.ResourceType.ALL;
        sel.creativeType = ima.CompanionAdSelectionSettings.CreativeType.ALL;
        sel.sizeCriteria = exact
          ? ima.CompanionAdSelectionSettings.SizeCriteria.SELECT_EXACT_MATCH
          : ima.CompanionAdSelectionSettings.SizeCriteria.IGNORE;
        return (ad.getCompanionAds(640, 375, sel) || [])[0];
      };
      const comp = pick(true) || pick(false);
      if (!comp) return;

      const slot = this.adContainer.nativeElement;
      slot.innerHTML = '';

      const url  = comp.getResourceValue?.();
      const html = comp.getContent?.();

      // A wrapper we can style/control
      const wrapper = document.createElement('div');
      wrapper.className = 'companion-wrapper';

      if (url) {
        // Best case: render our own <img> so we fully control sizing
        const img = new Image();
        img.src = url;
        img.alt = 'Ad';
        img.decoding = 'async';
        img.loading = 'eager';
        wrapper.appendChild(img);
      } else if (html) {
        // IMA HTML snippet — inject and then normalize the first media element
        wrapper.innerHTML = html;

        // Make <a> fill the box so its child centers correctly
        const a = wrapper.querySelector('a') as HTMLAnchorElement | null;
        if (a) {
          a.style.display = 'flex';
          a.style.width = '100%';
          a.style.height = '100%';
          a.style.alignItems = 'center';
          a.style.justifyContent = 'center';
        }

        // Grab first media element and force fit
        const first = wrapper.querySelector('img,video,iframe') as HTMLElement | null;
        if (first) {
          first.style.width = '100%';
          first.style.height = '100%';
          (first as any).style.objectFit = 'contain';
          (first as any).style.maxWidth = '100%';
          (first as any).style.maxHeight = '100%';
          (first as any).style.display = 'block';
          // Remove fixed sizes that creatives sometimes inject
          first.removeAttribute('width');
          first.removeAttribute('height');
        }
      }

      slot.appendChild(wrapper);
    } catch (err) {
      console.error('Companion render error', err);
    }
  }

  private clearCompanion(): void {
    window.clearTimeout(this.companionTimer);
    this.companionHoldUntil = 0;
    this.adContainer.nativeElement.innerHTML = '';  
  }


onAdsManagerLoaded(adsManagerLoadedEvent: any) {
  const ima = (window as any).google.ima;

  try { this.adsManager?.destroy(); } catch {}

  const adsRenderingSettings = new ima.AdsRenderingSettings();
  adsRenderingSettings.restoreCustomPlaybackStateOnAdBreakComplete = true;

  try {
    this.adsManager = adsManagerLoadedEvent.getAdsManager(
      this.videoElement.nativeElement,
      adsRenderingSettings
    );
  } catch (err) {
    console.error('getAdsManager failed:', err);
    this.videoElement.nativeElement.play();
    return;
  }

  // Cue points from VMAP (e.g. [0,20,40])
  try {
    this.cuePoints = (this.adsManager.getCuePoints?.() || [])
      .filter((t: number) => typeof t === 'number' && t >= 0);
  } catch { this.cuePoints = []; }
  console.log('IMA cue points (s):', this.cuePoints);

  this.startedCount = 0;
  this.readyCount   = 0;
  this.adPlaying    = false;

  // Status + companion
  this.adsManager.addEventListener(ima.AdEvent.Type.AD_BREAK_STARTED, () => { 
    this.adPlaying = true; 
    console.log('[IMA] break STARTED');
  });
  this.adsManager.addEventListener(ima.AdEvent.Type.AD_BREAK_ENDED, () => { 
    this.adPlaying = false; 
    console.log('[IMA] break ENDED'); 
    maybeStartNextBreak(); // in case we’re already past the next cue
  });
  this.adsManager.addEventListener(ima.AdEvent.Type.STARTED, (e: any) => {
    this.renderCompanion(e);
  });

  // Pause/resume hooks
  this.adsManager.addEventListener(
    ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED,
    () => this.videoElement.nativeElement.pause()
  );
  this.adsManager.addEventListener(
    ima.AdEvent.Type.CONTENT_RESUME_REQUESTED,
    () => this.videoElement.nativeElement.play()
  );
  this.adsManager.addEventListener(
    ima.AdErrorEvent.Type.AD_ERROR,
    (e: any) => console.error('AdsManager error:', e.getError())
  );

  // Size
  try {
    const w = this.videoElement.nativeElement.clientWidth || 640;
    const h = this.videoElement.nativeElement.clientHeight || 360;
    this.adsManager.init(w, h, ima.ViewMode.NORMAL);
  } catch (adError) {
    console.error('AdsManager init error:', adError);
    this.videoElement.nativeElement.play();
    return;
  }

  // Decide when to start the next break
  const video = this.videoElement.nativeElement;
  const EPS = 0.25;

  const maybeStartNextBreak = () => {
    if (this.adPlaying) return;
    if (this.startedCount >= this.cuePoints.length) return;

    const nextCue = this.cuePoints[this.startedCount];

    // Must be ready and we must be at/after its time
    if (this.readyCount > this.startedCount && video.currentTime >= nextCue - EPS) {
      console.log(`Starting break #${this.startedCount} at cue ${nextCue}s`);
      try {
        this.adsManager.start();
        this.startedCount++;
      } catch (e) {
        console.error('start() failed', e);
      }
    }
  };

  // Each time IMA says a break is ready, try to start it if we’re past its time
  this.adsManager.addEventListener(ima.AdEvent.Type.AD_BREAK_READY, () => {
    this.readyCount++;
    console.log('[IMA] break READY; readyCount=', this.readyCount);
    maybeStartNextBreak();
  });

  // Also poll via content time
  video.addEventListener('timeupdate', maybeStartNextBreak);

  // Kick things off (preroll will start as soon as it’s marked READY)
  maybeStartNextBreak();
}
  onContentPauseRequested() {
    this.videoElement.nativeElement.pause();
    //this.player.pause(); // If needed
  }

  onContentResumeRequested() {
      this.videoElement.nativeElement.play();
    }
}