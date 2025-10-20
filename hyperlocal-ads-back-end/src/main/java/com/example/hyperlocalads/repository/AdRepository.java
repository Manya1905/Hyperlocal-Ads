package com.example.hyperlocalads.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.example.hyperlocalads.entity.Ad;

//JpaRep = CRUD + extra features
public interface AdRepository extends JpaRepository<Ad, Long> {
}
