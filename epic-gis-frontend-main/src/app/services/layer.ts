import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, BehaviorSubject, of } from 'rxjs';
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

  public layerAdded$ = new Subject<string>();
  public toast$ = new Subject<string>();
  public currentFeatures$ = new BehaviorSubject<any[]>([]);

  constructor(private http: HttpClient) {}

  // 1. Upload File
  uploadLayer(file: File, name: string): Observable<UploadedLayer> {
    const formData = new FormData();
    const normalizedName = (name || file.name || 'uploaded-layer').trim();

    formData.append('file', file, file.name);

    // Keep multiple keys for backend compatibility (different controller naming styles)
    formData.append('name', normalizedName);
    formData.append('layerName', normalizedName);
    formData.append('layer_name', normalizedName);

    return this.http.post<UploadedLayer>(`${this.baseUrl}/upload`, formData);
  }

  // 2. Get GeoJSON for Cesium
  getLayerGeoJson(layerId: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/${layerId}/geojson`);
  }

  // 3. Update Feature (Edit)
  updateFeature(layerId: string, featureId: number, properties: any, geometry?: any): Observable<any> {
    const body: any = { id: featureId, properties };
    if (geometry) body.geometry = geometry;
    return this.http.put(`${this.baseUrl}/${layerId}/features`, body);
  }

  // Emits a toast message
  emitToast(msg: string) {
    this.toast$.next(msg);
  }

  // Notifies subscribers that a layer was added
  notifyLayerAdded(url: string) {
    this.layerAdded$.next(url);
  }

  // Updates the feature table
  setCurrentFeatures(features: any[]) {
    this.currentFeatures$.next(features);
  }

  // Adapter for tools-panel (handles FileList)
  uploadFiles(files: FileList): Observable<any> {
    if (!files || files.length === 0) return of(null);
    const file = files[0];
    return this.uploadLayer(file, file.name);
  }

  // Adapter for map.ts (list not implemented in backend yet)
  listLayers(): Observable<UploadedLayer[]> {
    return this.http.get<UploadedLayer[]>(this.baseUrl); 
  }

  // Alias for getLayerGeoJson
  getGeoJson(id: string): Observable<any> {
    return this.getLayerGeoJson(id);
  }

  // Adapter for ArcGIS-style edits in map.ts
  applyEditsProxy(url: string, edits: any): Observable<any> {
    console.log('Applying edits via proxy adapter:', edits);

    const layerId = url.split('/').slice(-2)[0] || 'unknown-layer';
    
    // Check if it's an update
    if (edits.updates && edits.updates.length > 0) {
        const update = edits.updates[0];
        const attributes = update.attributes;
        const id = attributes.objectId || attributes.id || attributes.OBJECTID;
        
        // Map to our FeatureUpdateDTO
        const dto = {
            id: id,
            properties: attributes
            // geometry: ... (ArcGIS editor might send separate geometry)
        };
        return this.updateFeature(layerId, dto.id, dto.properties, undefined);
    }
    
    return of({ success: false, message: 'Operation not supported yet' });
  }

  // Stub for query logic
  queryFeatureServiceGeoJson(url: string): Observable<any> {
    return of({ type: 'FeatureCollection', features: [] });
  }

}
