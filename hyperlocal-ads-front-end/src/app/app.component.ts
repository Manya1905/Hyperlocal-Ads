import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  styleUrls: ['./app.component.css'],
  template: `
    <!-- <nav> = tag for navigation bar -->
    <nav class="navbar">
      <!-- <a> = standard HTML link tag. -->
      <a routerLink="/create" class="nav-link">Create Ad</a> |
      <a routerLink="/playback" class="nav-link">Playback</a>

      <!-- routerLink = Angular directive that maps the link to a route (like /create) defined in the routing 
       configuration, telling Angular which component to load without reloading the page. Ex: path: 'create', 
       component: AdCreateComponent -->

    </nav>
    <router-outlet></router-outlet>
  `,
})
export class AppComponent {}