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
  private contentTracker = { currentTime: 0, duration: NaN };
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

    // Load content
    this.player.attach(this.videoElement.nativeElement);
    await this.player.load(this.manifestUri);

    const v = this.videoElement.nativeElement;

    // keep IMA’s playhead in sync with Shaka/HTML5 video
    this.onTimeUpdate = () => {
      this.contentTracker.currentTime = v.currentTime;
      this.contentTracker.duration    = v.duration || this.contentTracker.duration;
    };
    v.addEventListener('timeupdate', this.onTimeUpdate);
    v.addEventListener('seeking',    this.onTimeUpdate);
    this.onTimeUpdate(); // seed initial values

    // (optional but good for VMAP autoscheduling)
    this.adsLoader.getSettings().setAutoPlayAdBreaks(true);

    // Wait until duration is known
    //const v = this.videoElement.nativeElement;
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

    this.adService.getVmap(this.userLat, this.userLng, duration).subscribe({
      next: (vmapXml: string) => {
        console.log(vmapXml);
        console.log('breaks:', (vmapXml.match(/<vmap:AdBreak\b/g) || []).length);
        console.log('VMAP head:', (vmapXml || '').slice(0, 800));
        console.log('Has <CompanionAds>?', (vmapXml || '').includes('<CompanionAds>'));

        this.adDisplayContainer.initialize();

        this.adsLoader = new ima.AdsLoader(this.adDisplayContainer);
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

        v.addEventListener('ended', () => {
          try { this.adsLoader?.contentComplete(); } catch {}
        }, { once: true });

        const adsRequest = new ima.AdsRequest();
        adsRequest.adsResponse = vmapXml;

        // Match your CSS/video sizes
        adsRequest.linearAdSlotWidth  = 640;
        adsRequest.linearAdSlotHeight = 360;

        const rect = this.adContainer.nativeElement.getBoundingClientRect();
        adsRequest.nonLinearAdSlotWidth  = Math.round(rect.width);
        adsRequest.nonLinearAdSlotHeight = Math.round(rect.height);

        // === ADDED: tell IMA when content ended so post-/end-breaks are eligible
        v.addEventListener('ended', () => {
          try { this.adsLoader?.contentComplete(); } catch {}
        }, { once: true });

        // === ADDED: quick debug to see we cross midroll timestamps
        let lastLog = -1;
        v.addEventListener('timeupdate', () => {
          const t = Math.floor(v.currentTime);
          if (t !== lastLog && (t === 15 || t === 18 || t === 19 || t === 20 || t === 39 || t === 40)) {
            console.log('content time', t, 's');
            lastLog = t;
          }
        });

        // Let IMA auto-play each break per VMAP offsets
        this.adsLoader.requestAds(adsRequest);

        v.play().catch(() => { /* autoplay guard */ });
      },
      error: (err) => console.error('Failed to get VMAP', err)
    });
  }


/* async startPlayback() {
    if (!this.adDisplayContainer) {
      console.error('IMA not loaded');
      return;
    }

    this.player.attach(this.videoElement.nativeElement);
    await this.player.load(this.manifestUri);

    const duration = this.videoElement.nativeElement.duration;
    if (!duration) {
      console.error('Duration not available');
      return;
    }

    this.adService.getVmap(this.userLat, this.userLng, duration).subscribe({
      next: async (vmapXml) => {
        this.adDisplayContainer.initialize();

        this.adsLoader = new (window as any).google.ima.AdsLoader(this.adDisplayContainer);

        this.adsLoader.addEventListener(
          (window as any).google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
          (e: any) => this.onAdsManagerLoaded(e),
          false
        );

        this.adsLoader.addEventListener(
          (window as any).google.ima.AdErrorEvent.Type.AD_ERROR,
          (e: any) => console.error('Ad error:', e.getError()),
          false
        );

        const adsRequest = new (window as any).google.ima.AdsRequest();
        adsRequest.adsResponse = vmapXml; // Use the VMAP XML directly
        adsRequest.linearAdSlotWidth = 640;
        adsRequest.linearAdSlotHeight = 360;
        adsRequest.nonLinearAdSlotWidth = 640;
        adsRequest.nonLinearAdSlotHeight = 150;

        const rect = this.adContainer.nativeElement.getBoundingClientRect();
        adsRequest.nonLinearAdSlotWidth  = Math.round(rect.width);
        adsRequest.nonLinearAdSlotHeight = Math.round(rect.height);

        const ima = (window as any).google.ima;

        // Create a companion slot bound to your right-hand div
        this.companionSlot = new ima.CompanionAdSlot(
          this.adContainer.nativeElement,
          640, 150
        );

        // Tell IMA about your companion slot
        adsRequest.companionSlots = [ this.companionSlot ];

        // (optional, but helps show a companion when available)
        this.adsLoader.getSettings().setCompanionBackfill(
          ima.CompanionBackfillMode.ALWAYS
        );

        // Keep SDK slot sizes in sync with your CSS box
        //const rect = this.adContainer.nativeElement.getBoundingClientRect();
        adsRequest.nonLinearAdSlotWidth  = Math.round(rect.width);
        adsRequest.nonLinearAdSlotHeight = Math.round(rect.height);
        adsRequest.linearAdSlotWidth     = 640;
        adsRequest.linearAdSlotHeight    = 360;

        this.adsLoader.requestAds(adsRequest);

        // Start content playback after ads setup
        this.videoElement.nativeElement.play();
      },
      error: (err) => console.error('Failed to get VMAP', err)
    });
  }*/

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

  private adPlaying = false;   // add this field to the class

  onAdsManagerLoaded(adsManagerLoadedEvent: any) {
    const ima = (window as any).google.ima;

    // Make sure IMA will auto-play mid-rolls at the VMAP offsets
    try {
      const settings = this.adsLoader?.getSettings?.();
      settings?.setAutoPlayAdBreaks(true);     // <-- important for mid-rolls
      settings?.setPlayerType('shaka');
      settings?.setPlayerVersion((shaka as any)?.Player?.version || 'unknown');
    } catch {}

    const adsRenderingSettings = new ima.AdsRenderingSettings();
    adsRenderingSettings.restoreCustomPlaybackStateOnAdBreakComplete = true;

    // Create AdsManager safely
    /*try {
      this.adsManager = adsManagerLoadedEvent.getAdsManager(
        this.videoElement.nativeElement,        // HTMLVideoElement is fine with Shaka
        adsRenderingSettings
      );
    } catch (err) {
      console.error('getAdsManager failed:', err);
      this.videoElement.nativeElement.play();
      return;
    }*/
      try {
      this.adsManager = adsManagerLoadedEvent.getAdsManager(
        this.contentTracker,                      // <— changed
        adsRenderingSettings
      );
    } catch (err) {
      console.error('getAdsManager failed:', err);
      this.videoElement.nativeElement.play();
      return;
    }

    // ---- DEBUG: see what IMA thinks the cue points are
    try {
      const cps = this.adsManager.getCuePoints?.() || [];
      console.log('IMA cue points (s):', cps);
    } catch {}

    // ---- Helpful ad break lifecycle logs
    const log = (type: string) => () => console.log('[IMA]', type);
    this.adsManager.addEventListener(ima.AdEvent.Type.AD_BREAK_READY,   log('AD_BREAK_READY'));
    this.adsManager.addEventListener(ima.AdEvent.Type.AD_BREAK_STARTED, log('AD_BREAK_STARTED'));
    this.adsManager.addEventListener(ima.AdEvent.Type.AD_BREAK_ENDED,   log('AD_BREAK_ENDED'));

    // Render companion only when a linear ad actually starts
    this.adsManager.addEventListener(
      ima.AdEvent.Type.STARTED,
      (e: any) => {
        this.renderCompanion(e);
        // Keep it visible for ~15s (your hold logic)
        window.clearTimeout(this.companionTimer);
        this.companionTimer = window.setTimeout(() => this.clearCompanion(), 15000);
      }
    );

    // Don’t clear on COMPLETE; it can fire early on long ads and cause flicker
    this.adsManager.addEventListener(
      ima.AdErrorEvent.Type.AD_ERROR,
      (e: any) => console.error('AdsManager error:', e.getError())
    );
    this.adsManager.addEventListener(
      ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED,
      () => this.onContentPauseRequested()
    );
    this.adsManager.addEventListener(
      ima.AdEvent.Type.CONTENT_RESUME_REQUESTED,
      () => this.onContentResumeRequested()
    );

    // Init/start with actual video element size
    try {
      const w = this.videoElement.nativeElement.clientWidth || 640;
      const h = this.videoElement.nativeElement.clientHeight || 360;
      this.adsManager.init(w, h, ima.ViewMode.NORMAL);
      this.adsManager.start();                 // starts preroll; mid-rolls should auto-fire
    } catch (adError) {
      console.error('AdsManager init/start error:', adError);
      this.videoElement.nativeElement.play();
    }
  }



  /*onAdsManagerLoaded(adsManagerLoadedEvent: any) {
    const ima = (window as any).google.ima;

    const adsRenderingSettings = new ima.AdsRenderingSettings();
    adsRenderingSettings.restoreCustomPlaybackStateOnAdBreakComplete = true;

    // Create AdsManager safely
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

    // === Events (no duplicates) ===

    // Companions are reliably available at STARTED
    this.adsManager.addEventListener(
      ima.AdEvent.Type.STARTED,
      (e: any) => this.renderCompanion(e)
    );

    // Clear the side box when ad finishes or the break ends
    this.adsManager.addEventListener(
      ima.AdEvent.Type.COMPLETE,
      () => this.clearCompanion()
    );
    this.adsManager.addEventListener(
      ima.AdEvent.Type.AD_BREAK_ENDED,
      () => this.clearCompanion()
    );

    // Standard lifecycle + error handlers
    this.adsManager.addEventListener(
      ima.AdErrorEvent.Type.AD_ERROR,
      (e: any) => console.error('AdsManager error:', e.getError())
    );
    this.adsManager.addEventListener(
      ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED,
      () => this.onContentPauseRequested()
    );
    this.adsManager.addEventListener(
      ima.AdEvent.Type.CONTENT_RESUME_REQUESTED,
      () => this.onContentResumeRequested()
    );

    // === Init/start with actual video element size ===
    try {
      const w = this.videoElement.nativeElement.clientWidth || 640;
      const h = this.videoElement.nativeElement.clientHeight || 360;
      this.adsManager.init(w, h, ima.ViewMode.NORMAL);
      this.adsManager.start();
    } catch (adError) {
      console.error('AdsManager init/start error:', adError);
      this.videoElement.nativeElement.play();
    }
  }*/


  onContentPauseRequested() {
    this.videoElement.nativeElement.pause();
    //this.player.pause(); // If needed
  }

  onContentResumeRequested() {
      this.videoElement.nativeElement.play();
    }
}