import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AdService {

  private apiUrl = 'http://localhost:8080/api/ads'; 

  constructor(private http: HttpClient) { }

  createAd(formData: FormData): Observable<number> {
    return this.http.post<number>(`${this.apiUrl}/create`, formData);
  }

  getVmap(lat: number, lng: number, duration: number): Observable<string> {
    return this.http.post<string>(`${this.apiUrl}/match`, { lat, lng, duration }, { responseType: 'text' as 'json' });
  }
}