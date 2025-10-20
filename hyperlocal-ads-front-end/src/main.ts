// bootstrapApplication function starts the app by loading the root component.
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// launching the app
bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));