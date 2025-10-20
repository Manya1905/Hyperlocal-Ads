package com.example.hyperlocalads.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.PathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import com.example.hyperlocalads.service.AdService;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Path;

@RestController
@RequestMapping("/api/ads")
@CrossOrigin(
  origins = "http://localhost:4300",
  allowedHeaders = "*",
  methods = { RequestMethod.GET, RequestMethod.POST, RequestMethod.OPTIONS }
)
public class AdController {

    @Autowired
    private AdService adService;

    @PostMapping(value = "/create", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
        public ResponseEntity<?> createAd(
            @RequestParam double lat,
            @RequestParam double lng,
            @RequestParam double radiusKm,
            @RequestParam String description,
            @RequestParam BigDecimal budget,
            @RequestParam(required = false) MultipartFile video,
            @RequestParam(required = false) MultipartFile image) {

        try {
            Long adId = adService.createAd(lat, lng, radiusKm, description, budget, video, image);
            return ResponseEntity.ok(adId);
        } catch (Exception e) {
            e.printStackTrace(); // also prints to server console
            return ResponseEntity.status(500).body("createAd failed: " + e.getClass().getSimpleName() + " - " + e.getMessage());
        }
    }

    @PostMapping("/match")
     /* ResponseEntity is a Spring class that represents the **entire HTTP response**.
      * It lets you fully control the HTTP status code (e.g., 200 OK), headers (e.g., Content-Type), and body (the actual data sent to the client).
      * In this case, ResponseEntity<String> means we are returning a String as the response body.
      */
    public ResponseEntity<String> matchAds(@RequestBody MatchRequest request) {

            /* @RequestBody means:
     *   - The incoming HTTP POST request will contain a body in JSON format (by default).
     *   - Spring will automatically convert (deserialize) that JSON into a Java object of type MatchRequest.
     *   - MatchRequest has fields like lat, lng, and duration (defined in entities folder)
     *   - Example incoming JSON:
     *       {
     *         "lat": 12.9716,
     *         "lng": 77.5946,
     *         "duration": 60
     *       }
     *   This saves the frontend from manually sending query params.
     */
        // get values from RequestBody MatchRequest request
        String vmap = adService.getVmap(request.getLat(), request.getLng(), request.getDuration());

        return ResponseEntity.ok()                          // Creates HTTP 200 OK response = success. If not 200, frontend reads it as an error & won't parse
                .contentType(MediaType.APPLICATION_XML)     // Sets Content-Type header to application/xml so frontend knows how to parse
                .body(vmap);                                // Body contains the VMAP XML string returned by getVmap().
    }

    @GetMapping("/{adId}/video")
    public ResponseEntity<Resource> getVideo(@PathVariable Long adId) {
        Path path = adService.getCreativePath(adId, "video");
        Resource resource = new PathResource(path);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"video.mp4\"")
                .contentType(MediaType.valueOf("video/mp4"))
                .body(resource);
    }

    @GetMapping("/{adId}/image")
    public ResponseEntity<Resource> getImage(@PathVariable Long adId) {
        Path path = adService.getCreativePath(adId, "image");
        Resource resource = new PathResource(path);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"image.jpg\"")
                .contentType(MediaType.IMAGE_JPEG)
                .body(resource);
    }
}
