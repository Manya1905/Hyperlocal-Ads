## Hyperlocal Ad Insertion Feature
A dynamic ad insertion system that delivers location-based advertisements during video playback. Built with an Angular front-end and MySQL database, the platform enables advertisers to target viewers based on their geographic location.
The system uses geospatial targeting powered by RedisGeo and a Spring Boot/Java backend to efficiently identify and fetch the nearest relevant ads within a defined radius. When a viewer watches a video, the platform automatically inserts up to 3 contextually relevant ad slots based on their location.
Advertisers can configure campaigns by specifying their budget and target geo-radius using latitude/longitude coordinates, ensuring their ads reach the most relevant local audience.

### Screenshot of the "Create Ad" Page

<img width="2127" height="1226" alt="Screenshot 2025-10-19 221741" src="https://github.com/user-attachments/assets/00863ff4-8197-461d-806a-ef9b2da9b1cc" />

### Screenshot of the "Playback" Page
- Users enter their latitude and longitude in order to determine what ads display as they watch content.

  <img width="671" height="364" alt="image" src="https://github.com/user-attachments/assets/a43df67a-15df-4f36-8bd6-d13747f1b3bc" />

