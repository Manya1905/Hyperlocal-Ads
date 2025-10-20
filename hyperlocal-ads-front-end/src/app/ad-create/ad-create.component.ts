import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AdService } from '../ad-service.service';

@Component({
  selector: 'app-ad-create',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styleUrls: ['./ad-create.component.css'],
  template: `
    <h2>Create Ad</h2>
    <div class="form-template">
      <form (ngSubmit)="onSubmit()">

      <!-- [(ngModel)]="lat" means the input’s value is bound to the component property lat.
          So when the user types into the field, the property this.lat is updated automatically. 
      -->
        <div class="element"> 
            <label>Latitude: <input type="number" [(ngModel)]="lat" name="lat" required></label><br>
        </div>
        <div class="element">
          <label>Longitude: <input type="number" [(ngModel)]="lng" name="lng" required></label><br>
        </div>
        <div class="element">
          <label>Radius (km): <input type="number" [(ngModel)]="radiusKm" name="radiusKm" required></label><br>
        </div>
        <div class="element">
          <label>Description: <input type="text" [(ngModel)]="description" name="description" required></label><br>
        </div>
        <div class="element">
          <label>Budget: <input type="number" [(ngModel)]="budget" name="budget" required></label><br>
        </div>
          <!-- "(change)" listens for when a video is uploaded onto the page -->
        <div class="element">
          <label>Video: <input type="file" (change)="onVideoChange($event)" name="video"></label><br>
        </div>
        <div class="element">
          <label>Image: <input type="file" (change)="onImageChange($event)" name="image"></label><br>
        </div>
        <div class="element">
          <button type="submit">Submit</button>
        </div>
      </form>
    </div>
    <p *ngIf="successMessage">{{ successMessage }}</p>
  `,
})

export class AdCreateComponent {
  lat: number = 0;
  lng: number = 0;
  radiusKm: number = 5;
  description: string = '';
  budget: number = 0;
  // ? means the property is optional
  videoFile?: File;
  imageFile?: File;
  successMessage?: string;

  constructor(private adService: AdService) {}

  onVideoChange(event: Event) {
    /*  * Every event has a .target property that points to the element that triggered the event. In this case, it is <input type = "file"> 
        * The event.target is cast into an HTMLInputElement so we can do things like: input.files, input.value, etc. 
    */
    const input = event.target as HTMLInputElement;
    /*  * input.files can be null (e.g., weird browsers or no selection).
        * input.files.length check that at least 1 file was chosen.
    */
    if (input.files && input.files.length) {
      // grab the first file and save it in videoFile
      this.videoFile = input.files[0];
    }
  }

  onImageChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length) {
      this.imageFile = input.files[0];
    }
  }

  onSubmit() {

    /* FormData is a special browser-provided object type that works like a container
    for key–value pairs.

    - Each key is just a string (for example: "lat", "video").
    - Each value can be:
        • simple text (like "42", "New York"), or
        • complex/binary data such as a File or Blob (e.g., photo, video, PDF).

    This makes FormData perfect for sending mixed content (text fields + file uploads)
    to a backend in a single request.
    */
    const formData = new FormData();

    // Creating new keys for the outgoing request. The backend will look for these keys when parsing the request.
    formData.append('lat', this.lat.toString());
    formData.append('lng', this.lng.toString());
    formData.append('radiusKm', this.radiusKm.toString());
    formData.append('description', this.description);
    formData.append('budget', this.budget.toString());
    if (this.videoFile) {
      formData.append('video', this.videoFile);
    }
    if (this.imageFile) {
      formData.append('image', this.imageFile);
    }

    // console logs for debugging
    for (const [k, v] of formData.entries()) {
      console.log('FD', k, v instanceof File ? `${v.name} (${v.type})` : v);
    }

    // call the HTTP request and log errors
    this.adService.createAd(formData).subscribe({
      next: (adId) => {
        this.successMessage = `Ad created with ID: ${adId}`;
      },
      error: (err) => {
        console.error(err);
      }
    });
  }
}