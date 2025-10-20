import { Routes } from '@angular/router';
import { AdCreateComponent } from './ad-create/ad-create.component';
import { PlaybackComponent } from './playback/playback.component';

/* Creates and exports a constant named routes. It’s typed as Routes (an Angular type 
that's an array of route objects), which is just an array of route definitions. */

export const routes: Routes = [
  { path: 'create', component: AdCreateComponent },
  { path: 'playback', component: PlaybackComponent },

/*   If the user visits the homepage (/), send them to /create. This is a default route. If 
the URL path is empty ('', i.e., the user visits the root /), Angular will redirect to /create. 
The pathMatch: 'full' ensures it only matches when the path is completely empty. */
  { path: '', redirectTo: '/create', pathMatch: 'full' }
];