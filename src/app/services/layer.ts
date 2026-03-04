import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environments';

export interface UploadedLayer {
  id: string;
  layerName: string;
  originalFormat: string;
  visible: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class LayerService {
  // We use the environment variable so we can change it easily later
  private baseUrl = `${environment.apiUrl}/layers`;

  constructor(private http: HttpClient) {}

  // 1. Upload File
  uploadLayer(file: File, name: string): Observable<UploadedLayer> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    return this.http.post<UploadedLayer>(`${this.baseUrl}/upload`, formData);
  }

  // 2. Get GeoJSON for Cesium
  getLayerGeoJson(layerId: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/${layerId}/geojson`);
  }

  // 3. Update Feature (Edit)
  updateFeature(layerId: string, featureDto: any): Observable<any> {
    // Matches PUT /api/layers/{layerId}/features
    return this.http.put<any>(`${this.baseUrl}/${layerId}/features`, featureDto);
  }
}
