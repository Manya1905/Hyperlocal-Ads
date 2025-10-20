package com.example.hyperlocalads.service;

import com.example.hyperlocalads.entity.Ad;
import com.example.hyperlocalads.repository.AdRepository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.geo.*;
import org.springframework.data.redis.connection.RedisGeoCommands;
import org.springframework.data.redis.core.GeoOperations;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

@Service
public class AdService {

    private static final String GEO_KEY = "ads:geo";
    private static final String METADATA_PREFIX = "ads:metadata:";
    private static final int MAX_ADS = 3;
    private static final double MAX_SEARCH_RADIUS_KM = 1.0;
    private static final String BASE_URL = "http://localhost:8080"; // Configurable in prod
    private static final Logger log = LoggerFactory.getLogger(AdService.class);


    /*
     * @Autowired injects the corresponding bean from the application context (bean container created by Spring 
     * upon running the application). The same bean instance is injected wherever required. 
     */
    @Autowired
    private AdRepository adRepository;

    @Autowired
    /*
     * RedisTemplate lets us work with and choose Redis data structures 
     * (hashes, lists, sets, geo, etc.) without writing raw Redis command syntax.
     * The <String, String> means both the key and the value must be Strings.
     */
    private RedisTemplate<String, String> redisTemplate;

    @Value("${ads.storage.path}")
    private String storagePath; // e.g., /ads in application.properties

    public Long createAd(double lat, double lng, double radiusKm, String description, BigDecimal budget,
                         MultipartFile video, MultipartFile image) throws IOException {

        // Initialize all variables and save in repo
        Ad ad = new Ad();
        ad.setLat(lat);
        ad.setLng(lng);
        ad.setRadiusKm(radiusKm);
        ad.setDescription(description);
        ad.setBudget(budget);
        ad = adRepository.save(ad);

        Long adId = ad.getId();
        String adDir = storagePath + "/" + adId;
        // Creates a file to save ad data
        Files.createDirectories(Paths.get(adDir));

        String videoUrl = null;
        if (video != null && !video.isEmpty()) {
            String videoPath = adDir + "/video.mp4";

            // Move file into a permanent location 
            video.transferTo(new File(videoPath));
            videoUrl = BASE_URL + "/api/ads/" + adId + "/video";
        }

        String imageUrl = null;
        if (image != null && !image.isEmpty()) {
            String imagePath = adDir + "/image.jpg";
            image.transferTo(new File(imagePath));
            imageUrl = BASE_URL + "/api/ads/" + adId + "/image";
        }

        // Index in Redis
        GeoOperations<String, String> geoOps = redisTemplate.opsForGeo();
        geoOps.add(GEO_KEY, new Point(lng, lat), adId.toString());

        // Save all the metadata into a HashMap
        //           Redis key|hash key|hash val
        HashOperations<String, String, String> hashOps = redisTemplate.opsForHash();
        Map<String, String> metadata = new HashMap<>();
        // Save all the components of metadata into a HashMap
        metadata.put("description", description);
        metadata.put("budget", budget.toString());
        metadata.put("radiusKm", String.valueOf(radiusKm));
        if (videoUrl != null) metadata.put("videoUrl", videoUrl);
        if (imageUrl != null) metadata.put("imageUrl", imageUrl);
        // save the hashMap into one of Redis's data structures
        hashOps.putAll(METADATA_PREFIX + adId, metadata);

        return adId;
    }

    public String getVmap(double userLat, double userLng, double duration) {
        try {
            GeoOperations<String, String> geoOps = redisTemplate.opsForGeo();
            Circle circle = new Circle(
                new Point(userLng, userLat),
                new Distance(MAX_SEARCH_RADIUS_KM, Metrics.KILOMETERS)
            );

            GeoResults<RedisGeoCommands.GeoLocation<String>> results =
                geoOps.radius(GEO_KEY, circle,
                    RedisGeoCommands.GeoRadiusCommandArgs.newGeoRadiusArgs().includeDistance());

            List<Map<String, String>> matchedAds = new ArrayList<>();
            HashOperations<String, String, String> hashOps = redisTemplate.opsForHash();

            if (results != null && results.getContent() != null) {
                for (GeoResult<RedisGeoCommands.GeoLocation<String>> r : results.getContent()) {
                    String adId = r.getContent().getName();
                    Double distKm = (r.getDistance() != null) ? r.getDistance().getValue() : null;

                    Map<String, String> meta = hashOps.entries(METADATA_PREFIX + adId);
                    if (meta == null || meta.isEmpty()) continue;

                    String rStr = meta.get("radiusKm");
                    double adRadiusKm;
                    try {
                        adRadiusKm = (rStr != null) ? Double.parseDouble(rStr) : 0d;
                    } catch (NumberFormatException nfe) {
                        log.warn("Bad radius for ad {}: {}", adId, rStr);
                        continue;
                    }

                    if (distKm == null || distKm <= adRadiusKm) {
                        matchedAds.add(meta);
                        if (matchedAds.size() >= MAX_ADS) break;
                    }
                }
            }

            log.info("Matched {} ads for ({}, {}), duration={}", matchedAds.size(), userLat, userLng, duration);

            if (matchedAds.isEmpty()) {
                return generateEmptyVmap();
            }

            final int END_BUF_SEC = 1;  // avoid last-second start
            int durInt = (int) Math.floor(Math.max(1, duration));

            // Decide desired number of breaks purely from duration
            int wantedBreaks;
            if (durInt >= 45)       wantedBreaks = 3;   // e.g. 60s → 3 breaks
            else if (durInt >= 25)  wantedBreaks = 2;   // e.g. 30s → 2 breaks
            else                    wantedBreaks = 1;   // short videos → 1 break

            // Build offsets: preroll + evenly spaced mid-rolls
            List<String> timeOffsets = new ArrayList<>(wantedBreaks);
            timeOffsets.add("start");
            for (int i = 1; i < wantedBreaks; i++) {
                int sec = (int) Math.floor((duration * i) / wantedBreaks);
                sec = Math.max(1, Math.min(sec, durInt - END_BUF_SEC));
                timeOffsets.add(formatTimeOffset(sec));
            }

            // IMPORTANT: pass the full matchedAds; generateVmapXml will reuse the last ad
            String vmap = generateVmapXml(matchedAds, timeOffsets);
            return vmap;        
            } catch (Exception ex) {
            log.error("getVmap failed", ex);
            // avoid 500 to the client; return empty VMAP instead
            return generateEmptyVmap();
        }
    }


    private String generateEmptyVmap() {
        return "<vmap:VMAP xmlns:vmap=\"http://www.iab.net/videosuite/vmap\" version=\"1.0\"></vmap:VMAP>";
    }

    private String formatTimeOffset(int seconds) {
        int hh = seconds / 3600;
        int mm = (seconds % 3600) / 60;
        int ss = seconds % 60;
        return String.format("%02d:%02d:%02d.000", hh, mm, ss);
    }

    // Annotates the video with instructions for when and what ads to play.
    private String generateVmapXml(List<Map<String, String>> ads, List<String> timeOffsets) {
        StringBuilder sb = new StringBuilder();
        sb.append("<vmap:VMAP xmlns:vmap=\"http://www.iab.net/videosuite/vmap\" version=\"1.0\">\n");

        // Loop over the requested break times (NOT the number of ads)
        for (int i = 0; i < timeOffsets.size(); i++) {
            // If there are fewer ads than offsets, reuse the last ad map
            Map<String, String> ad = (ads == null || ads.isEmpty())
                    ? new java.util.HashMap<>()
                    : ads.get(Math.min(i, ads.size() - 1));

            String videoUrl = ad.get("videoUrl");
            String imageUrl = ad.get("imageUrl");

            boolean hasVideo = videoUrl != null && !videoUrl.isBlank();
            boolean hasImage = imageUrl != null && !imageUrl.isBlank();

            String timeOffset = timeOffsets.get(i);

            // break id for readability
            String breakId = timeOffset.equals("start")
                    ? "preroll"
                    : (timeOffset.equals("end") ? "postroll" : "midroll" + i);

            sb.append("  <vmap:AdBreak timeOffset=\"").append(timeOffset)
            .append("\" breakType=\"linear\" breakId=\"").append(breakId).append("\">\n")
            .append("    <vmap:AdSource>\n")
            .append("      <vmap:VASTAdData>\n")
            .append("        <VAST version=\"3.0\">\n")
            .append("          <Ad>\n")
            .append("            <InLine>\n")
            .append("              <AdSystem>Hyperlocal POC</AdSystem>\n")
            .append("              <AdTitle>").append(ad.getOrDefault("description", "Ad")).append("</AdTitle>\n")
            .append("              <Creatives>\n");

            // Linear creative: real video OR stub (for image-only)
            if (hasVideo) {
                sb.append("                <Creative>\n")
                .append("                  <Linear>\n")
                .append("                    <Duration>00:00:15.000</Duration>\n")
                .append("                    <MediaFiles>\n")
                .append("                      <MediaFile delivery=\"progressive\" type=\"video/mp4\">\n")
                .append("                        <![CDATA[").append(videoUrl).append("]]>\n")
                .append("                      </MediaFile>\n")
                .append("                    </MediaFiles>\n")
                .append("                  </Linear>\n")
                .append("                </Creative>\n");
            } else if (hasImage) {

                String stubLinearUrl = ad.getOrDefault("stubLinearUrl", "http://localhost:8080/blank-15s.webm");
                String lowerStub     = stubLinearUrl.toLowerCase();
                String stubType      = lowerStub.endsWith(".webm") ? "video/webm" : "video/mp4";

                sb.append("                <Creative>\n")
                .append("                  <Linear>\n")
                .append("                    <Duration>00:00:15.000</Duration>\n")
                .append("                    <MediaFiles>\n")
                .append("                      <MediaFile delivery=\"progressive\" type=\"").append(stubType).append("\">\n")
                .append("                        <![CDATA[").append(stubLinearUrl).append("]]>\n")
                .append("                      </MediaFile>\n")
                .append("                    </MediaFiles>\n")
                .append("                  </Linear>\n")
                .append("                </Creative>\n");
            } else {
                sb.append("                <!-- No videoUrl or imageUrl provided for this ad -->\n");
            }
           
            //Companion (right side image) alongside the Linear
            if (hasImage) {
            String creativeType = "image/jpeg"; // default
            try {
                String imgLc = imageUrl.toLowerCase();
                if (imgLc.endsWith(".png"))      creativeType = "image/png";
                else if (imgLc.endsWith(".gif")) creativeType = "image/gif";
                } catch (Exception ignore) {
            }

            sb.append("                <Creative>\n")
                .append("                  <CompanionAds>\n")
                .append("                    <Companion width=\"640\" height=\"375\">\n") // keep in sync with CSS
                .append("                      <StaticResource creativeType=\"").append(creativeType).append("\">\n")
                .append("                        <![CDATA[").append(imageUrl).append("]]>\n")
                .append("                      </StaticResource>\n")
                .append("                    </Companion>\n")
                .append("                  </CompanionAds>\n")
                .append("                </Creative>\n");
            }


            sb.append("              </Creatives>\n")
            .append("            </InLine>\n")
            .append("          </Ad>\n")
            .append("        </VAST>\n")
            .append("      </vmap:VASTAdData>\n")
            .append("    </vmap:AdSource>\n")
            .append("  </vmap:AdBreak>\n");
        }

        sb.append("</vmap:VMAP>");
        return sb.toString();
    }


    public Path getCreativePath(Long adId, String type) {
        String fileName = "video".equals(type) ? "video.mp4" : "image.jpg";
        Path path = Paths.get(storagePath + "/" + adId + "/" + fileName);
        if (!Files.exists(path)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Creative not found");
        }
        return path;
    }
}