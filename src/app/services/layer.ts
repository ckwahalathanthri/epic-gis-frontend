import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LayerService {
  private base = '/layers';
  // Observable stream to notify when a new layer URL is available after upload
  private _layerAdded = new Subject<string>();
  readonly layerAdded$ = this._layerAdded.asObservable();

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

  getGeoJson(id: string) {
    return this.http.get(`${this.base}/${id}/geojson`);
  }

  saveFeatures(id: string, geoJson: any) {
    return this.http.put(`${this.base}/${id}/features`, geoJson);
  }

  listLayers() {
    return this.http.get(`${this.base}`);
  }
}
