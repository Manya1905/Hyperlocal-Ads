package com.example.hyperlocalads.controller;

import lombok.Data;

@Data
public class MatchRequest {
    private double lat;
    private double lng;
    private double duration;
}
