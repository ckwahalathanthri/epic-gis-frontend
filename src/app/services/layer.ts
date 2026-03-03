import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LayerService {
  private base = '/layers';
  // Observable stream to notify when a new layer URL is available after upload
  private _layerAdded = new Subject<string>();
  readonly layerAdded$ = this._layerAdded.asObservable();
  // stream of current features for attributes table
  private _currentFeatures = new Subject<any[]>();
  readonly currentFeatures$ = this._currentFeatures.asObservable();
  // simple toast/message stream
  private _toast = new Subject<string>();
  readonly toast$ = this._toast.asObservable();

  constructor(private http: HttpClient) {}

  upload(file: any): Observable<any> {
    const fd = new (globalThis as any).FormData();
    fd.append('file', file);
    return this.http.post(`${this.base}/upload`, fd);
  }

  uploadFiles(files: any) {
    const fd = new (globalThis as any).FormData();
    // FileList is iterable in modern browsers; support array too
    Array.from(files as any).forEach((f: any, i: number) => {
      // For shapefiles, backend expects zipped shapefile; front-end will send whatever user provided
      fd.append('files', f, f.name);
    });

    return this.http.post(`${this.base}/upload`, fd, {
      reportProgress: true,
      observe: 'events'
    });
  }

  notifyLayerAdded(url: string) {
    if (!url) return;
    this._layerAdded.next(url);
  }

  setCurrentFeatures(features: any[]) {
    this._currentFeatures.next(features ?? []);
  }

  emitToast(msg: string) {
    if (!msg) return;
    this._toast.next(msg);
  }

  getGeoJson(id: string) {
    return this.http.get(`${this.base}/${id}/geojson`);
  }

  saveFeatures(id: string, geoJson: any) {
    return this.http.put(`${this.base}/${id}/features`, geoJson);
  }

  /**
   * Ask the backend to proxy a Feature Service query and return GeoJSON.
   * Backend endpoint should accept `url` query param and return GeoJSON features.
   */
  queryFeatureServiceGeoJson(featureServiceUrl: string) {
    const q = encodeURIComponent(featureServiceUrl);
    return this.http.get(`/layers/proxy/featureGeoJson?url=${q}`);
  }

  /**
   * Ask the backend to proxy an applyEdits request to an ArcGIS Feature Service.
   * `edits` is an object with optional `adds`, `updates`, `deletes` arrays.
   */
  applyEditsProxy(featureServiceUrl: string, edits: any) {
    return this.http.post(`${this.base}/proxy/applyEdits`, { url: featureServiceUrl, edits });
  }

  listLayers() {
    return this.http.get(`${this.base}`);
  }
}
