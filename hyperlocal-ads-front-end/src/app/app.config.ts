import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideHttpClient } from '@angular/common/http';

/* Declares and exports a constant named appConfig of type ApplicationConfig. 
This object is handed to bootstrapApplication(AppComponent, appConfig) in main.ts. */
export const appConfig: ApplicationConfig = {
  /* Global providers array. Everything listed here gets registered once for the whole app at bootstrap time */
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),

    /* Activates the Router with your imported routes. After this, routerLink, Router, and <router-outlet> work, 
    and URLs like /create and /playback map to their components */
    provideRouter(routes),
    provideHttpClient()
  ]
};

/* import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes)
  ]
}; */
