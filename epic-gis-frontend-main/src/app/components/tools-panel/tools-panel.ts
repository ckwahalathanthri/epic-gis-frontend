import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { LayerService } from '../../services/layer';

declare const console: any;

@Component({
  selector: 'app-tools-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './tools-panel.html',
  styleUrls: ['./tools-panel.css']
})
export class ToolsPanel {
  uploading = false;
  progress = 0;
  message = '';

  // editing fields
  featureServiceUrl = '';
  editObjectId = '';
  editGeometry = '';
  editMessage = '';

  constructor(private layerService: LayerService) {}

  onFile(event: any) {
    const files: any = event.target?.files ?? null;
    if (!files || files.item(0) === null) return;
    this.uploading = true;
    this.progress = 0;
    this.message = '';

    this.layerService.uploadFiles(files).subscribe({
      next: (ev: any) => {
        if (ev.type === 1 && ev.total) {
          this.progress = Math.round(100 * (ev.loaded / ev.total));
          return;
        }
        if (ev.type === 4) {
          const body = ev.body;
          this.message = 'Uploaded: ' + (body?.id ?? 'ok');
          this.uploading = false;
          const layerUrl = body?.layerUrl ?? body?.url ?? body?.data?.layerUrl;
          if (layerUrl) this.layerService.notifyLayerAdded(layerUrl);
        }
      },
      error: (err) => {
        console.error('Upload failed', err);
        this.message = 'Upload failed';
        this.uploading = false;
      }
    });
  }

  async applyEdit() {
    this.editMessage = '';
    if (!this.featureServiceUrl) { this.editMessage = 'Provide Feature Service URL'; return; }
    if (!this.editObjectId) { this.editMessage = 'Provide feature objectId to update'; return; }
    if (!this.editGeometry) { this.editMessage = 'Provide geometry (GeoJSON)'; return; }

    let geom: any = null;
    try { geom = JSON.parse(this.editGeometry); } catch (e) { this.editMessage = 'Invalid JSON geometry'; return; }

    // Build a minimal edit: update by objectId with provided geometry and no attribute changes
    const updates = [{ attributes: { objectId: this.editObjectId }, geometry: geom }];

    this.layerService.applyEditsProxy(this.featureServiceUrl, { updates }).subscribe({
      next: (res: any) => {
        this.editMessage = 'Edit applied';
        // attempt to refresh the layer by notifying map (map will try to re-query)
        this.layerService.notifyLayerAdded(this.featureServiceUrl);
      },
      error: (err) => {
        console.error('Apply edit failed', err);
        this.editMessage = 'Apply edit failed: ' + (err?.message ?? err?.statusText ?? 'error');
      }
    });
  }

  refreshFeatureLayer() {
    if (!this.featureServiceUrl) return;
    // ask backend to return GeoJSON for this FeatureService and add it to map
    this.layerService.queryFeatureServiceGeoJson(this.featureServiceUrl).subscribe({
      next: (geojson: any) => {
        // If backend returns an object with layerUrl, prefer notifying layer URL
        const layerUrl = (geojson && geojson.layerUrl) ? geojson.layerUrl : null;
        if (layerUrl) this.layerService.notifyLayerAdded(layerUrl);
        else this.layerService.notifyLayerAdded(this.featureServiceUrl);
      },
      error: (err) => { console.error('Refresh failed', err); this.editMessage = 'Refresh failed'; }
    });
  }
}
